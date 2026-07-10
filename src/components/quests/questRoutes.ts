// Maps a quest to the CTA that advances it. Guidance only — these routes are the
// EXISTING feature surfaces (offers, campaigns, dashboard tabs); the Quest Engine
// just points at them. Returns an href; the dashboard can intercept ?tab= links.
import type { QuestInstance } from '@/lib/quests/types';

export interface QuestCta {
  label: string;
  href: string;
}

// Encoded so it survives as a single query value (it contains its own ?tab=).
// Creators (offers/new, campaigns/new) read ?returnTo and bounce back to Rise Mode
// on success, where the completion celebration fires.
const RETURN_TO_RISE = '%2Fprofile%2Fartist%3Ftab%3Drise';

const CATEGORY_CTA: Record<string, QuestCta> = {
  setup: { label: 'Go to setup', href: '/profile/artist?tab=profile' },
  offer: { label: 'Build offer', href: `/offers/new?returnTo=${RETURN_TO_RISE}` },
  campaign: { label: 'Start campaign', href: `/campaigns/new?returnTo=${RETURN_TO_RISE}` },
  support: { label: 'View supporters', href: '/profile/artist?tab=audience' },
  promotion: { label: 'Open Earn Center', href: '/earn' },
  live: { label: 'Go to Live', href: '/profile/artist?tab=livestreams' },
  content: { label: 'Post an update', href: '/community' },
  fan_activation: { label: 'Create a mission', href: '/missions/new' },
  city: { label: 'Open City Unlocks', href: '/city-unlocks' },
  team: { label: 'Open Team', href: '/profile/artist?tab=team' },
  revenue: { label: 'View analytics', href: '/profile/artist?tab=analytics' },
  calendar: { label: 'Promise Calendar', href: '/profile/artist?tab=promise' },
};

// A few templates deserve a more specific destination than their category default.
const TEMPLATE_CTA: Record<string, QuestCta> = {
  artist_add_photo: { label: 'Add photo', href: '/profile/artist?tab=profile' },
  artist_upload_first_track: { label: 'Upload a track', href: '/profile/artist?tab=tracks' },
  artist_create_free_tier: { label: 'Create free tier', href: `/offers/new?returnTo=${RETURN_TO_RISE}` },
  artist_build_first_offer: { label: 'Create paid tier', href: `/offers/new?returnTo=${RETURN_TO_RISE}` },
  artist_create_road_campaign: { label: 'Launch campaign', href: `/campaigns/new?returnTo=${RETURN_TO_RISE}` },
  // fan-side
  fan_subscribe_to_artist: { label: 'Become a supporter', href: '' }, // filled with artist slug by caller
  fan_share_campaign: { label: 'Share', href: '' },
  fan_invite_friend: { label: 'Invite a friend', href: '/earn' },
  fan_back_campaign: { label: 'Back it', href: '' },
};

export function questCta(quest: Pick<QuestInstance, 'template_key' | 'category'>): QuestCta {
  if (quest.template_key && TEMPLATE_CTA[quest.template_key]) {
    const cta = TEMPLATE_CTA[quest.template_key];
    if (cta.href) return cta;
  }
  return CATEGORY_CTA[quest.category] ?? { label: 'Open', href: '/home' };
}
