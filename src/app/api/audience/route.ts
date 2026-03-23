import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type FanLifecycle = 'vip' | 'active' | 'at_risk' | 'churned' | 'cold' | 'lead';

interface FanRecord {
  fan_id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  tier_name: string | null;
  tier_id: string | null;
  subscription_status: 'active' | 'canceled' | 'never';
  subscribed_at: string | null;
  total_spent: number;
  city: string | null;
  state: string | null;
  country: string | null;
  last_active: string;
  engagement_score: number;
  referral_count: number;
  is_subscriber: boolean;
  lifecycle: FanLifecycle;
}

function computeLifecycle(
  subscriptionStatus: 'active' | 'canceled' | 'never',
  engagementScore: number,
  totalSpent: number,
  lastActive: string,
  isImportedLead: boolean,
): FanLifecycle {
  const daysSinceActive = Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000);

  // Churned: had a subscription, canceled it
  if (subscriptionStatus === 'canceled') return 'churned';

  // VIP: active subscriber with high engagement OR high spend ($100+)
  if (subscriptionStatus === 'active' && (engagementScore >= 100 || totalSpent >= 10000)) return 'vip';

  // At Risk: active subscriber but no activity in 7+ days
  if (subscriptionStatus === 'active' && daysSinceActive >= 7) return 'at_risk';

  // Active: subscriber with recent activity
  if (subscriptionStatus === 'active') return 'active';

  // Lead: imported contact or smart link capture, never subscribed
  if (isImportedLead) return 'lead';

  // Cold: non-subscriber with some history but low engagement
  return 'cold';
}

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId');
  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
  }

  // Filters
  const tierFilter = req.nextUrl.searchParams.get('tier'); // tier_id
  const locationFilter = req.nextUrl.searchParams.get('location'); // text search
  const minSpend = req.nextUrl.searchParams.get('minSpend'); // cents
  const maxSpend = req.nextUrl.searchParams.get('maxSpend'); // cents
  const engagement = req.nextUrl.searchParams.get('engagement'); // high/medium/low
  const lifecycleFilter = req.nextUrl.searchParams.get('lifecycle'); // vip/active/at_risk/churned/cold/lead
  const search = req.nextUrl.searchParams.get('search'); // name or email
  const sortBy = req.nextUrl.searchParams.get('sortBy') || 'engagement_score';
  const sortDir = req.nextUrl.searchParams.get('sortDir') || 'desc';
  const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 100);

  // 1. Get all subscriptions (active + canceled) for this artist
  const { data: subscriptions } = await supabaseAdmin
    .from('subscriptions')
    .select('fan_id, tier_id, status, started_at, subscription_tiers(name)')
    .eq('artist_id', artistId);

  // 2. Get all earnings for this artist (spend + location data)
  const { data: earnings } = await supabaseAdmin
    .from('earnings')
    .select('fan_id, gross_amount, fan_city, fan_state, fan_country, created_at')
    .eq('artist_id', artistId);

  // 3. Get referral counts per fan
  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('referrer_fan_id')
    .eq('artist_id', artistId)
    .eq('status', 'active');

  // 4. Get artist's track IDs for play history
  const { data: artistTracks } = await supabaseAdmin
    .from('tracks')
    .select('id')
    .eq('artist_id', artistId)
    .eq('is_active', true);

  const trackIds = (artistTracks || []).map(t => t.id);

  // 5. Get play history for engagement scoring
  let playCounts: Record<string, { total: number; completed: number; lastPlayed: string }> = {};
  if (trackIds.length > 0) {
    const { data: plays } = await supabaseAdmin
      .from('play_history')
      .select('user_id, completed, played_at')
      .in('track_id', trackIds);

    (plays || []).forEach(p => {
      if (!p.user_id) return;
      if (!playCounts[p.user_id]) {
        playCounts[p.user_id] = { total: 0, completed: 0, lastPlayed: p.played_at };
      }
      playCounts[p.user_id].total++;
      if (p.completed) playCounts[p.user_id].completed++;
      if (p.played_at > playCounts[p.user_id].lastPlayed) {
        playCounts[p.user_id].lastPlayed = p.played_at;
      }
    });
  }

  // 6. Get community engagement (comments + likes on artist's posts)
  const { data: communityPosts } = await supabaseAdmin
    .from('community_posts')
    .select('id')
    .eq('artist_id', artistId)
    .eq('is_active', true);

  const postIds = (communityPosts || []).map(p => p.id);

  let commentCounts: Record<string, number> = {};
  let likeCounts: Record<string, number> = {};

  if (postIds.length > 0) {
    const { data: comments } = await supabaseAdmin
      .from('community_comments')
      .select('author_id')
      .in('post_id', postIds)
      .eq('is_active', true);

    (comments || []).forEach(c => {
      if (c.author_id) {
        commentCounts[c.author_id] = (commentCounts[c.author_id] || 0) + 1;
      }
    });

    const { data: likes } = await supabaseAdmin
      .from('community_post_likes')
      .select('user_id')
      .in('post_id', postIds);

    (likes || []).forEach(l => {
      if (l.user_id) {
        likeCounts[l.user_id] = (likeCounts[l.user_id] || 0) + 1;
      }
    });
  }

  // Aggregate per-fan data
  const fanData: Record<string, {
    tier_name: string | null;
    tier_id: string | null;
    subscription_status: 'active' | 'canceled' | 'never';
    subscribed_at: string | null;
    total_spent: number;
    city: string | null;
    state: string | null;
    country: string | null;
    last_earning: string | null;
  }> = {};
  const allFanIds = new Set<string>();

  // From subscriptions
  (subscriptions || []).forEach((s: any) => {
    if (!s.fan_id) return;
    allFanIds.add(s.fan_id);
    fanData[s.fan_id] = {
      tier_name: s.status === 'active' ? (s.subscription_tiers?.name || null) : null,
      tier_id: s.status === 'active' ? s.tier_id : null,
      subscription_status: s.status === 'active' ? 'active' : 'canceled',
      subscribed_at: s.started_at,
      total_spent: 0,
      city: null,
      state: null,
      country: null,
      last_earning: null,
    };
  });

  // From earnings (spend + location)
  (earnings || []).forEach(e => {
    if (!e.fan_id) return;
    allFanIds.add(e.fan_id);
    if (!fanData[e.fan_id]) {
      fanData[e.fan_id] = {
        tier_name: null,
        tier_id: null,
        subscription_status: 'never',
        subscribed_at: null,
        total_spent: 0,
        city: null,
        state: null,
        country: null,
        last_earning: null,
      };
    }
    fanData[e.fan_id].total_spent += e.gross_amount;
    // Use most recent location
    if (e.fan_city && (!fanData[e.fan_id].last_earning || e.created_at > fanData[e.fan_id].last_earning!)) {
      fanData[e.fan_id].city = e.fan_city;
      fanData[e.fan_id].state = e.fan_state;
      fanData[e.fan_id].country = e.fan_country;
      fanData[e.fan_id].last_earning = e.created_at;
    }
  });

  // From referrals (fans who referred others)
  const referralCounts: Record<string, number> = {};
  (referrals || []).forEach(r => {
    referralCounts[r.referrer_fan_id] = (referralCounts[r.referrer_fan_id] || 0) + 1;
    allFanIds.add(r.referrer_fan_id);
    if (!fanData[r.referrer_fan_id]) {
      fanData[r.referrer_fan_id] = {
        tier_name: null,
        tier_id: null,
        subscription_status: 'never',
        subscribed_at: null,
        total_spent: 0,
        city: null,
        state: null,
        country: null,
        last_earning: null,
      };
    }
  });

  if (allFanIds.size === 0) {
    return NextResponse.json({
      fans: [],
      total: 0,
      page,
      limit,
      totalSubscribers: 0,
      totalAudience: 0,
    });
  }

  // Fetch profiles + emails for all fan IDs
  const fanIdArray = Array.from(allFanIds);
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, username, avatar_url')
    .in('id', fanIdArray);

  // Get emails from auth.users via admin API
  const profileMap: Record<string, { display_name: string; avatar_url: string | null }> = {};
  (profiles || []).forEach(p => {
    profileMap[p.id] = {
      display_name: p.display_name || p.username || 'Fan',
      avatar_url: p.avatar_url,
    };
  });

  // Batch fetch emails from auth.users
  const emailMap: Record<string, string> = {};
  // Supabase admin listUsers doesn't support filtering by IDs, so we fetch per-user
  // For performance, we batch in parallel with concurrency limit
  const batchSize = 20;
  for (let i = 0; i < fanIdArray.length; i += batchSize) {
    const batch = fanIdArray.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(id =>
        supabaseAdmin.auth.admin.getUserById(id).then(r => ({
          id,
          email: r.data.user?.email || '',
        })).catch(() => ({ id, email: '' }))
      )
    );
    results.forEach(r => {
      emailMap[r.id] = r.email;
    });
  }

  // Build fan records with engagement scores
  let fans: FanRecord[] = fanIdArray.map(fanId => {
    const data = fanData[fanId] || {
      tier_name: null, tier_id: null, subscription_status: 'never' as const,
      subscribed_at: null, total_spent: 0, city: null, state: null, country: null,
      last_earning: null,
    };
    const profile = profileMap[fanId];
    const plays = playCounts[fanId];
    const comments = commentCounts[fanId] || 0;
    const likes = likeCounts[fanId] || 0;
    const refs = referralCounts[fanId] || 0;

    // Engagement score: (spent/100) + (referrals×50) + (comments×5) + (likes×2) + (plays×1) + (completed×2)
    const spendPoints = Math.round(data.total_spent / 100);
    const engagement_score = spendPoints + (refs * 50) + (comments * 5) + (likes * 2)
      + (plays?.total || 0) + (plays?.completed || 0) * 2;

    // Last active: most recent of subscription, earning, play, or profile creation
    const dates = [
      data.subscribed_at,
      data.last_earning,
      plays?.lastPlayed,
    ].filter(Boolean) as string[];
    const last_active = dates.length > 0
      ? dates.reduce((a, b) => a > b ? a : b)
      : new Date().toISOString();

    const lifecycle = computeLifecycle(
      data.subscription_status,
      engagement_score,
      data.total_spent,
      last_active,
      false,
    );

    return {
      fan_id: fanId,
      display_name: profile?.display_name || 'Fan',
      email: emailMap[fanId] || '',
      avatar_url: profile?.avatar_url || null,
      tier_name: data.tier_name,
      tier_id: data.tier_id,
      subscription_status: data.subscription_status,
      subscribed_at: data.subscribed_at,
      total_spent: data.total_spent,
      city: data.city,
      state: data.state,
      country: data.country,
      last_active,
      engagement_score,
      referral_count: refs,
      is_subscriber: data.subscription_status === 'active',
      lifecycle,
    };
  });

  // Merge fan_contacts (imported/captured leads) with lead scores
  const { data: contacts } = await supabaseAdmin
    .from('fan_contacts')
    .select('id, email, name, phone, city, state, country, source, lead_score, created_at')
    .eq('artist_id', artistId);

  if (contacts && contacts.length > 0) {
    // Deduplicate against existing CRWN fans by email
    const existingEmails = new Set(fans.map(f => f.email.toLowerCase()).filter(Boolean));
    const newContacts = contacts.filter(c => c.email && !existingEmails.has(c.email.toLowerCase()));

    newContacts.forEach(c => {
      fans.push({
        fan_id: c.id,
        display_name: c.name || 'Lead',
        email: c.email || '',
        avatar_url: null,
        tier_name: null,
        tier_id: null,
        subscription_status: 'never',
        subscribed_at: null,
        total_spent: 0,
        city: c.city,
        state: c.state,
        country: c.country,
        last_active: c.created_at,
        engagement_score: c.lead_score || 0,
        referral_count: 0,
        is_subscriber: false,
        lifecycle: 'lead' as FanLifecycle,
      });
    });
  }

  // Lifecycle counts (computed before filters for dashboard summary)
  const lifecycleCounts: Record<string, number> = { vip: 0, active: 0, at_risk: 0, churned: 0, cold: 0, lead: 0 };
  fans.forEach(f => { lifecycleCounts[f.lifecycle] = (lifecycleCounts[f.lifecycle] || 0) + 1; });

  // Apply filters
  if (tierFilter) {
    fans = fans.filter(f => f.tier_id === tierFilter);
  }
  if (locationFilter) {
    const loc = locationFilter.toLowerCase();
    fans = fans.filter(f =>
      (f.city && f.city.toLowerCase().includes(loc)) ||
      (f.state && f.state.toLowerCase().includes(loc)) ||
      (f.country && f.country.toLowerCase().includes(loc))
    );
  }
  if (minSpend) {
    fans = fans.filter(f => f.total_spent >= parseInt(minSpend));
  }
  if (maxSpend) {
    fans = fans.filter(f => f.total_spent <= parseInt(maxSpend));
  }
  if (engagement) {
    // Compute thresholds from the data
    const scores = fans.map(f => f.engagement_score).sort((a, b) => a - b);
    const p33 = scores[Math.floor(scores.length * 0.33)] || 0;
    const p66 = scores[Math.floor(scores.length * 0.66)] || 0;
    if (engagement === 'high') fans = fans.filter(f => f.engagement_score > p66);
    else if (engagement === 'medium') fans = fans.filter(f => f.engagement_score > p33 && f.engagement_score <= p66);
    else if (engagement === 'low') fans = fans.filter(f => f.engagement_score <= p33);
  }
  if (lifecycleFilter) {
    fans = fans.filter(f => f.lifecycle === lifecycleFilter);
  }
  if (search) {
    const q = search.toLowerCase();
    fans = fans.filter(f =>
      f.display_name.toLowerCase().includes(q) ||
      f.email.toLowerCase().includes(q)
    );
  }

  // Counts before pagination (lifecycle counts computed before search filter for summary)
  const totalSubscribers = fans.filter(f => f.is_subscriber).length;
  const totalAudience = fans.length;

  // Sort
  const validSortFields: (keyof FanRecord)[] = [
    'display_name', 'tier_name', 'total_spent', 'subscribed_at',
    'last_active', 'engagement_score', 'referral_count',
  ];
  const sortField = validSortFields.includes(sortBy as keyof FanRecord)
    ? (sortBy as keyof FanRecord)
    : 'engagement_score';

  fans.sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });

  // Paginate
  const offset = (page - 1) * limit;
  const paginatedFans = fans.slice(offset, offset + limit);

  return NextResponse.json({
    fans: paginatedFans,
    total: totalAudience,
    page,
    limit,
    totalSubscribers,
    totalAudience,
    lifecycleCounts,
  });
}
