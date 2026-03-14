// Platform Tier Pricing
export const TIER_PRICING = {
  pro: { monthly: 4900, annual: 44100, monthlyDisplay: 49, annualMonthlyDisplay: 37, annualTotal: 441, savings: 147 },
  label: { monthly: 14900, annual: 134100, monthlyDisplay: 149, annualMonthlyDisplay: 112, annualTotal: 1341, savings: 447 },
  empire: { monthly: 34900, annual: 314100, monthlyDisplay: 349, annualMonthlyDisplay: 262, annualTotal: 3141, savings: 1047 },
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
 * Founding artists get 1% off their platform tier fee (stacks with paid tiers).
 * This function queries the DB to check is_founding_artist status.
 */
export async function getArtistFeePercent(artistId: string): Promise<number> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await supabaseAdmin
    .from('artist_profiles')
    .select('platform_tier, is_founding_artist, founding_artist_expires_at')
    .eq('id', artistId)
    .single();

  if (!data) return 8;

  // Base fee from platform tier
  const tier = data.platform_tier || 'starter';
  let fee = 8;
  if (tier === 'empire') fee = 4;
  else if (tier === 'label') fee = 6;

  // Founding artists get 1% off their tier fee (stacks with paid tiers)
  if (data.is_founding_artist) {
    const expiresAt = data.founding_artist_expires_at ? new Date(data.founding_artist_expires_at) : null;
    if (!expiresAt || expiresAt > new Date()) {
      fee = Math.max(1, fee - 1);
    }
  }

  return fee;
}
