// Platform Tier Limits Configuration
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
} as const;

export type PlatformTierName = 'starter' | 'pro' | 'label';

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
