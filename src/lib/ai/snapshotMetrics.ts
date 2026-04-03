import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Captures a lightweight metric snapshot for an artist at a point in time.
 * Used to measure before/after impact of agent actions.
 */
export interface MetricSnapshot {
  mrr: number;           // cents
  activeSubs: number;
  churnRate: number;     // percentage
  arpu: number;          // cents
  playsThisWeek: number;
  communityPostsThisMonth: number;
  atRiskFans: number;
  revenueThisWeek: number; // cents
}

export async function snapshotArtistMetrics(
  supabaseAdmin: SupabaseClient,
  artistId: string,
): Promise<MetricSnapshot> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Active subscriptions + tier prices for MRR
  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('id, fan_id, tier_id, status, created_at, canceled_at')
    .eq('artist_id', artistId);

  const allSubs = subs || [];
  const activeSubs = allSubs.filter(s => s.status === 'active');
  const activeCount = activeSubs.length;

  // Tier prices
  const { data: tiers } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id, price')
    .eq('artist_id', artistId)
    .eq('is_active', true);

  const tierPriceMap: Record<string, number> = {};
  (tiers || []).forEach(t => { tierPriceMap[t.id] = t.price; });

  let mrr = 0;
  activeSubs.forEach(s => { mrr += tierPriceMap[s.tier_id] || 0; });
  const arpu = activeCount > 0 ? Math.round(mrr / activeCount) : 0;

  // Churn rate
  const newThisMonth = allSubs.filter(s => s.created_at >= thisMonthStart).length;
  const churnedThisMonth = allSubs.filter(s =>
    s.status === 'canceled' && s.canceled_at && s.canceled_at >= thisMonthStart
  ).length;
  const monthStartActive = activeCount - newThisMonth + churnedThisMonth;
  const churnRate = monthStartActive > 0
    ? Math.round((churnedThisMonth / monthStartActive) * 10000) / 100
    : 0;

  // Plays this week
  const { data: tracks } = await supabaseAdmin
    .from('tracks')
    .select('id')
    .eq('artist_id', artistId)
    .eq('is_active', true);

  const trackIds = (tracks || []).map(t => t.id);
  let playsThisWeek = 0;
  if (trackIds.length > 0) {
    const { count } = await supabaseAdmin
      .from('play_history')
      .select('id', { count: 'exact', head: true })
      .in('track_id', trackIds)
      .gte('played_at', weekAgo);
    playsThisWeek = count || 0;
  }

  // Community posts this month
  const { count: postsCount } = await supabaseAdmin
    .from('community_posts')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .gte('created_at', thisMonthStart);

  // At-risk fans (14+ days inactive)
  let atRiskFans = 0;
  const activeFanIds = activeSubs.map(s => s.fan_id);
  if (activeFanIds.length > 0 && trackIds.length > 0) {
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString();
    const { data: recentPlays } = await supabaseAdmin
      .from('play_history')
      .select('user_id')
      .in('track_id', trackIds)
      .in('user_id', activeFanIds)
      .gte('played_at', fourteenDaysAgo);

    const activeFans = new Set((recentPlays || []).map(p => p.user_id));
    atRiskFans = activeFanIds.filter(id => !activeFans.has(id)).length;
  }

  // Revenue this week
  const { data: earnings } = await supabaseAdmin
    .from('earnings')
    .select('net_amount')
    .eq('artist_id', artistId)
    .gte('created_at', weekAgo);

  const revenueThisWeek = (earnings || []).reduce((s, e) => s + e.net_amount, 0);

  return {
    mrr,
    activeSubs: activeCount,
    churnRate,
    arpu,
    playsThisWeek,
    communityPostsThisMonth: postsCount || 0,
    atRiskFans,
    revenueThisWeek,
  };
}

/**
 * Compute the delta between two snapshots.
 */
export function computeOutcomeDelta(
  baseline: MetricSnapshot,
  outcome: MetricSnapshot,
): Record<string, number> {
  return {
    mrr: outcome.mrr - baseline.mrr,
    activeSubs: outcome.activeSubs - baseline.activeSubs,
    churnRate: Math.round((outcome.churnRate - baseline.churnRate) * 100) / 100,
    arpu: outcome.arpu - baseline.arpu,
    playsThisWeek: outcome.playsThisWeek - baseline.playsThisWeek,
    communityPostsThisMonth: outcome.communityPostsThisMonth - baseline.communityPostsThisMonth,
    atRiskFans: outcome.atRiskFans - baseline.atRiskFans,
    revenueThisWeek: outcome.revenueThisWeek - baseline.revenueThisWeek,
  };
}
