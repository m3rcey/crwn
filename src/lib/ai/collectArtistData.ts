import { SupabaseClient } from '@supabase/supabase-js';

export interface ArtistDataForAI {
  artistId: string;
  artistName: string;
  artistSlug: string;
  platformTier: string;
  isFoundingArtist: boolean;
  revenue: {
    thisWeek: number;
    lastWeek: number;
    thisMonth: number;
    lastMonth: number;
    byType: Record<string, number>;
  };
  // Unit economics from analytics dashboard
  unitEconomics: {
    mrr: number; // monthly recurring revenue in cents
    arpu: number; // average revenue per user in cents
    ltv: number; // lifetime value in cents
    churnRate: number; // percentage
    avgLifespanMonths: number;
    revenuePerVisitor: number; // cents, 30-day trailing
    revenuePerPlay: number; // cents
    uniqueVisitors30d: number;
    salesVelocity: number; // new subs per month
  };
  subscribers: {
    active: number;
    newThisWeek: number;
    newThisMonth: number;
    churnedThisWeek: number;
    churnedThisMonth: number;
    atRiskFans: { fanId: string; name: string; daysSinceActive: number }[];
    fanActivity: { active: number; atRisk: number; churning: number };
    billingMix: { monthly: number; annual: number };
    byTier: { name: string; count: number; price: number }[];
  };
  retention: {
    cohorts: { month: string; size: number; m1: number | null; m2: number | null; m3: number | null }[];
    cancelReasons: { reason: string; count: number }[];
    recentCancelFeedback: string[];
    npsAvg: number | null;
    surveyWhyStayed: string[];
  };
  plays: {
    total: number;
    thisWeek: number;
    lastWeek: number;
    topTracks: { title: string; plays: number }[];
  };
  community: {
    postsThisMonth: number;
    avgLikes: number;
    avgComments: number;
    lastPostDate: string | null;
  };
  products: {
    expiringWithin7Days: { title: string; expiresAt: string }[];
  };
  geography: {
    topCities: { city: string; count: number }[];
    topCitiesByRevenue: { city: string; revenue: number }[];
  };
  referrals: {
    totalReferrals: number;
    activeReferrals: number;
    totalCommission: number;
    conversionRate: number;
  };
  syncOpportunities: {
    genreMatches: { id: string; title: string; deadline: string | null; priceMin: number; priceMax: number; type: string; genres: string[] }[];
    locationMatches: { id: string; title: string; deadline: string | null; priceMin: number; priceMax: number; type: string }[];
  };
  artistGenres: string[];
  artistState: string | null;
  topFans: { fanId: string; name: string; totalSpent: number }[];
  hasActivity: boolean;
}

export async function collectArtistData(
  supabaseAdmin: SupabaseClient,
  artistId: string
): Promise<ArtistDataForAI> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  // Get artist profile + display_name from profiles table
  const { data: artistProfile } = await supabaseAdmin
    .from('artist_profiles')
    .select('user_id, platform_tier, is_founding_artist, genres, state, slug')
    .eq('id', artistId)
    .single();

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('id', artistProfile?.user_id)
    .single();

  const platformTier = artistProfile?.platform_tier || 'starter';
  const isFoundingArtist = artistProfile?.is_founding_artist ?? false;
  const artistName = profile?.display_name || 'Artist';
  const artistSlug = artistProfile?.slug || '';
  const artistGenres: string[] = artistProfile?.genres || [];
  const artistState: string | null = artistProfile?.state || null;

  // ---- EARNINGS ----
  const { data: allEarnings } = await supabaseAdmin
    .from('earnings')
    .select('fan_id, type, net_amount, created_at, metadata')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  const earnings = allEarnings || [];

  const revenueThisWeek = earnings.filter(e => e.created_at >= weekAgo).reduce((s, e) => s + e.net_amount, 0);
  const revenueLastWeek = earnings
    .filter(e => e.created_at >= twoWeeksAgo && e.created_at < weekAgo)
    .reduce((s, e) => s + e.net_amount, 0);
  const revenueThisMonth = earnings.filter(e => e.created_at >= thisMonthStart).reduce((s, e) => s + e.net_amount, 0);
  const revenueLastMonth = earnings
    .filter(e => e.created_at >= lastMonthStart && e.created_at <= lastMonthEnd)
    .reduce((s, e) => s + e.net_amount, 0);

  const revenueByType: Record<string, number> = {};
  earnings.forEach(e => {
    revenueByType[e.type] = (revenueByType[e.type] || 0) + e.net_amount;
  });

  // ---- SUBSCRIBERS ----
  const { data: allSubs } = await supabaseAdmin
    .from('subscriptions')
    .select('id, fan_id, tier_id, status, created_at, canceled_at')
    .eq('artist_id', artistId);

  const subs = allSubs || [];
  const activeSubs = subs.filter(s => s.status === 'active');
  const newThisWeek = subs.filter(s => s.created_at >= weekAgo).length;
  const churnedThisWeek = subs.filter(s => s.status === 'canceled' && s.canceled_at && s.canceled_at >= weekAgo).length;

  // ---- AT-RISK FANS (no play in 14+ days) ----
  const { data: artistTracks } = await supabaseAdmin
    .from('tracks')
    .select('id, title, play_count')
    .eq('artist_id', artistId)
    .eq('is_active', true);

  const tracks = artistTracks || [];
  const trackIds = tracks.map(t => t.id);
  const totalPlays = tracks.reduce((s, t) => s + (t.play_count || 0), 0);

  const activeFanIds = activeSubs.map(s => s.fan_id);
  const atRiskFans: { fanId: string; name: string; daysSinceActive: number }[] = [];

  if (activeFanIds.length > 0 && trackIds.length > 0) {
    const { data: recentPlays } = await supabaseAdmin
      .from('play_history')
      .select('user_id, played_at')
      .in('track_id', trackIds)
      .in('user_id', activeFanIds)
      .order('played_at', { ascending: false });

    // Build last activity map
    const fanLastPlay: Record<string, Date> = {};
    (recentPlays || []).forEach(p => {
      const d = new Date(p.played_at);
      if (!fanLastPlay[p.user_id] || d > fanLastPlay[p.user_id]) {
        fanLastPlay[p.user_id] = d;
      }
    });

    // Also check earnings for activity
    earnings.forEach(e => {
      if (e.fan_id && activeFanIds.includes(e.fan_id)) {
        const d = new Date(e.created_at);
        if (!fanLastPlay[e.fan_id] || d > fanLastPlay[e.fan_id]) {
          fanLastPlay[e.fan_id] = d;
        }
      }
    });

    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    const atRiskIds: string[] = [];

    activeFanIds.forEach(fanId => {
      const lastActive = fanLastPlay[fanId];
      if (!lastActive || (now.getTime() - lastActive.getTime()) >= fourteenDays) {
        const daysSince = lastActive
          ? Math.floor((now.getTime() - lastActive.getTime()) / (24 * 60 * 60 * 1000))
          : 999;
        atRiskIds.push(fanId);
        atRiskFans.push({ fanId, name: '', daysSinceActive: daysSince });
      }
    });

    // Get names for at-risk fans
    if (atRiskIds.length > 0) {
      const { data: fanProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, display_name')
        .in('id', atRiskIds);

      const nameMap: Record<string, string> = {};
      (fanProfiles || []).forEach(p => { nameMap[p.id] = p.display_name || 'Fan'; });
      atRiskFans.forEach(f => { f.name = nameMap[f.fanId] || 'Fan'; });
    }
  }

  // ---- PLAYS ----
  let playsThisWeek = 0;
  let playsLastWeek = 0;
  if (trackIds.length > 0) {
    const { count: thisWeekCount } = await supabaseAdmin
      .from('play_history')
      .select('id', { count: 'exact', head: true })
      .in('track_id', trackIds)
      .gte('played_at', weekAgo);

    const { count: lastWeekCount } = await supabaseAdmin
      .from('play_history')
      .select('id', { count: 'exact', head: true })
      .in('track_id', trackIds)
      .gte('played_at', twoWeeksAgo)
      .lt('played_at', weekAgo);

    playsThisWeek = thisWeekCount || 0;
    playsLastWeek = lastWeekCount || 0;
  }

  const topTracks = tracks
    .sort((a, b) => (b.play_count || 0) - (a.play_count || 0))
    .slice(0, 5)
    .map(t => ({ title: t.title, plays: t.play_count || 0 }));

  // ---- COMMUNITY ----
  const { data: recentPosts } = await supabaseAdmin
    .from('community_posts')
    .select('id, created_at')
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .gte('created_at', thisMonthStart)
    .order('created_at', { ascending: false });

  const posts = recentPosts || [];
  const postsThisMonth = posts.length;

  // Get last post date (any time, not just this month)
  const { data: lastPost } = await supabaseAdmin
    .from('community_posts')
    .select('created_at')
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let avgLikes = 0;
  let avgComments = 0;
  if (posts.length > 0) {
    const postIds = posts.map(p => p.id);
    const { count: likeCount } = await supabaseAdmin
      .from('community_post_likes')
      .select('id', { count: 'exact', head: true })
      .in('post_id', postIds);

    const { count: commentCount } = await supabaseAdmin
      .from('community_comments')
      .select('id', { count: 'exact', head: true })
      .in('post_id', postIds);

    avgLikes = Math.round((likeCount || 0) / posts.length);
    avgComments = Math.round((commentCount || 0) / posts.length);
  }

  // ---- PRODUCTS (expiring soon) ----
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: expiringProducts } = await supabaseAdmin
    .from('products')
    .select('title, expires_at')
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .not('expires_at', 'is', null)
    .gte('expires_at', now.toISOString())
    .lte('expires_at', sevenDaysFromNow);

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
    .slice(0, 5)
    .map(([fanId, total]) => ({ fanId, name: fanNames[fanId] || 'Fan', totalSpent: total }));

  // ---- SYNC OPPORTUNITIES (genre/location matches with upcoming deadlines) ----
  const { data: syncOpps } = await supabaseAdmin
    .from('sync_opportunities')
    .select('id, title, deadline, price_min, price_max, type, genres, location_state, is_online, event_date')
    .eq('is_active', true)
    .order('deadline', { ascending: true });

  const allSyncOpps = (syncOpps || []).filter(opp => {
    // Filter out expired opps
    const deadlineDate = opp.deadline ? new Date(opp.deadline) : null;
    const eventDate = opp.event_date ? new Date(opp.event_date) : null;
    const expiryDate = deadlineDate || eventDate;
    return !expiryDate || expiryDate >= now;
  });

  const genreMatchOpps = allSyncOpps.filter(opp => {
    const oppGenres: string[] = opp.genres || [];
    return oppGenres.includes('all') || artistGenres.some(g => oppGenres.includes(g));
  }).slice(0, 5).map(opp => ({
    id: opp.id,
    title: opp.title,
    deadline: opp.deadline,
    priceMin: opp.price_min || 0,
    priceMax: opp.price_max || 0,
    type: opp.type || 'brief',
    genres: opp.genres || [],
  }));

  const locationMatchOpps = allSyncOpps.filter(opp => {
    return artistState && (opp.is_online || opp.location_state === artistState);
  }).slice(0, 5).map(opp => ({
    id: opp.id,
    title: opp.title,
    deadline: opp.deadline,
    priceMin: opp.price_min || 0,
    priceMax: opp.price_max || 0,
    type: opp.type || 'brief',
  }));

  // ---- UNIT ECONOMICS ----
  // MRR: sum of active subscription tier prices
  const { data: tierList } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id, name, price, is_active')
    .eq('artist_id', artistId)
    .eq('is_active', true);

  const allTiers = tierList || [];
  const tierPriceMap: Record<string, number> = {};
  const tierNameMap: Record<string, string> = {};
  allTiers.forEach(t => { tierPriceMap[t.id] = t.price; tierNameMap[t.id] = t.name; });

  let mrr = 0;
  const subsByTier: Record<string, number> = {};
  activeSubs.forEach(s => {
    const price = tierPriceMap[s.tier_id] || 0;
    mrr += price;
    subsByTier[s.tier_id] = (subsByTier[s.tier_id] || 0) + 1;
  });

  const activeCount = activeSubs.length;
  const arpu = activeCount > 0 ? Math.round(mrr / activeCount) : 0;

  // Churn rate: canceled this month / (active at month start)
  const newThisMonth = subs.filter(s => s.created_at >= thisMonthStart).length;
  const churnedThisMonth = subs.filter(s => s.status === 'canceled' && s.canceled_at && s.canceled_at >= thisMonthStart).length;
  const monthStartActive = activeCount - newThisMonth + churnedThisMonth;
  const churnRate = monthStartActive > 0 ? Math.round((churnedThisMonth / monthStartActive) * 10000) / 100 : 0;

  const avgLifespanMonths = churnRate > 0 ? Math.round((100 / churnRate) * 10) / 10 : 24;
  const ltv = churnRate > 0 ? Math.round(arpu / (churnRate / 100)) : arpu * 24;

  // Revenue per visitor (30-day trailing)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const { data: visitorData } = await supabaseAdmin
    .from('page_visits')
    .select('visitor_id')
    .eq('artist_id', artistId)
    .gte('visited_at', thirtyDaysAgo);

  const uniqueVisitors30d = new Set((visitorData || []).map(v => v.visitor_id)).size;
  const revenue30d = earnings.filter(e => e.created_at >= thirtyDaysAgo).reduce((s, e) => s + e.net_amount, 0);
  const revenuePerVisitor = uniqueVisitors30d > 0 ? Math.round(revenue30d / uniqueVisitors30d) : 0;
  const revenuePerPlay = totalPlays > 0 ? Math.round(earnings.reduce((s, e) => s + e.net_amount, 0) / totalPlays) : 0;

  // Sales velocity: trailing 3-month average new subscribers per month
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
  const newLast3Months = subs.filter(s => s.created_at >= threeMonthsAgo).length;
  const salesVelocity = Math.round(newLast3Months / 3 * 10) / 10;

  // ---- FAN ACTIVITY HEALTH ----
  let activeFanCount = 0;
  let atRiskFanCount = 0;
  let churningFanCount = 0;

  if (activeFanIds.length > 0 && trackIds.length > 0) {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const twentyOneDaysAgo = new Date(now.getTime() - 21 * 86400000);

    const { data: fanPlays } = await supabaseAdmin
      .from('play_history')
      .select('user_id, played_at')
      .in('track_id', trackIds)
      .in('user_id', activeFanIds);

    const fanLastActivity: Record<string, Date> = {};
    (fanPlays || []).forEach(p => {
      const d = new Date(p.played_at);
      if (!fanLastActivity[p.user_id] || d > fanLastActivity[p.user_id]) fanLastActivity[p.user_id] = d;
    });

    activeFanIds.forEach(fanId => {
      const last = fanLastActivity[fanId];
      if (last && last >= sevenDaysAgo) activeFanCount++;
      else if (last && last >= twentyOneDaysAgo) atRiskFanCount++;
      else churningFanCount++;
    });
  }

  // Billing mix
  // We don't have billing_interval stored, so approximate: all are monthly for now
  const billingMix = { monthly: activeCount, annual: 0 };

  // Subscribers by tier
  const byTier = Object.entries(subsByTier).map(([tierId, count]) => ({
    name: tierNameMap[tierId] || 'Unknown',
    count,
    price: tierPriceMap[tierId] || 0,
  }));

  // ---- RETENTION / CHURN REASONS ----
  const { data: cancelReasons } = await supabaseAdmin
    .from('cancellation_reasons')
    .select('reason, feedback')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false })
    .limit(20);

  const reasonCounts: Record<string, number> = {};
  const recentCancelFeedback: string[] = [];
  (cancelReasons || []).forEach(cr => {
    if (cr.reason) reasonCounts[cr.reason] = (reasonCounts[cr.reason] || 0) + 1;
    if (cr.feedback) recentCancelFeedback.push(cr.feedback);
  });

  const cancelReasonList = Object.entries(reasonCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => ({ reason, count }));

  // Loyalty survey
  const { data: surveys } = await supabaseAdmin
    .from('survey_responses')
    .select('nps_score, why_stayed, feedback')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false })
    .limit(20);

  const surveyList = surveys || [];
  const npsScores = surveyList.filter(s => s.nps_score !== null).map(s => s.nps_score);
  const npsAvg = npsScores.length > 0 ? Math.round(npsScores.reduce((s: number, n: number) => s + n, 0) / npsScores.length * 10) / 10 : null;
  const surveyWhyStayed = surveyList.filter(s => s.why_stayed).map(s => s.why_stayed).slice(0, 5);

  // Cohort retention (last 3 months)
  const cohorts: { month: string; size: number; m1: number | null; m2: number | null; m3: number | null }[] = [];
  for (let i = 3; i >= 1; i--) {
    const cohortStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const cohortEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const cohortSubs = subs.filter(s => {
      const d = new Date(s.created_at);
      return d >= cohortStart && d <= cohortEnd;
    });
    if (cohortSubs.length === 0) continue;

    const stillActiveAtM = (monthsOut: number) => {
      const checkDate = new Date(cohortStart.getFullYear(), cohortStart.getMonth() + monthsOut + 1, 0, 23, 59, 59);
      if (checkDate > now) return null;
      const retained = cohortSubs.filter(s => {
        if (s.status === 'active') return true;
        if (s.canceled_at && new Date(s.canceled_at) > checkDate) return true;
        return false;
      }).length;
      return Math.round((retained / cohortSubs.length) * 100);
    };

    cohorts.push({
      month: cohortStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      size: cohortSubs.length,
      m1: stillActiveAtM(1),
      m2: stillActiveAtM(2),
      m3: stillActiveAtM(3),
    });
  }

  // ---- GEOGRAPHY ----
  const { data: geoData } = await supabaseAdmin
    .from('earnings')
    .select('fan_city, fan_state, net_amount')
    .eq('artist_id', artistId)
    .not('fan_city', 'is', null);

  const cityCount: Record<string, number> = {};
  const cityRevenue: Record<string, number> = {};
  (geoData || []).forEach(e => {
    const city = e.fan_city || 'Unknown';
    cityCount[city] = (cityCount[city] || 0) + 1;
    cityRevenue[city] = (cityRevenue[city] || 0) + e.net_amount;
  });

  const topCities = Object.entries(cityCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([city, count]) => ({ city, count }));

  const topCitiesByRevenue = Object.entries(cityRevenue)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([city, revenue]) => ({ city, revenue }));

  // ---- REFERRALS ----
  const { data: referralData } = await supabaseAdmin
    .from('referrals')
    .select('id, is_active, commission_paid')
    .eq('artist_id', artistId);

  const refs = referralData || [];
  const totalReferrals = refs.length;
  const activeReferrals = refs.filter(r => r.is_active).length;
  const totalCommission = refs.reduce((s, r) => s + (r.commission_paid || 0), 0);
  const referralConversionRate = activeCount > 0 ? Math.round((activeReferrals / activeCount) * 10000) / 100 : 0;

  // ---- HAS ACTIVITY ----
  const hasActivity = earnings.length > 0 || activeSubs.length > 0 || totalPlays > 0;

  return {
    artistId,
    artistName,
    artistSlug,
    platformTier,
    isFoundingArtist,
    revenue: {
      thisWeek: revenueThisWeek,
      lastWeek: revenueLastWeek,
      thisMonth: revenueThisMonth,
      lastMonth: revenueLastMonth,
      byType: revenueByType,
    },
    unitEconomics: {
      mrr,
      arpu,
      ltv,
      churnRate,
      avgLifespanMonths,
      revenuePerVisitor,
      revenuePerPlay,
      uniqueVisitors30d,
      salesVelocity,
    },
    subscribers: {
      active: activeCount,
      newThisWeek,
      newThisMonth,
      churnedThisWeek,
      churnedThisMonth,
      atRiskFans,
      fanActivity: { active: activeFanCount, atRisk: atRiskFanCount, churning: churningFanCount },
      billingMix,
      byTier,
    },
    retention: {
      cohorts,
      cancelReasons: cancelReasonList,
      recentCancelFeedback: recentCancelFeedback.slice(0, 5),
      npsAvg,
      surveyWhyStayed,
    },
    plays: {
      total: totalPlays,
      thisWeek: playsThisWeek,
      lastWeek: playsLastWeek,
      topTracks,
    },
    community: {
      postsThisMonth,
      avgLikes,
      avgComments,
      lastPostDate: lastPost?.created_at || null,
    },
    products: {
      expiringWithin7Days: (expiringProducts || []).map(p => ({
        title: p.title,
        expiresAt: p.expires_at,
      })),
    },
    geography: {
      topCities,
      topCitiesByRevenue,
    },
    referrals: {
      totalReferrals,
      activeReferrals,
      totalCommission,
      conversionRate: referralConversionRate,
    },
    syncOpportunities: {
      genreMatches: genreMatchOpps,
      locationMatches: locationMatchOpps,
    },
    artistGenres,
    artistState,
    topFans,
    hasActivity,
  };
}
