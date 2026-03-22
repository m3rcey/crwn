import { SupabaseClient } from '@supabase/supabase-js';

export interface ArtistDataForAI {
  artistId: string;
  artistName: string;
  platformTier: string;
  isFoundingArtist: boolean;
  revenue: {
    thisWeek: number;
    lastWeek: number;
    thisMonth: number;
    lastMonth: number;
    byType: Record<string, number>;
  };
  subscribers: {
    active: number;
    newThisWeek: number;
    churnedThisWeek: number;
    atRiskFans: { fanId: string; name: string; daysSinceActive: number }[];
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
    .select('user_id, platform_tier, is_founding_artist')
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

  // ---- HAS ACTIVITY ----
  const hasActivity = earnings.length > 0 || activeSubs.length > 0 || totalPlays > 0;

  return {
    artistId,
    artistName,
    platformTier,
    isFoundingArtist,
    revenue: {
      thisWeek: revenueThisWeek,
      lastWeek: revenueLastWeek,
      thisMonth: revenueThisMonth,
      lastMonth: revenueLastMonth,
      byType: revenueByType,
    },
    subscribers: {
      active: activeSubs.length,
      newThisWeek,
      churnedThisWeek,
      atRiskFans,
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
    topFans,
    hasActivity,
  };
}
