// Shared audience resolution: turns an artist_id into scored, classified fan
// records, and applies the same filter vocabulary that saved_segments stores.
//
// This is the SINGLE definition of what "vip" / "at_risk" / "churned" mean.
// /api/audience (the Fan CRM table) and /api/messages/broadcast both read it,
// so a segment saved in the CRM selects exactly the people a broadcast reaches.
// Duplicating these thresholds in a second file is how the two silently diverge.
//
// All reads use the service-role client, so every CALLER is responsible for
// proving the caller owns `artistId` before invoking buildAudience.

export type FanLifecycle = 'vip' | 'active' | 'at_risk' | 'churned' | 'cold' | 'lead';

export interface FanRecord {
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
  churn_risk_score: number; // 0-100, only meaningful for (ex-)subscribers
  upgrade_likelihood_score: number; // 0-100, "how ready to spend more / start paying"
}

// Mirrors the `filters` JSONB shape stored on saved_segments, plus tierIds for
// the broadcast tier chips (saved segments only ever carry a single `tier`).
export interface AudienceFilters {
  tier?: string | null;
  tierIds?: string[] | null;
  location?: string | null;
  minSpend?: number | string | null;
  maxSpend?: number | string | null;
  engagement?: string | null;
  lifecycle?: string | null;
  search?: string | null;
}

// Churn risk: chance an active paying relationship is about to be lost.
// Leads / never-subscribed fans have nothing to churn from → 0.
export function computeChurnRisk(
  subscriptionStatus: 'active' | 'canceled' | 'never',
  lastActive: string,
): number {
  if (subscriptionStatus === 'never') return 0;
  if (subscriptionStatus === 'canceled') return 90;
  const daysSinceActive = Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000);
  if (daysSinceActive >= 30) return 75;
  if (daysSinceActive >= 14) return 55;
  if (daysSinceActive >= 7) return 35;
  return 10;
}

// Upgrade likelihood: readiness to start paying (free fan) or spend more (subscriber).
export function computeUpgradeLikelihood(
  subscriptionStatus: 'active' | 'canceled' | 'never',
  engagementScore: number,
  totalSpent: number,
): number {
  if (subscriptionStatus === 'never') {
    // High-intent free fan: lots of engagement but hasn't paid yet
    if (engagementScore >= 50) return 70;
    if (engagementScore >= 20) return 45;
    if (engagementScore >= 5) return 25;
    return 5;
  }
  if (subscriptionStatus === 'active') {
    // Superfan on a modest plan: high engagement relative to spend
    if (engagementScore >= 100 && totalSpent < 5000) return 65;
    if (engagementScore >= 50) return 40;
    return 15;
  }
  return 0; // canceled: win-back, not upgrade
}

export function computeLifecycle(
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

interface BuildAudienceOptions {
  /**
   * Emails come from auth.users one call per fan, which is the slowest part of
   * this function. Broadcast delivers over DMs and never needs them.
   * Forced on when includeLeads is true, because lead dedup keys on email.
   */
  includeEmails?: boolean;
  /**
   * fan_contacts rows (imported/captured leads) have no profiles row, so they
   * cannot receive a DM and cannot join a squad. Callers that act on fan_id
   * against a profiles FK must pass false.
   */
  includeLeads?: boolean;
}

/**
 * Build the full scored audience for an artist.
 * `lifecycleCounts` is computed over the UNFILTERED set, for dashboard summaries.
 */
export async function buildAudience(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  artistId: string,
  options: BuildAudienceOptions = {},
): Promise<{ fans: FanRecord[]; lifecycleCounts: Record<string, number> }> {
  const includeLeads = options.includeLeads ?? true;
  // Lead dedup matches on email, so leads imply emails.
  const includeEmails = includeLeads ? true : (options.includeEmails ?? true);

  // 1. All subscriptions (active + canceled) for this artist
  const { data: subscriptions } = await supabaseAdmin
    .from('subscriptions')
    // The FK must be NAMED. subscriptions has TWO foreign keys to subscription_tiers
    // (tier_id and pending_tier_id, the latter added by the downgrade migration), so a
    // bare `subscription_tiers(...)` is ambiguous and PostgREST rejects the WHOLE query
    // with PGRST201. supabase-js returns that as {data: null}, which this code read as
    // "no subscribers": every artist's Fan CRM showed zero members while the rows existed.
    .select('fan_id, tier_id, status, started_at, subscription_tiers!subscriptions_tier_id_fkey(name)')
    .eq('artist_id', artistId);

  // 2. Earnings (spend + location data)
  const { data: earnings } = await supabaseAdmin
    .from('earnings')
    .select('fan_id, gross_amount, fan_city, fan_state, fan_country, created_at')
    .eq('artist_id', artistId);

  // 3. Referral counts per fan
  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('referrer_fan_id')
    .eq('artist_id', artistId)
    .eq('status', 'active');

  // 4. Artist's track IDs for play history
  const { data: artistTracks } = await supabaseAdmin
    .from('tracks')
    .select('id')
    .eq('artist_id', artistId)
    .eq('is_active', true);

  const trackIds = (artistTracks || []).map((t: { id: string }) => t.id);

  // 5. Play history for engagement scoring
  const playCounts: Record<string, { total: number; completed: number; lastPlayed: string }> = {};
  if (trackIds.length > 0) {
    const { data: plays } = await supabaseAdmin
      .from('play_history')
      .select('user_id, completed, played_at')
      .in('track_id', trackIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (plays || []).forEach((p: any) => {
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

  // 6. Community engagement (comments + likes on the artist's posts)
  const { data: communityPosts } = await supabaseAdmin
    .from('community_posts')
    .select('id')
    .eq('artist_id', artistId)
    .eq('is_active', true);

  const postIds = (communityPosts || []).map((p: { id: string }) => p.id);

  const commentCounts: Record<string, number> = {};
  const likeCounts: Record<string, number> = {};

  if (postIds.length > 0) {
    const { data: comments } = await supabaseAdmin
      .from('community_comments')
      .select('author_id')
      .in('post_id', postIds)
      .eq('is_active', true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (comments || []).forEach((c: any) => {
      if (c.author_id) commentCounts[c.author_id] = (commentCounts[c.author_id] || 0) + 1;
    });

    const { data: likes } = await supabaseAdmin
      .from('community_post_likes')
      .select('user_id')
      .in('post_id', postIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (likes || []).forEach((l: any) => {
      if (l.user_id) likeCounts[l.user_id] = (likeCounts[l.user_id] || 0) + 1;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (earnings || []).forEach((e: any) => {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (referrals || []).forEach((r: any) => {
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

  const emptyCounts: Record<string, number> = { vip: 0, active: 0, at_risk: 0, churned: 0, cold: 0, lead: 0 };
  if (allFanIds.size === 0 && !includeLeads) {
    return { fans: [], lifecycleCounts: emptyCounts };
  }

  const fanIdArray = Array.from(allFanIds);

  const profileMap: Record<string, { display_name: string; avatar_url: string | null }> = {};
  const emailMap: Record<string, string> = {};

  if (fanIdArray.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .in('id', fanIdArray);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (profiles || []).forEach((p: any) => {
      profileMap[p.id] = {
        display_name: p.display_name || p.username || 'Fan',
        avatar_url: p.avatar_url,
      };
    });

    if (includeEmails) {
      // Supabase admin listUsers doesn't support filtering by IDs, so fetch per-user,
      // batched in parallel with a concurrency limit.
      const batchSize = 20;
      for (let i = 0; i < fanIdArray.length; i += batchSize) {
        const batch = fanIdArray.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((id) =>
            supabaseAdmin.auth.admin.getUserById(id)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .then((r: any) => ({ id, email: r.data.user?.email || '' }))
              .catch(() => ({ id, email: '' }))
          )
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        results.forEach((r: any) => { emailMap[r.id] = r.email; });
      }
    }
  }

  // Build fan records with engagement scores
  const fans: FanRecord[] = fanIdArray.map((fanId) => {
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

    // Last active: most recent of subscription, earning, play, or now
    const dates = [
      data.subscribed_at,
      data.last_earning,
      plays?.lastPlayed,
    ].filter(Boolean) as string[];
    const last_active = dates.length > 0
      ? dates.reduce((a, b) => (a > b ? a : b))
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
      churn_risk_score: computeChurnRisk(data.subscription_status, last_active),
      upgrade_likelihood_score: computeUpgradeLikelihood(
        data.subscription_status, engagement_score, data.total_spent,
      ),
    };
  });

  // Merge fan_contacts (imported/captured leads) with lead scores
  if (includeLeads) {
    const { data: contacts } = await supabaseAdmin
      .from('fan_contacts')
      .select('id, email, name, phone, city, state, country, source, lead_score, created_at')
      .eq('artist_id', artistId);

    if (contacts && contacts.length > 0) {
      // Deduplicate against existing CRWN fans by email
      const existingEmails = new Set(fans.map((f) => f.email.toLowerCase()).filter(Boolean));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newContacts = contacts.filter((c: any) => c.email && !existingEmails.has(c.email.toLowerCase()));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      newContacts.forEach((c: any) => {
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
          churn_risk_score: 0,
          upgrade_likelihood_score: (c.lead_score || 0) >= 50 ? 60 : (c.lead_score || 0) >= 20 ? 35 : 15,
        });
      });
    }
  }

  // Lifecycle counts (computed before filters, for dashboard summary)
  const lifecycleCounts: Record<string, number> = { ...emptyCounts };
  fans.forEach((f) => { lifecycleCounts[f.lifecycle] = (lifecycleCounts[f.lifecycle] || 0) + 1; });

  return { fans, lifecycleCounts };
}

/**
 * Apply the saved_segments filter vocabulary to a built audience.
 * `engagement` is a percentile band computed over the fans passed in, matching
 * the Fan CRM table's behavior (the bands shift as other filters narrow the set).
 */
export function applyAudienceFilters(input: FanRecord[], filters: AudienceFilters): FanRecord[] {
  let fans = input;

  if (filters.tier) {
    fans = fans.filter((f) => f.tier_id === filters.tier);
  }
  if (filters.tierIds && filters.tierIds.length > 0) {
    const wanted = new Set(filters.tierIds);
    fans = fans.filter((f) => f.tier_id && wanted.has(f.tier_id));
  }
  if (filters.location) {
    const loc = String(filters.location).toLowerCase();
    fans = fans.filter((f) =>
      (f.city && f.city.toLowerCase().includes(loc)) ||
      (f.state && f.state.toLowerCase().includes(loc)) ||
      (f.country && f.country.toLowerCase().includes(loc))
    );
  }
  if (filters.minSpend !== undefined && filters.minSpend !== null && filters.minSpend !== '') {
    const min = typeof filters.minSpend === 'number' ? filters.minSpend : parseInt(filters.minSpend, 10);
    if (Number.isFinite(min)) fans = fans.filter((f) => f.total_spent >= min);
  }
  if (filters.maxSpend !== undefined && filters.maxSpend !== null && filters.maxSpend !== '') {
    const max = typeof filters.maxSpend === 'number' ? filters.maxSpend : parseInt(filters.maxSpend, 10);
    if (Number.isFinite(max)) fans = fans.filter((f) => f.total_spent <= max);
  }
  if (filters.engagement) {
    const scores = fans.map((f) => f.engagement_score).sort((a, b) => a - b);
    const p33 = scores[Math.floor(scores.length * 0.33)] || 0;
    const p66 = scores[Math.floor(scores.length * 0.66)] || 0;
    if (filters.engagement === 'high') fans = fans.filter((f) => f.engagement_score > p66);
    else if (filters.engagement === 'medium') fans = fans.filter((f) => f.engagement_score > p33 && f.engagement_score <= p66);
    else if (filters.engagement === 'low') fans = fans.filter((f) => f.engagement_score <= p33);
  }
  if (filters.lifecycle) {
    fans = fans.filter((f) => f.lifecycle === filters.lifecycle);
  }
  if (filters.search) {
    const q = String(filters.search).toLowerCase();
    fans = fans.filter((f) =>
      f.display_name.toLowerCase().includes(q) ||
      f.email.toLowerCase().includes(q)
    );
  }

  return fans;
}
