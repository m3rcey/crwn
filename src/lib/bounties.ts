// Clip Bounties shared types + catalog. v1 is non-cash (see migration header).
// Tables: supabase/schema-phase2-clip-bounties.sql

export type BountyType =
  | 'first_convert' | 'most_subscribers' | 'most_revenue' | 'most_clicks'
  | 'artist_pick' | 'best_retention' | 'city' | 'fastest' | 'top3_split' | 'custom';

export type BountyRewardType = 'points' | 'badge' | 'access' | 'commission_boost' | 'custom';
export type BountyStatus = 'draft' | 'active' | 'ended' | 'cancelled' | 'awarded';
export type BountyEligibility = 'all' | 'clippers' | 'subscribers';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'winner';

export interface BountyTypeDef {
  value: BountyType;
  label: string;
  icon: string;
  hint: string;
  autoRankable: boolean; // can a metric decide the winner, vs artist picks
}

export const BOUNTY_TYPES: BountyTypeDef[] = [
  { value: 'artist_pick', label: 'Best clip (you pick)', icon: '⭐', hint: 'You choose the winner.', autoRankable: false },
  { value: 'first_convert', label: 'First to convert', icon: '⚡', hint: 'First clip to bring X subscribers.', autoRankable: true },
  { value: 'most_subscribers', label: 'Most subscribers', icon: '👑', hint: 'Clip that drives the most subs.', autoRankable: true },
  { value: 'most_revenue', label: 'Most revenue', icon: '💰', hint: 'Clip that drives the most revenue.', autoRankable: true },
  { value: 'most_clicks', label: 'Most clicks', icon: '🔗', hint: 'Clip with the most link clicks.', autoRankable: true },
  { value: 'best_retention', label: 'Best retention', icon: '🎯', hint: 'Subs that stick around.', autoRankable: false },
  { value: 'city', label: 'Best city clip', icon: '📍', hint: 'Best clip for a target city.', autoRankable: false },
  { value: 'fastest', label: 'Fastest after live', icon: '⏱️', hint: 'First clip out after the live ends.', autoRankable: true },
  { value: 'top3_split', label: 'Top 3 split', icon: '🥇', hint: 'Top 3 clips share the reward.', autoRankable: true },
  { value: 'custom', label: 'Custom', icon: '➕', hint: 'Your own challenge.', autoRankable: false },
];

export const BOUNTY_TYPE_MAP: Record<BountyType, BountyTypeDef> =
  Object.fromEntries(BOUNTY_TYPES.map(t => [t.value, t])) as Record<BountyType, BountyTypeDef>;

export const BOUNTY_REWARDS: { value: BountyRewardType; label: string; icon: string; needsDetail: boolean; badge?: boolean }[] = [
  { value: 'badge', label: 'Status badge', icon: '🏅', needsDetail: false, badge: true },
  { value: 'access', label: 'Exclusive access', icon: '🔓', needsDetail: true },
  { value: 'commission_boost', label: 'Commission boost', icon: '📈', needsDetail: true },
  { value: 'points', label: 'Points', icon: '⭐', needsDetail: true },
  { value: 'custom', label: 'Custom reward', icon: '🎁', needsDetail: true },
];
