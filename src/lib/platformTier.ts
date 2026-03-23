// Platform Tier Pricing
export const TIER_PRICING = {
  pro: { monthly: 5000, annual: 44400, monthlyDisplay: 50, annualMonthlyDisplay: 37, annualTotal: 444, savings: 156 },
  label: { monthly: 15000, annual: 134400, monthlyDisplay: 150, annualMonthlyDisplay: 112, annualTotal: 1344, savings: 456 },
  empire: { monthly: 35000, annual: 314400, monthlyDisplay: 350, annualMonthlyDisplay: 262, annualTotal: 3144, savings: 956 },
} as const;

export const STRIPE_PRICE_IDS = {
  pro_monthly: process.env.STRIPE_CRWN_PRO_PRICE_ID!,
  pro_annual: process.env.STRIPE_CRWN_PRO_ANNUAL_PRICE_ID!,
  label_monthly: process.env.STRIPE_CRWN_LABEL_PRICE_ID!,
  label_annual: process.env.STRIPE_CRWN_LABEL_ANNUAL_PRICE_ID!,
  empire_monthly: process.env.STRIPE_CRWN_EMPIRE_PRICE_ID!,
  empire_annual: process.env.STRIPE_CRWN_EMPIRE_ANNUAL_PRICE_ID!,
} as const;

// Platform Tier Limits Configuration
export interface TierLimits {
  maxTracks: number;
  maxMembers: number;
  maxFanTiers: number;
  allowsBundles: boolean;
  allowsScheduling: boolean;
  allowsLive: boolean;
  platformFeePercent: number;
}

export const TIER_LIMITS: Record<string, TierLimits> = {
  starter: {
    maxTracks: 10,
    maxMembers: 100,
    maxFanTiers: 1,
    allowsBundles: false,
    allowsScheduling: false,
    allowsLive: false,
    platformFeePercent: 8,
  },
  pro: {
    maxTracks: -1, // unlimited
    maxMembers: -1, // unlimited
    maxFanTiers: 5,
    allowsBundles: true,
    allowsScheduling: true,
    allowsLive: true,
    platformFeePercent: 8,
  },
  label: {
    maxTracks: -1, // unlimited
    maxMembers: -1, // unlimited
    maxFanTiers: 10,
    allowsBundles: true,
    allowsScheduling: true,
    allowsLive: true,
    platformFeePercent: 6,
  },
  empire: {
    maxTracks: -1, // unlimited
    maxMembers: -1, // unlimited
    maxFanTiers: -1, // unlimited
    allowsBundles: true,
    allowsScheduling: true,
    allowsLive: true,
    platformFeePercent: 4,
  },
};

// New simplified structure for server-side gating
export const TIER_LIMITS_V2 = {
  starter: {
    tracks: 10,
    fanTiers: 1,
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
    fanTiers: 5,
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
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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
    const { count } = await supabaseAdmin
      .from('subscription_tiers')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .eq('is_active', true);
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
 * Get artist's platform fee percent, checking for founding artist status.
 * Founding artists get a flat 5% fee for their first 6 months,
 * then revert to their normal platform tier fee (8/8/6/4).
 */
export async function getArtistFeePercent(artistId: string): Promise<number> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await supabaseAdmin
    .from('artist_profiles')
    .select('platform_tier, is_founding_artist, founding_fee_expires_at')
    .eq('id', artistId)
    .single();

  if (!data) return 8;

  // Founding artists get flat 5% for first 6 months
  if (data.is_founding_artist) {
    const feeExpiresAt = data.founding_fee_expires_at ? new Date(data.founding_fee_expires_at) : null;
    if (feeExpiresAt && feeExpiresAt > new Date()) {
      return 5;
    }
  }

  // Normal tier fee after founding period or for non-founding artists
  const tier = data.platform_tier || 'starter';
  if (tier === 'empire') return 4;
  if (tier === 'label') return 6;
  return 8;
}
