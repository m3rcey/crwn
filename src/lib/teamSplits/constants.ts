// Team Splits — role catalog, deal-type metadata, revenue-source metadata, and
// recommended defaults. UI reads these so the wizard, dashboards, and AI stay
// in sync with one source of truth.

import type { DealType, RevenueSourceType, PayoutBasis, StartTrigger } from './types';

export const COLLABORATOR_ROLES: { key: string; label: string; group: string }[] = [
  { key: 'producer', label: 'Producer', group: 'Music' },
  { key: 'videographer', label: 'Videographer', group: 'Visual' },
  { key: 'video_editor', label: 'Video Editor', group: 'Visual' },
  { key: 'photographer', label: 'Photographer', group: 'Visual' },
  { key: 'engineer', label: 'Engineer', group: 'Music' },
  { key: 'mixing_engineer', label: 'Mixing Engineer', group: 'Music' },
  { key: 'mastering_engineer', label: 'Mastering Engineer', group: 'Music' },
  { key: 'graphic_designer', label: 'Graphic Designer', group: 'Design' },
  { key: 'cover_designer', label: 'Cover Designer', group: 'Design' },
  { key: 'motion_designer', label: 'Motion Designer', group: 'Design' },
  { key: 'social_media_manager', label: 'Social Media Manager', group: 'Marketing' },
  { key: 'marketer', label: 'Marketer', group: 'Marketing' },
  { key: 'manager', label: 'Manager', group: 'Business' },
  { key: 'creative_director', label: 'Creative Director', group: 'Creative' },
  { key: 'stylist', label: 'Stylist', group: 'Creative' },
  { key: 'dj', label: 'DJ', group: 'Music' },
  { key: 'playlist_curator', label: 'Playlist Curator', group: 'Marketing' },
  { key: 'event_host', label: 'Event Host', group: 'Events' },
  { key: 'content_strategist', label: 'Content Strategist', group: 'Marketing' },
  { key: 'community_manager', label: 'Community Manager', group: 'Marketing' },
  { key: 'other', label: 'Other / Custom', group: 'Other' },
];

export function roleLabel(key: string, customRole?: string | null): string {
  if (key === 'other' && customRole) return customRole;
  return COLLABORATOR_ROLES.find((r) => r.key === key)?.label ?? key;
}

export interface DealTypeMeta {
  key: DealType;
  label: string;
  blurb: string;
  bestFor: string;
  recommended?: boolean;
  highRisk?: boolean;
  requiresPercentage: boolean;
  requiresSource: boolean;
}

export const DEAL_TYPES: DealTypeMeta[] = [
  {
    key: 'campaign_share',
    label: 'Campaign Revenue Share',
    blurb: 'A percentage of one specific campaign’s CRWN revenue.',
    bestFor: 'Music videos, launches, rollout campaigns',
    recommended: true,
    requiresPercentage: true,
    requiresSource: true,
  },
  {
    key: 'offer_share',
    label: 'Offer Revenue Share',
    blurb: 'A percentage of one specific offer (a product or membership).',
    bestFor: 'Supporter packs, vault offers, product drops, tickets',
    requiresPercentage: true,
    requiresSource: true,
  },
  {
    key: 'subscription_share',
    label: 'Subscription Revenue Share',
    blurb: 'A percentage of one subscription tier’s revenue.',
    bestFor: 'Producers, engineers, creative partners',
    requiresPercentage: true,
    requiresSource: true,
  },
  {
    key: 'milestone_bonus',
    label: 'Milestone Bonus',
    blurb: 'A fixed bonus when a milestone is reached.',
    bestFor: 'Clear one-time goals (e.g. 100 supporters)',
    requiresPercentage: false,
    requiresSource: true,
  },
  {
    key: 'hybrid',
    label: 'Hybrid Deal',
    blurb: 'Some upfront payment plus a revenue share.',
    bestFor: 'Partial cash now, upside later',
    requiresPercentage: true,
    requiresSource: true,
  },
  {
    key: 'artist_earnings_share',
    label: 'Time-Based Artist Earnings Share',
    blurb: 'A percentage of your broader CRWN earnings for a set period. Higher risk.',
    bestFor: 'Managers (use with caution)',
    highRisk: true,
    requiresPercentage: true,
    requiresSource: false,
  },
  {
    key: 'custom',
    label: 'Custom Deal',
    blurb: 'Define your own terms. Custom terms may need legal review.',
    bestFor: 'Anything the presets don’t cover',
    highRisk: true,
    requiresPercentage: false,
    requiresSource: false,
  },
];

export function dealTypeMeta(key: DealType): DealTypeMeta {
  return DEAL_TYPES.find((d) => d.key === key) ?? DEAL_TYPES[0];
}

/** Which revenue-source types a deal type can attach to. */
export const SOURCE_TYPES_FOR_DEAL: Record<DealType, RevenueSourceType[]> = {
  campaign_share: ['road_campaign'],
  offer_share: ['product'],
  subscription_share: ['tier'],
  milestone_bonus: ['road_campaign', 'tier', 'product', 'all_earnings'],
  hybrid: ['road_campaign', 'product', 'tier', 'track', 'live_session', 'booking'],
  artist_earnings_share: ['all_earnings'],
  custom: ['tier', 'product', 'track', 'live_session', 'booking', 'road_campaign', 'all_earnings', 'custom', 'none'],
};

export const SOURCE_LABELS: Record<RevenueSourceType, string> = {
  tier: 'Subscription tier',
  product: 'Product / offer',
  track: 'Track',
  live_session: 'Livestream / listening session',
  booking: 'Booking',
  road_campaign: 'Road To campaign',
  all_earnings: 'All artist CRWN earnings',
  custom: 'Custom source',
  none: 'No revenue source',
};

// ---- Recommended defaults (CLAUDE.md 5-step: sensible defaults, no re-litigating) ----
export const DEFAULTS = {
  dealType: 'campaign_share' as DealType,
  payoutBasis: 'net_artist_revenue' as PayoutBasis,
  startTrigger: 'on_accept' as StartTrigger,
  capEnabled: true,
  capAmountCents: 150000, // $1,500 starter suggestion
  percentage: 10,
  durationDaysCampaign: 180, // 6 months
  durationDaysSubscription: 365, // 12 months
  holdPeriodDays: 7,
  minCashoutCents: 2500, // $25, mirrors atomic_fan_cashout minimum
  payoutStartsAfterDeliverableApproval: true,
};

// Risk thresholds (used by warnings.ts + admin flags).
export const RISK = {
  highPercentage: 25, // a single split over 25% of a source is flagged
  totalSourceSplitCap: 60, // total active split % on one source before hard warning
  lowNetWarning: 30, // if projected artist net after all splits < 30%, warn
  longDurationDays: 365,
};

/** Roles that carry an IP/publishing conflict warning (Pitfalls 18-21). */
export const IP_SENSITIVE_ROLES = new Set([
  'producer',
  'engineer',
  'mixing_engineer',
  'mastering_engineer',
  'videographer',
  'video_editor',
  'manager',
]);
