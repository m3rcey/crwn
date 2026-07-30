// Platform Tier Pricing
// Pro is monthly-only at launch ($9.99/mo, no annual plan); annual fields mirror monthly.
export const TIER_PRICING = {
  pro: { monthly: 999, annual: 11988, monthlyDisplay: 9.99, annualMonthlyDisplay: 9.99, annualTotal: 120, savings: 0 },
  // SPEC ONLY — $99/mo tier (internal key 'label'), not billable/gated in v1.
  label: { monthly: 9900, annual: 118800, monthlyDisplay: 99, annualMonthlyDisplay: 99, annualTotal: 1188, savings: 0 },
} as const;

// The only prices CRWN can actually charge. There is no 'empire' tier: it was removed, but
// its two price ids lived on here pointing at env vars that have never existed, which reads
// to the next person like a tier they can sell.
export const STRIPE_PRICE_IDS = {
  pro_monthly: process.env.STRIPE_CRWN_PRO_PRICE_ID || '',
  pro_annual: process.env.STRIPE_CRWN_PRO_ANNUAL_PRICE_ID || '',
  label_monthly: process.env.STRIPE_CRWN_LABEL_PRICE_ID || '',
  label_annual: process.env.STRIPE_CRWN_LABEL_ANNUAL_PRICE_ID || '',
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
  // FREE tier (internal key 'starter'; displayed as "Free").
  starter: {
    maxTracks: 20,
    maxMembers: 100,
    // Free gets the FULL recommended ladder (3 paid tiers: Silver / Gold /
    // Platinum) so the Streaming Loss calculator's promise is buildable on
    // every plan. Pro still wins on the lower fee (12% -> 8%) plus live, DMs,
    // scheduling, clipper, and unlimited tracks/members. Tier COUNT is no longer
    // a paywall: a Free artist earning across 3 tiers pays the higher 12% fee, so
    // more tiers means more platform revenue, not less.
    maxFanTiers: 3,
    allowsBundles: false,
    allowsScheduling: false,
    allowsLive: false,
    allowsDMs: false,
    allowsClipper: false,
    platformFeePercent: 12,
  },
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
  // SPEC ONLY — Label ($99) slots in here. Not billable/gated in v1
  // (removed from the checkout whitelist + pricing modal). Values below are placeholders.
  label: {
    maxTracks: -1, // unlimited
    maxMembers: -1, // unlimited
    maxFanTiers: 10,
    allowsBundles: true,
    allowsScheduling: true,
    allowsLive: true,
    allowsDMs: true,
    allowsClipper: true,
    platformFeePercent: 5,
  },
  // SPEC ONLY — not billable/gated in v1.
  empire: {
    maxTracks: -1, // unlimited
    maxMembers: -1, // unlimited
    maxFanTiers: -1, // unlimited
    allowsBundles: true,
    allowsScheduling: true,
    allowsLive: true,
    allowsDMs: true,
    allowsClipper: true,
    platformFeePercent: 3,
  },
};

// New simplified structure for server-side gating
export const TIER_LIMITS_V2 = {
  starter: {
    tracks: 20,
    // Free gets all 3 paid tiers (the full recommended ladder). See TIER_LIMITS above.
    fanTiers: 3,
    members: 100,
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
  label: {
    tracks: -1,
    fanTiers: 10,
    members: -1,
    bundles: true,
    scheduling: true,
    liveQA: true,
    analytics: 'full' as const,
    artistProfiles: 10,
    apiAccess: true,
  },
  empire: {
    tracks: -1,
    fanTiers: -1,
    members: -1,
    bundles: true,
    scheduling: true,
    liveQA: true,
    analytics: 'full' as const,
    artistProfiles: -1,
    apiAccess: true,
  },
} as const;

// SMS limits per platform tier (monthly message quota)
export const SMS_LIMITS: Record<string, number> = {
  starter: 0,    // No SMS
  pro: 500,
  label: 2500,
  empire: 10000,
};

export function getSmsLimit(tier: string | null | undefined): number {
  return SMS_LIMITS[tier || 'starter'] || 0;
}

// Email campaign (blast) limits per platform tier — MONTHLY quota.
// Free: 1/mo, Pro: 10/mo. -1 = unlimited. (label/empire are spec-only.)
export const EMAIL_LIMITS: Record<string, number> = {
  starter: 1,
  pro: 10,
  label: 50,
  empire: -1,
};

export function getEmailLimit(tier: string | null | undefined): number {
  const v = EMAIL_LIMITS[tier || 'starter'];
  return v === undefined ? 1 : v;
}

export type PlatformTierName = 'starter' | 'pro' | 'label' | 'empire';

export function getTierLimitsV2(tier: string | null) {
  const key = (tier || 'starter') as PlatformTierName;
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
  return TIER_LIMITS[tier || 'starter'] || TIER_LIMITS.starter;
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

export function formatTierName(tier: string | null | undefined): string {
  if (!tier) return 'Starter';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
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
