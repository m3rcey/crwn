// City Unlocks shared types + catalog. Tables: supabase/schema-phase2-city-unlocks.sql

export type UnlockType = 'event' | 'drop' | 'live' | 'offer' | 'content' | 'custom';
export type CityUnlockStatus = 'draft' | 'active' | 'unlocked' | 'expired' | 'archived';
export type GoalType = 'supporters' | 'rsvps' | 'revenue' | 'referrals' | 'shares' | 'votes' | 'custom';
export type ContributionType = 'support' | 'rsvp' | 'referral' | 'share' | 'vote' | 'revenue' | 'custom';

export const UNLOCK_TYPES: { value: UnlockType; label: string; icon: string; hint: string }[] = [
  { value: 'event', label: 'Live event / show', icon: '🎤', hint: 'A show, pop-up, or listening party.' },
  { value: 'live', label: 'City-exclusive live', icon: '📡', hint: 'A livestream just for this city.' },
  { value: 'drop', label: 'Local drop', icon: '📦', hint: 'Merch or a release for the city.' },
  { value: 'offer', label: 'Special offer', icon: '🎟️', hint: 'A ticket or backer offer.' },
  { value: 'content', label: 'Exclusive content', icon: '🎬', hint: 'A video or track for the city.' },
  { value: 'custom', label: 'Custom', icon: '➕', hint: 'Your own reward.' },
];
export const UNLOCK_TYPE_MAP = Object.fromEntries(UNLOCK_TYPES.map(t => [t.value, t])) as Record<UnlockType, { value: UnlockType; label: string; icon: string; hint: string }>;

export const GOAL_TYPES: { value: GoalType; label: string; contribution: ContributionType; verb: string; unit: string }[] = [
  { value: 'supporters', label: 'Supporters', contribution: 'support', verb: 'Support the city', unit: 'supporters' },
  { value: 'rsvps', label: 'RSVPs', contribution: 'rsvp', verb: 'RSVP', unit: 'RSVPs' },
  { value: 'referrals', label: 'Referrals', contribution: 'referral', verb: 'Invite a friend', unit: 'referrals' },
  { value: 'shares', label: 'Shares', contribution: 'share', verb: 'Share the city link', unit: 'shares' },
  { value: 'votes', label: 'Votes', contribution: 'vote', verb: 'Vote', unit: 'votes' },
];
export const GOAL_TYPE_MAP = Object.fromEntries(GOAL_TYPES.map(t => [t.value, t])) as Record<string, typeof GOAL_TYPES[number]>;
