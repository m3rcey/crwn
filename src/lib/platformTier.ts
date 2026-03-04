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
};

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
