// Quest Engine — completion evaluator + completion transaction.
//
// Progress is DERIVED, never client-asserted: read from authoritative domain
// tables (subscriptions, subscription_tiers, products, tracks, road_campaigns)
// and the shared fan_events log. This is also what finally lets a fan mission
// advance past 'joined' — the "no event source exists yet" note in
// schema-phase2-mission-participants.sql.
//
// All functions take the SERVICE-ROLE admin client (they bypass RLS by design)
// and are best-effort: they log and degrade rather than throw on a bad read.

import { levelFromXp } from './progression';
import { getLimit } from '@/lib/platformTier';
import { awardFanBadge } from '@/lib/fanBadges';
import { createNotification } from '@/lib/notifications';
import type {
  QuestInstance,
  EvalResult,
  CompletionResult,
  QuestReward,
  QuestRole,
  CompletionCondition,
} from './types';

const EMPTY_EVAL: EvalResult = { done: false, progressPercent: 0, current: 0, target: 1 };

function pct(current: number, target: number): number {
  if (target <= 0) return current > 0 ? 100 : 0;
  return Math.min(100, Math.round((current / target) * 100));
}

// --- fan_events counting (supports fan-scoped counts the shared helper lacks) ---

async function countEvents(
  admin: any,
  opts: {
    artistId: string | null;
    fanId?: string;
    eventType: string;
    refKind?: string;
    refId?: string;
    sinceDays?: number;
  },
): Promise<number> {
  try {
    let q = admin.from('fan_events').select('id', { count: 'exact', head: true }).eq('event_type', opts.eventType);
    if (opts.artistId) q = q.eq('artist_id', opts.artistId);
    if (opts.fanId) q = q.eq('fan_id', opts.fanId);
    if (opts.refKind) q = q.eq('ref_kind', opts.refKind);
    if (opts.refId) q = q.eq('ref_id', opts.refId);
    if (opts.sinceDays) {
      const since = new Date(Date.now() - opts.sinceDays * 86400000).toISOString();
      q = q.gte('created_at', since);
    }
    const { count } = await q;
    return count || 0;
  } catch (err) {
    console.error('[quests] countEvents failed:', err);
    return 0;
  }
}

async function countActive(admin: any, table: string, match: Record<string, unknown>): Promise<number> {
  try {
    let q = admin.from(table).select('id', { count: 'exact', head: true });
    for (const [k, v] of Object.entries(match)) {
      // is_active was added to tracks/products/tiers AFTER rows existed, and the
      // onboarding creators don't set it, so many real rows have is_active = NULL.
      // NULL means "active" (not soft-deleted). Match TRUE-or-NULL, exclude only FALSE.
      if (k === 'is_active' && v === true) {
        q = q.not('is_active', 'is', false);
      } else {
        q = q.eq(k, v);
      }
    }
    const { count } = await q;
    return count || 0;
  } catch (err) {
    console.error(`[quests] countActive(${table}) failed:`, err);
    return 0;
  }
}

// --- Small authoritative predicates reused by the Level 5-10 composites. All read
// service-role, NULL-safe on is_active, and degrade to false/0 rather than throw. ---

async function countPaidTiers(admin: any, artistId: string): Promise<number> {
  const { count } = await admin
    .from('subscription_tiers')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .not('is_active', 'is', false)
    .gt('price', 0);
  return count || 0;
}

async function countFreeTiers(admin: any, artistId: string): Promise<number> {
  const { count } = await admin
    .from('subscription_tiers')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .not('is_active', 'is', false)
    .eq('price', 0);
  return count || 0;
}

async function countActiveSupporters(admin: any, artistId: string): Promise<number> {
  const { count } = await admin
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .eq('status', 'active');
  return count || 0;
}

async function isStripeConnected(admin: any, artistId: string): Promise<boolean> {
  const { data } = await admin
    .from('artist_profiles')
    .select('stripe_connect_id, activation_milestones')
    .eq('id', artistId)
    .maybeSingle();
  const m = (data?.activation_milestones || {}) as Record<string, unknown>;
  return !!data?.stripe_connect_id && !!m.stripe_connected;
}

async function isReferralsOn(admin: any, artistId: string): Promise<boolean> {
  const { data } = await admin
    .from('artist_profiles')
    .select('referral_commission_rate, clipper_commission_rate, clipper_campaign_started_at')
    .eq('id', artistId)
    .maybeSingle();
  const refOn = Number(data?.referral_commission_rate ?? 0) > 0;
  const clipOn = Number(data?.clipper_commission_rate ?? 0) > 0 && !!data?.clipper_campaign_started_at;
  return refOn || clipOn;
}

async function hasClosedCampaign(admin: any, artistId: string): Promise<boolean> {
  const { count } = await admin
    .from('road_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .in('status', ['reached', 'archived']);
  return (count || 0) > 0;
}

async function hasSmartLink(admin: any, artistId: string): Promise<boolean> {
  const { count } = await admin
    .from('smart_links')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .not('is_active', 'is', false);
  return (count || 0) > 0;
}

// Net direct-to-fan revenue in cents (excludes refunds/disputes). Summed in JS —
// per-user cadence, acceptable. Never trusts a client value.
async function netRevenueCents(admin: any, artistId: string): Promise<number> {
  const { data } = await admin
    .from('earnings')
    .select('net_amount, type')
    .eq('artist_id', artistId)
    .in('type', ['subscription', 'purchase', 'booking', 'live_ticket']);
  return (data ?? []).reduce((sum: number, r: any) => sum + (Number(r?.net_amount) || 0), 0);
}

async function evalDomain(admin: any, instance: QuestInstance, cond: Extract<CompletionCondition, { kind: 'domain' }>): Promise<EvalResult> {
  const artistId = instance.artist_id;
  const userId = instance.user_id;
  const target = cond.count ?? 1;

  switch (cond.check) {
    case 'artist_has_tier': {
      const n = artistId ? await countActive(admin, 'subscription_tiers', { artist_id: artistId, is_active: true }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_has_product': {
      const n = artistId ? await countActive(admin, 'products', { artist_id: artistId, is_active: true }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_has_free_tier': {
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count } = await admin
          .from('subscription_tiers')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .not('is_active', 'is', false)
          .eq('price', 0);
        const n = count || 0;
        return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_has_paid_offer': {
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count: tierC } = await admin
          .from('subscription_tiers')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .not('is_active', 'is', false)
          .gt('price', 0);
        let n = tierC || 0;
        if (n === 0) {
          const { count: prodC } = await admin
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('artist_id', artistId)
            .not('is_active', 'is', false)
            .gt('price', 0);
          n = prodC || 0;
        }
        return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_has_offer': {
      if (!artistId) return EMPTY_EVAL;
      const tiers = await countActive(admin, 'subscription_tiers', { artist_id: artistId, is_active: true });
      const products = tiers > 0 ? 0 : await countActive(admin, 'products', { artist_id: artistId, is_active: true });
      const n = tiers + products;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_has_track': {
      const n = artistId ? await countActive(admin, 'tracks', { artist_id: artistId, is_active: true }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_has_campaign': {
      const n = artistId ? await countActive(admin, 'road_campaigns', { artist_id: artistId }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_has_avatar': {
      try {
        const { data } = await admin.from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
        const has = !!data?.avatar_url;
        return { done: has, progressPercent: has ? 100 : 0, current: has ? 1 : 0, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_supporter_count': {
      const n = artistId ? await countActive(admin, 'subscriptions', { artist_id: artistId, status: 'active' }) : 0;
      return { done: n >= target, progressPercent: pct(n, target), current: n, target };
    }

    // ---- Rise Mode journey: Tutorial + Levels 1-4 (all authoritative, never client-asserted) ----

    case 'artist_profile_complete': {
      // L1 boss: a credible public profile = tagline + banner + bio all present.
      if (!artistId) return EMPTY_EVAL;
      try {
        const { data: ap } = await admin
          .from('artist_profiles')
          .select('tagline, banner_url')
          .eq('id', artistId)
          .maybeSingle();
        const { data: prof } = await admin.from('profiles').select('bio').eq('id', userId).maybeSingle();
        const parts = [
          !!(ap?.tagline && String(ap.tagline).trim()),
          !!ap?.banner_url,
          !!(prof?.bio && String(prof.bio).trim()),
        ];
        const current = parts.filter(Boolean).length;
        return { done: current >= 3, progressPercent: pct(current, 3), current, target: 3 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_has_socials': {
      try {
        const { data: prof } = await admin.from('profiles').select('social_links').eq('id', userId).maybeSingle();
        const links = prof?.social_links;
        let n = 0;
        if (links && typeof links === 'object') {
          n = Object.values(links).filter((v) => typeof v === 'string' && (v as string).trim() !== '').length;
        }
        return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n >= 1 ? 1 : 0, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_destination_complete': {
      // L1 boss "Complete Your Artist Destination" — a credible, shareable public
      // page: photo + banner + bio + claimed URL + a track + at least one link.
      if (!artistId) return EMPTY_EVAL;
      try {
        const { data: ap } = await admin
          .from('artist_profiles')
          .select('banner_url, slug')
          .eq('id', artistId)
          .maybeSingle();
        const { data: prof } = await admin.from('profiles').select('avatar_url, bio, social_links').eq('id', userId).maybeSingle();
        const links = prof?.social_links;
        const hasSocial =
          !!links &&
          typeof links === 'object' &&
          Object.values(links).some((v) => typeof v === 'string' && (v as string).trim() !== '');
        const trackN = await countActive(admin, 'tracks', { artist_id: artistId, is_active: true });
        const parts = [
          !!prof?.avatar_url,
          !!ap?.banner_url,
          !!(prof?.bio && String(prof.bio).trim()),
          !!(ap?.slug && String(ap.slug).trim()),
          trackN >= 1,
          hasSocial,
        ];
        const current = parts.filter(Boolean).length;
        return { done: current >= parts.length, progressPercent: pct(current, parts.length), current, target: parts.length };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_track_count': {
      const n = artistId ? await countActive(admin, 'tracks', { artist_id: artistId, is_active: true }) : 0;
      return { done: n >= target, progressPercent: pct(n, target), current: n, target };
    }
    case 'artist_has_album': {
      const n = artistId ? await countActive(admin, 'albums', { artist_id: artistId, is_active: true }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_has_playlist': {
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count } = await admin
          .from('playlists')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .eq('is_artist_playlist', true)
          .not('is_active', 'is', false);
        const n = count || 0;
        return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_tier_count': {
      // Counts PAID tiers (price > 0), matching the Option-2 fan-tier semantics.
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count } = await admin
          .from('subscription_tiers')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .not('is_active', 'is', false)
          .gt('price', 0);
        const n = count || 0;
        return { done: n >= target, progressPercent: pct(n, target), current: n, target };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_tier_has_benefits': {
      if (!artistId) return EMPTY_EVAL;
      try {
        const { data: tiers } = await admin
          .from('subscription_tiers')
          .select('id, access_config')
          .eq('artist_id', artistId)
          .not('is_active', 'is', false);
        let has = (tiers ?? []).some(
          (t: any) => Array.isArray(t?.access_config?.benefits) && t.access_config.benefits.length > 0,
        );
        if (!has && tiers && tiers.length) {
          const ids = tiers.map((t: any) => t.id);
          const { count } = await admin
            .from('tier_benefits')
            .select('id', { count: 'exact', head: true })
            .in('tier_id', ids)
            .not('is_active', 'is', false);
          has = (count || 0) > 0;
        }
        return { done: has, progressPercent: has ? 100 : 0, current: has ? 1 : 0, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_ladder_complete': {
      // L3 boss — plan-aware: done when PAID tiers >= min(3 recommended, plan paid-cap).
      // Starter (cap 1) completes at 1 paid tier; Pro (cap 3) at 3; unlimited at 3.
      if (!artistId) return EMPTY_EVAL;
      try {
        const { data: ap } = await admin
          .from('artist_profiles')
          .select('platform_tier')
          .eq('id', artistId)
          .maybeSingle();
        const cap = getLimit(ap?.platform_tier, 'maxFanTiers');
        const recommended = 3;
        const wanted = cap === -1 ? recommended : Math.max(1, Math.min(recommended, cap));
        const { count } = await admin
          .from('subscription_tiers')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .not('is_active', 'is', false)
          .gt('price', 0);
        const n = count || 0;
        return { done: n >= wanted, progressPercent: pct(n, wanted), current: n, target: wanted };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_stripe_connected': {
      // L4 boss — the money gate. Authoritative: connected id present AND the
      // stripe_connected activation milestone (written by /api/stripe/connect/status
      // ONLY when charges_enabled). Never client-asserted.
      if (!artistId) return EMPTY_EVAL;
      try {
        const { data: ap } = await admin
          .from('artist_profiles')
          .select('stripe_connect_id, activation_milestones')
          .eq('id', artistId)
          .maybeSingle();
        const m = (ap?.activation_milestones || {}) as Record<string, unknown>;
        const done = !!ap?.stripe_connect_id && !!m.stripe_connected;
        return { done, progressPercent: done ? 100 : 0, current: done ? 1 : 0, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_tier_purchasable': {
      // L4 — a paid tier has a real Stripe price (backfill ran / created live).
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count } = await admin
          .from('subscription_tiers')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .not('is_active', 'is', false)
          .gt('price', 0)
          .not('stripe_price_id', 'is', null);
        const n = count || 0;
        return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_has_community_post': {
      const n = artistId ? await countActive(admin, 'community_posts', { artist_id: artistId, is_active: true }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }

    // ---- Levels 5-10 + Empire (all authoritative; financial/supporter always server-derived) ----

    case 'artist_free_supporter_count': {
      // Active subscriptions on a $0 tier. L5 mini-boss.
      if (!artistId) return EMPTY_EVAL;
      try {
        const { data: freeTiers } = await admin
          .from('subscription_tiers')
          .select('id')
          .eq('artist_id', artistId)
          .eq('price', 0);
        const ids = (freeTiers ?? []).map((t: any) => t.id);
        if (!ids.length) return { done: false, progressPercent: 0, current: 0, target };
        const { count } = await admin
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .eq('status', 'active')
          .in('tier_id', ids);
        const n = count || 0;
        return { done: n >= target, progressPercent: pct(n, target), current: n, target };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_has_fan_contacts': {
      const n = artistId ? await countActive(admin, 'fan_contacts', { artist_id: artistId }) : 0;
      return { done: n >= target, progressPercent: pct(n, target), current: n, target };
    }
    case 'artist_members_post_count': {
      // Members-only = tier-gated (is_free = false). L6/L7.
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count } = await admin
          .from('community_posts')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .not('is_active', 'is', false)
          .eq('is_free', false);
        const n = count || 0;
        return { done: n >= target, progressPercent: pct(n, target), current: n, target };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_went_live': {
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count } = await admin
          .from('live_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .eq('status', 'ended');
        const n = count || 0;
        return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_has_survey_response': {
      const n = artistId ? await countActive(admin, 'survey_responses', { artist_id: artistId }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_retention_cycle': {
      // L7 boss — fair, repository-supported: >=1 supporter that has passed a billing
      // period (current_period_start >= 28 days ago, still active) AND a members-only
      // post published. No fabricated retention rate; passage-of-billing is authoritative.
      if (!artistId) return EMPTY_EVAL;
      try {
        const since = new Date(Date.now() - 28 * 86400000).toISOString();
        const { count: seasoned } = await admin
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .eq('status', 'active')
          .lte('current_period_start', since);
        const { count: mpost } = await admin
          .from('community_posts')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .not('is_active', 'is', false)
          .eq('is_free', false);
        const parts = [(seasoned || 0) > 0, (mpost || 0) > 0];
        const current = parts.filter(Boolean).length;
        return { done: current >= 2, progressPercent: pct(current, 2), current, target: 2 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_has_proof_of_demand': {
      const n = artistId ? await countActive(admin, 'proof_of_demand', { artist_id: artistId }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_has_mission': {
      const n = artistId ? await countActive(admin, 'missions', { artist_id: artistId }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_has_squad': {
      const n = artistId ? await countActive(admin, 'artist_squads', { artist_id: artistId }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_campaign_closed': {
      // L8 learning boss — launched AND properly closed (goal reached OR archived).
      if (!artistId) return EMPTY_EVAL;
      const done = await hasClosedCampaign(admin, artistId);
      return { done, progressPercent: done ? 100 : 0, current: done ? 1 : 0, target: 1 };
    }
    case 'artist_campaign_reached': {
      // L8 success rank — the goal was actually hit.
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count } = await admin
          .from('road_campaigns')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .eq('status', 'reached');
        const n = count || 0;
        return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_has_smart_link': {
      if (!artistId) return EMPTY_EVAL;
      const has = await hasSmartLink(admin, artistId);
      return { done: has, progressPercent: has ? 100 : 0, current: has ? 1 : 0, target: 1 };
    }
    case 'artist_captured_lead': {
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count: withCaptures } = await admin
          .from('smart_links')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .gt('capture_count', 0);
        let n = withCaptures || 0;
        if (n === 0) n = await countActive(admin, 'fan_contacts', { artist_id: artistId });
        return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n >= 1 ? 1 : 0, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_has_active_sequence': {
      const n = artistId ? await countActive(admin, 'sequences', { artist_id: artistId, is_active: true }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_referrals_on': {
      if (!artistId) return EMPTY_EVAL;
      const on = await isReferralsOn(admin, artistId);
      return { done: on, progressPercent: on ? 100 : 0, current: on ? 1 : 0, target: 1 };
    }
    case 'artist_clipper_on': {
      if (!artistId) return EMPTY_EVAL;
      try {
        const { data } = await admin
          .from('artist_profiles')
          .select('clipper_commission_rate, clipper_campaign_started_at')
          .eq('id', artistId)
          .maybeSingle();
        const on = Number(data?.clipper_commission_rate ?? 0) > 0 && !!data?.clipper_campaign_started_at;
        return { done: on, progressPercent: on ? 100 : 0, current: on ? 1 : 0, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_sent_campaign': {
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count } = await admin
          .from('campaigns')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .eq('status', 'sent');
        const n = count || 0;
        return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_growth_loop': {
      // L9 boss — proves the SYSTEM exists (front door + paid path + a supporter + a
      // reach mechanism). Does NOT claim causation attribution can't prove.
      if (!artistId) return EMPTY_EVAL;
      const [free, paid, sup, link, refOn] = await Promise.all([
        countFreeTiers(admin, artistId),
        countPaidTiers(admin, artistId),
        countActiveSupporters(admin, artistId),
        hasSmartLink(admin, artistId),
        isReferralsOn(admin, artistId),
      ]);
      const parts = [free > 0, paid > 0, sup > 0, link || refOn];
      const current = parts.filter(Boolean).length;
      return { done: current >= 4, progressPercent: pct(current, 4), current, target: 4 };
    }
    case 'artist_revenue_milestone': {
      // Personalized: cond.count is the cents threshold (default $100). L10.
      if (!artistId) return EMPTY_EVAL;
      const threshold = cond.count ?? 10000;
      const net = await netRevenueCents(admin, artistId);
      return { done: net >= threshold, progressPercent: pct(net, threshold), current: net, target: threshold };
    }
    case 'artist_mrr_milestone': {
      // Empire: sum of active supporters' monthly tier prices (cents). cond.count = threshold.
      if (!artistId) return EMPTY_EVAL;
      const threshold = cond.count ?? 10000;
      try {
        const { data: subs } = await admin
          .from('subscriptions')
          .select('tier_id')
          .eq('artist_id', artistId)
          .eq('status', 'active');
        const tierIds = [...new Set((subs ?? []).map((s: any) => s.tier_id).filter(Boolean))];
        let mrr = 0;
        if (tierIds.length) {
          const { data: tiers } = await admin.from('subscription_tiers').select('id, price').in('id', tierIds);
          const priceById: Record<string, number> = {};
          for (const t of tiers ?? []) priceById[t.id] = Number(t.price) || 0;
          mrr = (subs ?? []).reduce((sum: number, s: any) => sum + (priceById[s.tier_id] || 0), 0);
        }
        return { done: mrr >= threshold, progressPercent: pct(mrr, threshold), current: mrr, target: threshold };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_has_team_split': {
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count } = await admin
          .from('team_split_deals')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .in('status', ['accepted', 'active']);
        const n = count || 0;
        return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_referral_conversions': {
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count } = await admin
          .from('referrals')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .eq('status', 'active');
        const n = count || 0;
        return { done: n >= target, progressPercent: pct(n, target), current: n, target };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_cities_unlocked': {
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count } = await admin
          .from('city_unlocks')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .eq('status', 'unlocked');
        const n = count || 0;
        return { done: n >= target, progressPercent: pct(n, target), current: n, target };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_infrastructure_ready': {
      // Infrastructure-ready gate (post-Level-4): the complete foundation is in place.
      // Distinct from setup_completed (the initial gate) — derived from authoritative
      // state so an established artist is recognized without redoing beginner work.
      if (!artistId) return EMPTY_EVAL;
      try {
        const { data: ap } = await admin
          .from('artist_profiles')
          .select('banner_url')
          .eq('id', artistId)
          .maybeSingle();
        const { data: prof } = await admin.from('profiles').select('avatar_url, bio').eq('id', userId).maybeSingle();
        const [free, paid, connected, trackN, communityN, purchasable] = await Promise.all([
          countFreeTiers(admin, artistId),
          countPaidTiers(admin, artistId),
          isStripeConnected(admin, artistId),
          countActive(admin, 'tracks', { artist_id: artistId, is_active: true }),
          countActive(admin, 'community_posts', { artist_id: artistId, is_active: true }),
          admin
            .from('subscription_tiers')
            .select('id', { count: 'exact', head: true })
            .eq('artist_id', artistId)
            .not('is_active', 'is', false)
            .gt('price', 0)
            .not('stripe_price_id', 'is', null)
            .then((r: any) => (r.count || 0) > 0),
        ]);
        const parts = [
          !!prof?.avatar_url,
          !!ap?.banner_url,
          !!(prof?.bio && String(prof.bio).trim()),
          trackN >= 1,
          free > 0,
          paid > 0,
          connected,
          purchasable,
          communityN > 0,
        ];
        const current = parts.filter(Boolean).length;
        return { done: current >= parts.length, progressPercent: pct(current, parts.length), current, target: parts.length };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_beat_rise_mode': {
      // L10 final boss + main-game victory. All authoritative. The proof set adapts by
      // being existence-based (any supporter, any closed campaign, positive revenue) so
      // it fits artists of any size without a universal revenue target.
      if (!artistId) return EMPTY_EVAL;
      const [free, paid, connected, sup, closed, refOn, net] = await Promise.all([
        countFreeTiers(admin, artistId),
        countPaidTiers(admin, artistId),
        isStripeConnected(admin, artistId),
        countActiveSupporters(admin, artistId),
        hasClosedCampaign(admin, artistId),
        isReferralsOn(admin, artistId),
        netRevenueCents(admin, artistId),
      ]);
      const communityN = await countActive(admin, 'community_posts', { artist_id: artistId, is_active: true });
      const parts = [free > 0, paid > 0, connected, sup > 0, communityN > 0, closed, refOn, net > 0];
      const current = parts.filter(Boolean).length;
      const total = parts.length;
      return { done: current >= total, progressPercent: pct(current, total), current, target: total };
    }
    case 'fan_has_subscription': {
      if (!artistId) return EMPTY_EVAL;
      const n = await countActive(admin, 'subscriptions', { fan_id: userId, artist_id: artistId, status: 'active' });
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'fan_referral_count': {
      // Authoritative: count real referral attributions, not a client "invite" tap.
      const n = await countActive(admin, 'referrals', { referrer_fan_id: userId });
      return { done: n >= target, progressPercent: pct(n, target), current: n, target };
    }
    case 'fan_supported_count': {
      try {
        const { data } = await admin
          .from('subscriptions')
          .select('artist_id')
          .eq('fan_id', userId)
          .eq('status', 'active');
        const distinct = new Set((data ?? []).map((r: any) => r.artist_id)).size;
        return { done: distinct >= target, progressPercent: pct(distinct, target), current: distinct, target };
      } catch {
        return EMPTY_EVAL;
      }
    }
    default:
      return EMPTY_EVAL;
  }
}

/** Compute live progress for a quest instance from its completion condition. */
export async function evaluateCondition(admin: any, instance: QuestInstance): Promise<EvalResult> {
  const cond = instance.completion_condition;
  if (!cond || cond.kind === 'manual') {
    // Manual quests only complete via completeQuest() — mirror stored progress.
    return {
      done: instance.status === 'completed',
      progressPercent: instance.progress_percent,
      current: instance.status === 'completed' ? 1 : 0,
      target: 1,
    };
  }
  if (cond.kind === 'fan_event') {
    const current = await countEvents(admin, {
      artistId: cond.scope === 'artist' ? instance.artist_id : instance.artist_id,
      fanId: cond.scope === 'artist' ? undefined : instance.user_id,
      eventType: cond.eventType,
      refKind: cond.refKind,
      refId: cond.refId,
      sinceDays: cond.sinceDays,
    });
    const target = cond.count;
    return { done: current >= target, progressPercent: pct(current, target), current, target };
  }
  if (cond.kind === 'domain') {
    return evalDomain(admin, instance, cond);
  }
  return EMPTY_EVAL;
}

// --- XP / progression writes (read-modify-write; acceptable for per-user cadence) ---

async function bumpProgression(
  admin: any,
  userId: string,
  artistId: string | null,
  role: QuestRole,
  deltaXp: number,
): Promise<{ oldXp: number; newXp: number; leveledUp: boolean; newLevel: number; levelKey: string }> {
  const scope = artistId ? 'artist' : 'global';
  let q = admin.from('user_progression').select('*').eq('user_id', userId);
  q = artistId ? q.eq('artist_id', artistId) : q.is('artist_id', null);
  const { data: existing } = await q.maybeSingle();

  const oldXp = existing?.xp ?? 0;
  const newXp = oldXp + deltaXp;
  const oldLevel = levelFromXp(role, oldXp);
  const newLevel = levelFromXp(role, newXp);

  if (existing) {
    await admin
      .from('user_progression')
      .update({ xp: newXp, level: newLevel.level, level_key: newLevel.levelKey, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await admin.from('user_progression').insert({
      user_id: userId,
      artist_id: artistId,
      scope,
      role,
      xp: newXp,
      level: newLevel.level,
      level_key: newLevel.levelKey,
    });
  }

  return {
    oldXp,
    newXp,
    leveledUp: newLevel.level > oldLevel.level,
    newLevel: newLevel.level,
    levelKey: newLevel.levelKey,
  };
}

async function recordUnlocks(admin: any, instance: QuestInstance, keys: string[]): Promise<string[]> {
  const done: string[] = [];
  for (const key of keys) {
    try {
      // Skip if already unlocked (partial unique indexes make upsert-onConflict awkward).
      let existsQ = admin.from('quest_unlocks').select('id').eq('user_id', instance.user_id).eq('unlock_key', key);
      existsQ = instance.artist_id ? existsQ.eq('artist_id', instance.artist_id) : existsQ.is('artist_id', null);
      const { data: found } = await existsQ.maybeSingle();
      if (found) continue;
      await admin.from('quest_unlocks').insert({
        user_id: instance.user_id,
        artist_id: instance.artist_id,
        unlock_key: key,
        source_quest_id: instance.id,
      });
      done.push(key);
    } catch (err) {
      console.error('[quests] recordUnlock failed:', key, err);
    }
  }
  return done;
}

/**
 * Complete a quest: idempotently flip status, grant XP once (xp_ledger), record
 * unlocks, and bump level. Safe to call repeatedly — a second call returns
 * { alreadyComplete: true } and grants nothing.
 */
export async function completeQuest(admin: any, instance: QuestInstance): Promise<CompletionResult> {
  const reward: QuestReward = instance.reward ?? {};
  const noop: CompletionResult = {
    completed: false,
    alreadyComplete: instance.status === 'completed',
    xpAwarded: 0,
    newXp: 0,
    newLevel: 1,
    leveledUp: false,
    unlocked: [],
    reward,
  };
  if (instance.status === 'completed') return noop;

  // 1. Flip status — guard on the pre-state so concurrent calls can't double-run.
  const { data: flipped } = await admin
    .from('quest_instances')
    .update({
      status: 'completed',
      progress_percent: 100,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', instance.id)
    .neq('status', 'completed')
    .select('id');

  if (!flipped || flipped.length === 0) {
    // Someone else completed it first.
    return { ...noop, alreadyComplete: true };
  }

  // 2. Grant XP via the ledger. Check-then-insert (NOT ON CONFLICT): the ledger's
  // unique index is PARTIAL, which Postgres can't use as an upsert arbiter — that
  // silently errored and XP never accrued. The status flip above already guarantees
  // this block runs at most once per instance, so a plain check-then-insert is safe.
  const xp = reward.xp ?? 0;
  let xpAwarded = 0;
  let bump = { oldXp: 0, newXp: 0, leveledUp: false, newLevel: 1, levelKey: '' };
  if (xp > 0) {
    const { data: existingLedger } = await admin
      .from('xp_ledger')
      .select('id')
      .eq('user_id', instance.user_id)
      .eq('quest_instance_id', instance.id)
      .eq('reason', 'quest_complete')
      .maybeSingle();

    let granted = false;
    if (!existingLedger) {
      const { error: insErr } = await admin.from('xp_ledger').insert({
        user_id: instance.user_id,
        artist_id: instance.artist_id,
        quest_instance_id: instance.id,
        amount: xp,
        reason: 'quest_complete',
      });
      granted = !insErr;
    }

    if (granted) {
      xpAwarded = xp;
      // Artists have one world → their XP lives on the GLOBAL row (artist_id NULL),
      // which is what the board reads. Fans accrue per-artist AND mirror to global
      // for cross-artist reputation.
      const primaryArtistId = instance.role === 'artist' ? null : instance.artist_id;
      bump = await bumpProgression(admin, instance.user_id, primaryArtistId, instance.role, xp);
      if (instance.role === 'fan' && instance.artist_id) {
        await bumpProgression(admin, instance.user_id, null, 'fan', xp);
      }
    }
  }

  // 3. Record unlocks (disclosure only — never grants access).
  const unlockKeys = [...(instance.unlocks ?? []), ...(reward.unlocks ?? [])];
  const unlocked = unlockKeys.length ? await recordUnlocks(admin, instance, [...new Set(unlockKeys)]) : [];

  // 4. Grant badges + fire notifications (all best-effort — never break completion).
  await grantRewardsAndNotify(admin, instance, reward, bump.leveledUp).catch((err) =>
    console.error('[quests] reward side-effects failed (non-fatal):', err),
  );

  return {
    completed: true,
    alreadyComplete: false,
    xpAwarded,
    newXp: bump.newXp,
    newLevel: bump.newLevel,
    leveledUp: bump.leveledUp,
    unlocked,
    reward,
  };
}

// Badges + notifications on completion. Fan badges go through the existing
// awardFanBadge (idempotent, already notifies fan + artist). Artist badges are
// carried as reward metadata (the completed quest IS the record — no new table).
// notifications.type is a hard CHECK enum, so every insert is .catch()'d: if the
// ALTER migration hasn't landed the row is skipped, completion still succeeds.
async function grantRewardsAndNotify(
  admin: any,
  instance: QuestInstance,
  reward: QuestReward,
  leveledUp: boolean,
): Promise<void> {
  const badges = reward.badges ?? [];
  if (instance.role === 'fan' && instance.artist_id && badges.length) {
    for (const badgeKey of badges) {
      await awardFanBadge(admin, {
        artistId: instance.artist_id,
        fanId: instance.user_id,
        badgeKey,
        source: 'mission',
        sourceId: instance.id,
      });
    }
  }

  const link = instance.role === 'artist' ? '/profile/artist' : '/home';
  const isMilestone = instance.quest_type === 'boss_quest' || instance.difficulty === 'boss';

  // Celebration copy: self-contained (no denormalized subtitle, which can be stale)
  // and always ends in "!" because it is a win.
  await createNotification(
    admin,
    instance.user_id,
    isMilestone ? 'quest_milestone' : 'quest_completed',
    isMilestone ? '🏆 Milestone passed!' : '✅ Quest complete!',
    isMilestone ? `You hit a big one: ${instance.title}!` : `You finished "${instance.title}". Keep rising!`,
    link,
  ).catch(() => {});

  if (leveledUp) {
    await createNotification(
      admin,
      instance.user_id,
      'level_up',
      '⬆️ You leveled up!',
      instance.role === 'artist' ? 'Your movement reached a new level!' : 'Your supporter status just rose!',
      link,
    ).catch(() => {});
  }
}

/**
 * Re-evaluate an instance and auto-complete it if its condition is now met.
 * Also mirrors live progress back onto the row. Returns the completion result
 * when it completed this call, else null.
 */
export async function syncQuest(admin: any, instance: QuestInstance): Promise<CompletionResult | null> {
  if (['completed', 'skipped', 'expired', 'failed', 'archived'].includes(instance.status)) return null;
  const result = await evaluateCondition(admin, instance);

  if (result.done) {
    return completeQuest(admin, instance);
  }

  // Not done — persist progress if it moved.
  if (result.progressPercent !== instance.progress_percent) {
    const nextStatus = result.progressPercent > 0 ? 'in_progress' : instance.status;
    await admin
      .from('quest_instances')
      .update({ progress_percent: result.progressPercent, status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', instance.id)
      .neq('status', 'completed');
  }
  return null;
}
