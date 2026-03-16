import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper function for grouping by period
function getPeriodsForRange(period: string, count: number): { label: string; start: Date; end: Date }[] {
  const now = new Date();
  const periods: { label: string; start: Date; end: Date }[] = [];

  if (period === 'daily') {
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      periods.push({ label, start: d, end });
    }
  } else if (period === 'weekly') {
    for (let i = count - 1; i >= 0; i--) {
      const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const weekStart = new Date(weekEnd.getTime() - 6 * 24 * 60 * 60 * 1000);
      const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      periods.push({ label, start: weekStart, end: new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 23, 59, 59) });
    }
  } else {
    // monthly (existing behavior)
    for (let i = count - 1; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = mStart.toLocaleDateString('en-US', { month: 'short' });
      periods.push({ label, start: mStart, end: mEnd });
    }
  }
  return periods;
}

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId');
  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
  }

  const dailyPeriods = getPeriodsForRange('daily', 30);
  const weeklyPeriods = getPeriodsForRange('weekly', 12);
  const monthlyPeriods = getPeriodsForRange('monthly', 6);

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  // ---- EARNINGS DATA ----
  const { data: allEarnings } = await supabaseAdmin
    .from('earnings')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  const earnings = allEarnings || [];

  // Revenue periods
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const revenueToday = earnings.filter(e => e.created_at >= todayStart).reduce((s, e) => s + e.net_amount, 0);
  const revenueThisWeek = earnings.filter(e => e.created_at >= weekAgo).reduce((s, e) => s + e.net_amount, 0);
  const revenueThisMonth = earnings.filter(e => e.created_at >= thisMonthStart).reduce((s, e) => s + e.net_amount, 0);
  const revenueLastMonth = earnings.filter(e => e.created_at >= lastMonthStart && e.created_at <= lastMonthEnd).reduce((s, e) => s + e.net_amount, 0);
  const revenueAllTime = earnings.reduce((s, e) => s + e.net_amount, 0);

  // Revenue by type
  const revenueByType: Record<string, number> = {};
  earnings.forEach(e => {
    revenueByType[e.type] = (revenueByType[e.type] || 0) + e.net_amount;
  });

  // Revenue trend (replaces monthlyTrend)
  const buildRevenueTrend = (periods: { label: string; start: Date; end: Date }[]) =>
    periods.map(p => {
      const periodEarnings = earnings.filter(e =>
        e.created_at >= p.start.toISOString() && e.created_at <= p.end.toISOString()
      );
      return {
        label: p.label,
        revenue: periodEarnings.reduce((s, e) => s + e.net_amount, 0),
        earnings_count: periodEarnings.length,
      };
    });
  const revenueTrend = {
    daily: buildRevenueTrend(dailyPeriods),
    weekly: buildRevenueTrend(weeklyPeriods),
    monthly: buildRevenueTrend(monthlyPeriods),
  };

  // ---- SUBSCRIPTION DATA ----
  const { data: allSubs } = await supabaseAdmin
    .from('subscriptions')
    .select('id, fan_id, tier_id, status, created_at, canceled_at, current_period_end')
    .eq('artist_id', artistId);

  const subs = allSubs || [];
  const activeSubs = subs.filter(s => s.status === 'active');
  const canceledThisMonth = subs.filter(s => s.status === 'canceled' && s.canceled_at && s.canceled_at >= thisMonthStart);
  const newThisMonth = subs.filter(s => s.created_at >= thisMonthStart);

  // MRR: sum of tier prices for all active subscriptions
  const tierIds = [...new Set(activeSubs.map(s => s.tier_id).filter(Boolean))];
  const { data: tiers } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id, name, price')
    .in('id', tierIds.length > 0 ? tierIds : ['00000000-0000-0000-0000-000000000000']);

  const tierMap: Record<string, { name: string; price: number }> = {};
  (tiers || []).forEach(t => { tierMap[t.id] = { name: t.name, price: t.price }; });

  const mrr = activeSubs.reduce((sum, s) => sum + (tierMap[s.tier_id]?.price || 0), 0);

  // ARPU
  const arpu = activeSubs.length > 0 ? Math.round(mrr / activeSubs.length) : 0;

  // Churn rate (canceled this month / total at start of month)
  const totalAtMonthStart = subs.filter(s =>
    s.created_at < thisMonthStart && (s.status === 'active' || (s.canceled_at && s.canceled_at >= thisMonthStart))
  ).length;
  const churnRate = totalAtMonthStart > 0 ? (canceledThisMonth.length / totalAtMonthStart) * 100 : 0;

  // LTV = ARPU / monthly churn rate (if churn > 0)
  const monthlyChurnDecimal = churnRate / 100;
  const ltv = monthlyChurnDecimal > 0 ? Math.round(arpu / monthlyChurnDecimal) : arpu * 24;

  // Subscribers by tier
  const subsByTier: Record<string, number> = {};
  activeSubs.forEach(s => {
    const tierName = tierMap[s.tier_id]?.name || 'Unknown';
    subsByTier[tierName] = (subsByTier[tierName] || 0) + 1;
  });

  // Subscriber trend (replaces growth)
  const buildSubTrend = (periods: { label: string; start: Date; end: Date }[]) =>
    periods.map(p => {
      const newInPeriod = subs.filter(s =>
        s.created_at >= p.start.toISOString() && s.created_at <= p.end.toISOString()
      ).length;
      const churnedInPeriod = subs.filter(s =>
        s.canceled_at && s.canceled_at >= p.start.toISOString() && s.canceled_at <= p.end.toISOString()
      ).length;
      const activeAtEnd = subs.filter(s =>
        s.created_at <= p.end.toISOString() && (s.status === 'active' || (s.canceled_at && s.canceled_at > p.end.toISOString()))
      ).length;
      return { label: p.label, total: activeAtEnd, new: newInPeriod, churned: churnedInPeriod };
    });
  const subscriberTrend = {
    daily: buildSubTrend(dailyPeriods),
    weekly: buildSubTrend(weeklyPeriods),
    monthly: buildSubTrend(monthlyPeriods),
  };

  // ---- PLAYS DATA ----
  // Get plays for this artist's tracks
  const { data: artistTracks } = await supabaseAdmin
    .from('tracks')
    .select('id, play_count')
    .eq('artist_id', artistId)
    .eq('is_active', true);

  const trackIds = (artistTracks || []).map(t => t.id);
  const totalPlays = (artistTracks || []).reduce((s, t) => s + (t.play_count || 0), 0);

  const buildPlaysTrend = (periods: { label: string; start: Date; end: Date }[], plays: any[]) =>
    periods.map(p => ({
      label: p.label,
      plays: plays.filter(pl =>
        pl.played_at >= p.start.toISOString() && pl.played_at <= p.end.toISOString()
      ).length,
    }));

  let playsTrend: any = { daily: [], weekly: [], monthly: [] };
  if (trackIds.length > 0) {
    const { data: allPlays } = await supabaseAdmin
      .from('play_history')
      .select('played_at, track_id')
      .in('track_id', trackIds)
      .gte('played_at', dailyPeriods[0].start.toISOString())
      .order('played_at', { ascending: true });
    const plays = allPlays || [];
    playsTrend = {
      daily: buildPlaysTrend(dailyPeriods, plays),
      weekly: buildPlaysTrend(weeklyPeriods, plays),
      monthly: buildPlaysTrend(monthlyPeriods, plays),
    };
  } else {
    playsTrend = {
      daily: dailyPeriods.map(p => ({ label: p.label, plays: 0 })),
      weekly: weeklyPeriods.map(p => ({ label: p.label, plays: 0 })),
      monthly: monthlyPeriods.map(p => ({ label: p.label, plays: 0 })),
    };
  }

  // ---- TOP FANS ----
  const fanSpend: Record<string, number> = {};
  const fanNames: Record<string, string> = {};
  earnings.forEach(e => {
    if (e.fan_id) {
      fanSpend[e.fan_id] = (fanSpend[e.fan_id] || 0) + e.net_amount;
      if (e.metadata?.fanDisplayName) fanNames[e.fan_id] = e.metadata.fanDisplayName;
    }
  });
  const topFans = Object.entries(fanSpend)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([fanId, total]) => ({ fanId, name: fanNames[fanId] || 'Fan', totalSpent: total }));

  // ---- GEOGRAPHY ----
  const cityCount: Record<string, number> = {};
  const stateCount: Record<string, number> = {};
  const countryCount: Record<string, number> = {};

  earnings.forEach(e => {
    if (e.fan_city) cityCount[e.fan_city] = (cityCount[e.fan_city] || 0) + 1;
    if (e.fan_state) stateCount[e.fan_state] = (stateCount[e.fan_state] || 0) + 1;
    if (e.fan_country) countryCount[e.fan_country] = (countryCount[e.fan_country] || 0) + 1;
  });

  const topCities = Object.entries(cityCount).sort(([, a], [, b]) => b - a).slice(0, 10).map(([name, count]) => ({ name, count }));
  const topStates = Object.entries(stateCount).sort(([, a], [, b]) => b - a).slice(0, 10).map(([name, count]) => ({ name, count }));
  const topCountries = Object.entries(countryCount).sort(([, a], [, b]) => b - a).slice(0, 10).map(([name, count]) => ({ name, count }));

  // Revenue by geo
  const revenueByCity: Record<string, number> = {};
  const revenueByState: Record<string, number> = {};
  earnings.forEach(e => {
    if (e.fan_city) revenueByCity[e.fan_city] = (revenueByCity[e.fan_city] || 0) + e.net_amount;
    if (e.fan_state) revenueByState[e.fan_state] = (revenueByState[e.fan_state] || 0) + e.net_amount;
  });

  const topCitiesByRevenue = Object.entries(revenueByCity).sort(([, a], [, b]) => b - a).slice(0, 10).map(([name, revenue]) => ({ name, revenue }));
  const topStatesByRevenue = Object.entries(revenueByState).sort(([, a], [, b]) => b - a).slice(0, 10).map(([name, revenue]) => ({ name, revenue }));

  return NextResponse.json({
    revenue: {
      today: revenueToday,
      thisWeek: revenueThisWeek,
      thisMonth: revenueThisMonth,
      lastMonth: revenueLastMonth,
      allTime: revenueAllTime,
      byType: revenueByType,
      trend: revenueTrend,
    },
    subscribers: {
      active: activeSubs.length,
      newThisMonth: newThisMonth.length,
      churnedThisMonth: canceledThisMonth.length,
      churnRate: Number(churnRate.toFixed(1)),
      mrr,
      arpu,
      ltv,
      byTier: Object.entries(subsByTier).map(([tierName, count]) => ({ tierName, count })),
      trend: subscriberTrend,
    },
    plays: {
      total: totalPlays,
      trend: playsTrend,
    },
    topFans,
    geography: {
      topCities,
      topStates,
      topCountries,
      topCitiesByRevenue,
      topStatesByRevenue,
    },
  });
}
