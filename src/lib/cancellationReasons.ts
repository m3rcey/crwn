// Predefined cancellation reasons for fan and platform contexts

export interface CancelReason {
  key: string;
  label: string;
}

// When a fan cancels an artist subscription
export const FAN_CANCEL_REASONS: CancelReason[] = [
  { key: 'too_expensive', label: 'Too expensive' },
  { key: 'not_enough_content', label: 'Not enough new content' },
  { key: 'content_not_for_me', label: 'Content isn\'t for me anymore' },
  { key: 'found_alternative', label: 'Found an alternative' },
  { key: 'no_longer_interested', label: 'No longer interested in this artist' },
  { key: 'financial_hardship', label: 'Financial hardship' },
  { key: 'technical_issues', label: 'Technical issues' },
  { key: 'not_using_enough', label: 'Not using it enough' },
  { key: 'other', label: 'Other' },
];

// When an artist cancels their platform subscription
export const PLATFORM_CANCEL_REASONS: CancelReason[] = [
  { key: 'too_expensive', label: 'Too expensive for my stage' },
  { key: 'not_enough_fans', label: 'Can\'t get enough fans' },
  { key: 'missing_features', label: 'Missing features I need' },
  { key: 'switching_platform', label: 'Switching to another platform' },
  { key: 'no_longer_making_music', label: 'No longer making music' },
  { key: 'too_complicated', label: 'Too complicated to use' },
  { key: 'technical_issues', label: 'Technical issues' },
  { key: 'not_using_enough', label: 'Not using it enough' },
  { key: 'other', label: 'Other' },
];

// Fan loyalty survey — "Why did you stay?"
export const FAN_LOYALTY_REASONS = [
  { key: 'great_music', label: 'Great music' },
  { key: 'exclusive_content', label: 'Exclusive content' },
  { key: 'community', label: 'The community' },
  { key: 'personal_connection', label: 'Personal connection with the artist' },
  { key: 'value_for_money', label: 'Great value for money' },
  { key: 'early_access', label: 'Early access to new releases' },
  { key: 'supporting_artist', label: 'Want to support the artist' },
];

// Platform loyalty survey — "Why did you stay on CRWN?"
export const PLATFORM_LOYALTY_REASONS = [
  { key: 'fan_management', label: 'Fan management tools' },
  { key: 'revenue', label: 'Revenue / earnings' },
  { key: 'community_features', label: 'Community features' },
  { key: 'analytics', label: 'Analytics & insights' },
  { key: 'email_marketing', label: 'Email / SMS marketing' },
  { key: 'easy_setup', label: 'Easy to set up and use' },
  { key: 'fair_pricing', label: 'Fair pricing / low fees' },
  { key: 'support', label: 'Great support' },
];
