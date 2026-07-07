import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { awardFanBadge } from '@/lib/fanBadges';

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

  let status: 'pending' | 'done' | 'failed' = 'done';

  // Side effect: award_badge actually grants the badge (artist-approved by definition — the artist clicked it)
  if (actionType === 'award_badge') {
    const badgeKey = metadata.badgeKey;
    if (!badgeKey) return NextResponse.json({ error: 'Missing badgeKey' }, { status: 400 });
    const ok = await awardFanBadge(supabaseAdmin, {
      artistId: caller.artistId,
      fanId,
      badgeKey,
      label: metadata.label,
      icon: metadata.icon,
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
