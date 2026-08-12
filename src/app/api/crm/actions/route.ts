import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { awardFanBadge } from '@/lib/fanBadges';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

async function getCaller(): Promise<{ artistId: string; userId: string; artistName: string } | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: artist } = await supabase
    .from('artist_profiles').select('id, user_id').eq('user_id', user.id).single();
  if (!artist) return null;
  const { data: profile } = await supabase
    .from('profiles').select('display_name').eq('id', user.id).single();
  return { artistId: artist.id, userId: user.id, artistName: profile?.display_name || 'The artist' };
}

const ALLOWED = ['message', 'award_badge', 'invite_squad', 'assign_mission', 'reward', 'commission_boost', 'thank', 'tag', 'custom'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep a badge label short enough to read in a notification title. */
function bounded(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

/**
 * Is this fan genuinely in THIS artist's audience?
 *
 * `fanId` arrives in the request body, and awarding a badge sends the target a
 * notification whose title the caller controls. Without this check, any artist
 * account could interrupt any user on the platform on demand, which is exactly
 * the path the interruption governor exists to prevent (SEC-018). The audience
 * is the same set the Fan CRM builds from: subscribers (any status), anyone who
 * has paid, referrers, and imported contacts (whose id is a fan_contacts row,
 * not a user, which is why that check is by `id`).
 */
async function fanIsInArtistAudience(artistId: string, fanId: unknown): Promise<boolean> {
  if (typeof fanId !== 'string' || !UUID_RE.test(fanId)) return false;

  const linked = async (table: string, column: string): Promise<boolean> => {
    const { data } = await supabaseAdmin
      .from(table)
      .select('id')
      .eq('artist_id', artistId)
      .eq(column, fanId)
      .limit(1);
    return !!data?.length;
  };

  const checks = await Promise.all([
    linked('subscriptions', 'fan_id'),
    linked('earnings', 'fan_id'),
    linked('referrals', 'referrer_fan_id'),
    linked('fan_contacts', 'id'),
  ]);

  return checks.some(Boolean);
}

// POST /api/crm/actions  { fanId, actionType, metadata?, source? }
// Logs an artist->fan action. For 'award_badge' it also performs the award.
// (No auto-messaging/sending here — messaging is a client deep-link, this only logs intent.)
export async function POST(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const { fanId, actionType, metadata = {}, source = 'manual' } = await req.json();
  if (!fanId || !actionType) {
    return NextResponse.json({ error: 'Missing fanId or actionType' }, { status: 400 });
  }
  if (!ALLOWED.includes(actionType)) {
    return NextResponse.json({ error: 'Invalid actionType' }, { status: 400 });
  }

  // An action can interrupt the target (a badge notifies them), so it is capped
  // like every other interruption path on the platform.
  if (!(await checkRateLimit(caller.userId, 'crm-action', 3600, 120))) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }

  if (!(await fanIsInArtistAudience(caller.artistId, fanId))) {
    return NextResponse.json({ error: 'That fan is not in your audience' }, { status: 403 });
  }

  let status: 'pending' | 'done' | 'failed' = 'done';

  // Side effect: award_badge actually grants the badge (artist-approved by definition, the artist clicked it)
  if (actionType === 'award_badge') {
    const badgeKey = bounded(metadata.badgeKey, 60);
    if (!badgeKey || !/^[a-z0-9_-]+$/i.test(badgeKey)) {
      return NextResponse.json({ error: 'Missing or invalid badgeKey' }, { status: 400 });
    }
    const ok = await awardFanBadge(supabaseAdmin, {
      artistId: caller.artistId,
      fanId,
      badgeKey,
      label: bounded(metadata.label, 40),
      icon: bounded(metadata.icon, 8),
      source: 'manual',
      awardedBy: caller.userId,
      artistName: caller.artistName,
    });
    status = ok ? 'done' : 'failed';
  }

  const { data, error } = await supabaseAdmin
    .from('fan_growth_actions')
    .insert({
      artist_id: caller.artistId,
      fan_id: fanId,
      action_type: actionType,
      status,
      source: ['manual', 'ai', 'playbook'].includes(source) ? source : 'manual',
      metadata,
      created_by: caller.userId,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ action: data });
}
