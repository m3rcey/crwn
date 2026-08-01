// Platform Tier Pricing (2026-07-31 pricing strategy: Launch $0 / Pro $49 / Scale $199).
// Annual = roughly two months free ($490 / $1,990). The checkout VERIFIES the live Stripe
// price amount against these numbers before creating a session, so a stale Stripe price id
// (e.g. the old $9.99 Pro price) fails loudly instead of silently undercharging.
export const TIER_PRICING = {
  pro: { monthly: 4900, annual: 49000, monthlyDisplay: 49, annualMonthlyDisplay: 40.84, annualTotal: 490, savings: 98 },
  scale: { monthly: 19900, annual: 199000, monthlyDisplay: 199, annualMonthlyDisplay: 165.84, annualTotal: 1990, savings: 398 },
} as const;

// The only prices CRWN can actually charge. There is no 'empire' tier: it was removed, but
// its two price ids lived on here pointing at env vars that have never existed, which reads
// to the next person like a tier they can sell.
export const STRIPE_PRICE_IDS = {
  pro_monthly: process.env.STRIPE_CRWN_PRO_PRICE_ID || '',
  pro_annual: process.env.STRIPE_CRWN_PRO_ANNUAL_PRICE_ID || '',
  scale_monthly: process.env.STRIPE_CRWN_SCALE_PRICE_ID || '',
  scale_annual: process.env.STRIPE_CRWN_SCALE_ANNUAL_PRICE_ID || '',
};

// Platform Tier Limits Configuration
// NOTE: TIER_LIMITS is the SINGLE SOURCE OF TRUTH for the platform fee.
// getArtistFeePercent() reads platformFeePercent from here — do not re-hardcode fees elsewhere.
export interface TierLimits {
  maxTracks: number;
  maxMembers: number;
  maxFanTiers: number;
  allowsBundles: boolean;
  allowsScheduling: boolean;
  allowsLive: boolean;
  allowsDMs: boolean;
  allowsClipper: boolean;
  platformFeePercent: number;
}

export const TIER_LIMITS: Record<string, TierLimits> = {
  // LAUNCH, the free plan (internal key 'starter' — kept so existing rows keep matching;
  // displayed as "Launch"). Purpose: prove the first direct-to-fan offer. The ICP has 50+
  // released songs, so 50 tracks (not 20) lets them evaluate CRWN with a representative
  // catalog. Members are unlimited (see maxMembers below).
  starter: {
    maxTracks: 50,
    // Members are UNLIMITED on every plan and this number is not enforced anywhere.
    // The only enforcement point would be refusing a paying fan at checkout, which
    // CRWN will never do, so the cap was removed from all artist-facing copy
    // (2026-08-01). Kept as -1 rather than deleted because planRecommendation and
    // the limits API read the shape. Do not re-advertise a member cap.
    maxMembers: -1,
    // Every plan gets the FULL recommended ladder (free Bronze door + 3 paid tiers:
    // Silver / Gold / Platinum) so the calculator's promise is buildable on every plan.
    // Tier COUNT is never a paywall: plans differentiate on fee + scale + leverage.
    maxFanTiers: 3,
    allowsBundles: false,
    allowsScheduling: false,
    allowsLive: false,
    allowsDMs: false,
    allowsClipper: false,
    platformFeePercent: 12,
  },
  // PRO ($49/mo): operate a serious direct-to-fan business. Break-even vs Launch:
  // $49 / 4% = $1,225 monthly GMV.
  pro: {
    maxTracks: -1, // unlimited
    maxMembers: -1, // unlimited
    maxFanTiers: 3,
    allowsBundles: true,
    allowsScheduling: true,
    allowsLive: true,
    allowsDMs: true,
    allowsClipper: true,
    platformFeePercent: 8,
  },
  // SCALE ($199/mo, renamed from the old $99 'label' concept): higher-volume artist
  // business with a team. Break-even vs Pro: ($199 - $49) / 3% = $5,000 monthly GMV.
  // Billable once its Stripe price env vars are set. A true multi-artist Label tier is
  // custom-priced and does NOT ship until org accounts / cross-artist infra exist.
  scale: {
    maxTracks: -1, // unlimited
    maxMembers: -1, // unlimited
    maxFanTiers: 3,
    allowsBundles: true,
    allowsScheduling: true,
    allowsLive: true,
    allowsDMs: true,
    allowsClipper: true,
    platformFeePercent: 5,
  },
};

// Old spec-only keys that may linger in code paths or copy. No production row ever carried
// them ('label' and 'empire' were never billable), but resolve them to the nearest real
// plan instead of silently falling back to the free plan's 12% fee.
const LEGACY_TIER_ALIASES: Record<string, string> = {
  label: 'scale',
  empire: 'scale',
};

function resolveTierKey(tier: string | null | undefined): string {
  const key = tier || 'starter';
  return LEGACY_TIER_ALIASES[key] || key;
}

// New simplified structure for server-side gating
export const TIER_LIMITS_V2 = {
  starter: {
    tracks: 50,
    // Every plan gets all 3 paid tiers (the full recommended ladder). See TIER_LIMITS above.
    fanTiers: 3,
    // Unlimited: see the note on TIER_LIMITS.starter.maxMembers.
    members: -1,
    bundles: false,
    scheduling: false,
    liveQA: false,
    analytics: 'basic' as const,
    artistProfiles: 1,
    apiAccess: false,
  },
  pro: {
    tracks: -1,
    fanTiers: 3,
    members: -1,
    bundles: true,
    scheduling: true,
    liveQA: true,
    analytics: 'full' as const,
    artistProfiles: 1,
    apiAccess: false,
  },
  // Multi-workspace + API access belong to the future custom-priced Label tier, not Scale.
  scale: {
    tracks: -1,
    fanTiers: 3,
    members: -1,
    bundles: true,
    scheduling: true,
    liveQA: true,
    analytics: 'full' as const,
    artistProfiles: 1,
    apiAccess: false,
  },
} as const;

// Email campaign (blast) limits per platform tier — MONTHLY quota.
// Launch: 1/mo, Pro: 20/mo, Scale: 100/mo. -1 = unlimited.
export const EMAIL_LIMITS: Record<string, number> = {
  starter: 1,
  pro: 20,
  scale: 100,
};

export function getEmailLimit(tier: string | null | undefined): number {
  const v = EMAIL_LIMITS[resolveTierKey(tier)];
  return v === undefined ? 1 : v;
}

export type PlatformTierName = 'starter' | 'pro' | 'scale';

export function getTierLimitsV2(tier: string | null) {
  const key = resolveTierKey(tier) as PlatformTierName;
  return TIER_LIMITS_V2[key] || TIER_LIMITS_V2.starter;
}

export function isAtLimit(currentCount: number, limit: number): boolean {
  if (limit === -1) return false;
  return currentCount >= limit;
}

export async function checkArtistLimit(
  artistId: string,
  resource: 'tracks' | 'fanTiers'
): Promise<{ allowed: boolean; current: number; limit: number; tier: string }> {
  const { createClient } = await import("@supabase/supabase-js");
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321', process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build');
  // Get artist platform tier
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('platform_tier')
    .eq('id', artistId)
    .single();

  const tier = artist?.platform_tier || 'starter';
  const limits = getTierLimitsV2(tier);

  // Count current resources
  let current = 0;

  if (resource === 'tracks') {
    const { count } = await supabaseAdmin
      .from('tracks')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId);
    current = count || 0;
  }

  if (resource === 'fanTiers') {
    // Fan-tier limit counts PAID tiers only (price > 0). The free "front door"
    // tier is a top-of-funnel entry point, not a paid membership slot, so it
    // never consumes a plan's fan-tier allowance. Every plan now allows the full
    // recommended ladder (free + 3 paid), so the Streaming Loss calculator's
    // promise is buildable regardless of plan; Pro differentiates on fee + features,
    // not tier count.
    // Keep this predicate identical everywhere fan-tier usage is counted
    // (see /api/platform/limits). is_active NULL means active (onboarding
    // creators do not set it), so match TRUE-or-NULL, exclude only FALSE.
    const { count } = await supabaseAdmin
      .from('subscription_tiers')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .not('is_active', 'is', false)
      .gt('price', 0);
    current = count || 0;
  }

  const limit = limits[resource] as number;
  return {
    allowed: !isAtLimit(current, limit),
    current,
    limit,
    tier,
  };
}

export function getTierLimits(tier: string | null | undefined): TierLimits {
  return TIER_LIMITS[resolveTierKey(tier)] || TIER_LIMITS.starter;
}

export function canUseFeature(tier: string | null | undefined, feature: keyof Omit<TierLimits, 'maxTracks' | 'maxMembers' | 'maxFanTiers' | 'platformFeePercent'>): boolean {
  const limits = getTierLimits(tier);
  return limits[feature] as boolean;
}

export function getLimit(tier: string | null | undefined, limit: keyof Pick<TierLimits, 'maxTracks' | 'maxMembers' | 'maxFanTiers'>): number {
  const limits = getTierLimits(tier);
  return limits[limit];
}

export function getPlatformFeePercent(tier: string | null | undefined): number {
  const limits = getTierLimits(tier);
  return limits.platformFeePercent;
}

// Display names. The free plan's internal key stays 'starter' (existing rows reference it),
// but the artist-facing name is "Launch": prove your first direct-to-fan offer.
const TIER_DISPLAY_NAMES: Record<string, string> = {
  starter: 'Launch',
  pro: 'Pro',
  scale: 'Scale',
};

export function formatTierName(tier: string | null | undefined): string {
  const key = resolveTierKey(tier);
  return TIER_DISPLAY_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Get an artist's platform fee percent. The fee is read from TIER_LIMITS, the single source
 * of truth, so changing a fee in one place updates every revenue path. There is no per-artist
 * override: the founding-artist 5% discount was retired (founder call 2026-07-15).
 */
export async function getArtistFeePercent(artistId: string): Promise<number> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
  );

  const { data } = await supabaseAdmin
    .from('artist_profiles')
    .select('platform_tier')
    .eq('id', artistId)
    .single();

  if (!data) return TIER_LIMITS.starter.platformFeePercent;

  // Every artist pays their tier's fee. The founding-artist 5% override was retired
  // (founder call 2026-07-15); nothing sets is_founding_artist anymore, and no production
  // row ever carried it, so there is no live discount to read here.
  return getPlatformFeePercent(data.platform_tier);
}
