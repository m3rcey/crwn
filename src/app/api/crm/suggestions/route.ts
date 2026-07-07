import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

export interface CrmSuggestion {
  id: string;
  type: 'thank' | 'winback' | 'upgrade' | 'badge' | 'reward';
  icon: string;
  title: string;
  body: string;
  fanId?: string;
  fanName?: string;
  cta: { label: string; action: string }; // action is a client hint, e.g. "award_badge:promoter"
}

async function getCallerArtistId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: artist } = await supabase
    .from('artist_profiles').select('id').eq('user_id', user.id).single();
  return artist?.id ?? null;
}

// GET /api/crm/suggestions — rule-based next-best-actions. These are RECOMMENDATIONS
// only; nothing is sent or awarded here. The artist acts on them in the drawer.
export async function GET() {
  const artistId = await getCallerArtistId();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const suggestions: CrmSuggestion[] = [];

  // Pull the cheap signals in parallel
  const [
    { data: referrals },
    { data: canceledSubs },
    { data: leads },
    { data: promoterBadges },
    { data: thankActions },
  ] = await Promise.all([
    supabaseAdmin.from('referrals')
      .select('referrer_fan_id').eq('artist_id', artistId).eq('status', 'active'),
    supabaseAdmin.from('subscriptions')
      .select('fan_id').eq('artist_id', artistId).eq('status', 'canceled'),
    supabaseAdmin.from('fan_contacts')
      .select('id, name, lead_score').eq('artist_id', artistId).gte('lead_score', 50),
    supabaseAdmin.from('fan_badge_awards')
      .select('fan_id').eq('artist_id', artistId).eq('badge_key', 'promoter'),
    supabaseAdmin.from('fan_growth_actions')
      .select('fan_id, action_type').eq('artist_id', artistId).eq('action_type', 'thank'),
  ]);

  // Tally referrers
  const refTally: Record<string, number> = {};
  (referrals || []).forEach((r: any) => {
    if (r.referrer_fan_id) refTally[r.referrer_fan_id] = (refTally[r.referrer_fan_id] || 0) + 1;
  });
  const topReferrers = Object.entries(refTally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const thankedFans = new Set((thankActions || []).map((a: any) => a.fan_id));
  const promoterBadgeFans = new Set((promoterBadges || []).map((b: any) => b.fan_id));

  // Names for the fans we might reference
  const referrerIds = topReferrers.map(([id]) => id);
  const nameMap: Record<string, string> = {};
  if (referrerIds.length > 0) {
    const { data: profs } = await supabaseAdmin
      .from('profiles').select('id, display_name, username').in('id', referrerIds);
    (profs || []).forEach((p: any) => { nameMap[p.id] = p.display_name || p.username || 'A fan'; });
  }

  // 1. Thank a top promoter who hasn't been thanked
  const unthanked = topReferrers.find(([id, count]) => count >= 2 && !thankedFans.has(id));
  if (unthanked) {
    const [id, count] = unthanked;
    suggestions.push({
      id: `thank-${id}`,
      type: 'thank',
      icon: '📣',
      title: `Thank ${nameMap[id] || 'a top promoter'}`,
      body: `They brought in ${count} active subscriber${count !== 1 ? 's' : ''} and haven't been thanked.`,
      fanId: id,
      fanName: nameMap[id],
      cta: { label: 'Thank them', action: 'thank' },
    });
  }

  // 2. Give the Promoter badge to a strong referrer who lacks it
  const badgeCandidate = topReferrers.find(([id, count]) => count >= 3 && !promoterBadgeFans.has(id));
  if (badgeCandidate) {
    const [id, count] = badgeCandidate;
    suggestions.push({
      id: `badge-${id}`,
      type: 'badge',
      icon: '🏅',
      title: `Give ${nameMap[id] || 'this fan'} the Promoter badge`,
      body: `${count} referrals and no badge yet. Recognize them.`,
      fanId: id,
      fanName: nameMap[id],
      cta: { label: 'Award badge', action: 'award_badge:promoter' },
    });
  }

  // 3. Win back churned supporters
  const churnedCount = (canceledSubs || []).length;
  if (churnedCount >= 1) {
    suggestions.push({
      id: 'winback',
      type: 'winback',
      icon: '↩️',
      title: `Re-engage ${churnedCount} churned supporter${churnedCount !== 1 ? 's' : ''}`,
      body: 'They canceled but already know your work. A win-back offer converts warm.',
      cta: { label: 'View churned', action: 'segment:churned' },
    });
  }

  // 4. Convert high-intent free fans / leads
  const leadCount = (leads || []).length;
  if (leadCount >= 1) {
    suggestions.push({
      id: 'upgrade',
      type: 'upgrade',
      icon: '⬆️',
      title: `${leadCount} high-intent free fan${leadCount !== 1 ? 's' : ''} ready to convert`,
      body: 'High lead scores, not paying yet. Send them a founder offer.',
      cta: { label: 'View leads', action: 'segment:lead' },
    });
  }

  return NextResponse.json({ suggestions });
}
