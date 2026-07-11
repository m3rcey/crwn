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
  retention: { label: 'View audience', href: '/profile/artist?tab=audience' },
};

// A few templates deserve a more specific destination than their category default.
const TEMPLATE_CTA: Record<string, QuestCta> = {
  // Tutorial + Level 1 (Foundation)
  artist_add_photo: { label: 'Add photo', href: '/profile/artist?tab=profile' },
  artist_upload_first_track: { label: 'Upload a track', href: '/profile/artist?tab=tracks' },
  artist_add_socials: { label: 'Add your links', href: '/profile/artist?tab=profile' },
  artist_complete_profile: { label: 'Complete profile', href: '/profile/artist?tab=profile' },
  // Level 2 (Vault)
  artist_catalog_depth: { label: 'Add music', href: '/profile/artist?tab=tracks' },
  artist_first_album: { label: 'Create an album', href: '/profile/artist?tab=albums' },
  artist_first_playlist: { label: 'Create a playlist', href: '/profile/artist?tab=tracks' },
  // Level 3 (Membership Ladder)
  artist_create_free_tier: { label: 'Create free tier', href: '/profile/artist?tab=tiers' },
  artist_build_first_offer: { label: 'Create paid tier', href: '/profile/artist?tab=tiers' },
  artist_tier_benefits: { label: 'Add benefits', href: '/profile/artist?tab=tiers' },
  artist_ladder_complete: { label: 'Apply the ladder', href: '/profile/artist?tab=tiers' },
  // Level 4 (Open the Gates)
  artist_stripe_connect: { label: 'Connect Stripe', href: '/profile/artist?tab=tiers' },
  artist_tier_purchasable: { label: 'Check tiers', href: '/profile/artist?tab=tiers' },
  artist_welcome_post: { label: 'Post a welcome', href: '/community' },
  artist_infrastructure_ready: { label: 'Review your tiers', href: '/profile/artist?tab=tiers' },
  // Level 5 (Founding Fans)
  artist_prospect_list: { label: 'Open audience', href: '/profile/artist?tab=audience' },
  artist_first_free_member: { label: 'View audience', href: '/profile/artist?tab=audience' },
  // Level 6 (First 10)
  artist_first_members_post: { label: 'Post to members', href: '/community' },
  artist_five_supporters: { label: 'View audience', href: '/profile/artist?tab=audience' },
  // Level 7 (Community)
  artist_members_rhythm: { label: 'Post an update', href: '/community' },
  artist_host_live: { label: 'Go Live', href: '/profile/artist?tab=livestreams' },
  artist_collect_feedback: { label: 'Open audience', href: '/profile/artist?tab=audience' },
  // Level 8 (First Movement)
  artist_validate_demand: { label: 'Open Proof of Demand', href: '/proof-of-demand' },
  artist_create_missions: { label: 'Create a mission', href: '/missions/new' },
  artist_recruit_squad: { label: 'Create a squad', href: '/squads/new' },
  artist_campaign_closed: { label: 'Open Campaign Hub', href: '/campaign-hub' },
  artist_campaign_reached: { label: 'Open Campaign Hub', href: '/campaign-hub' },
  // Level 9 (Growth Engine)
  artist_activate_referrals: { label: 'Open Referrals', href: '/profile/artist?tab=referrals' },
  artist_recruit_clipper: { label: 'Open Referrals', href: '/profile/artist?tab=referrals' },
  // Level 10 (Artist CEO)
  artist_review_revenue: { label: 'View analytics', href: '/profile/artist?tab=analytics' },
  artist_team_split: { label: 'Open Team', href: '/profile/artist?tab=team' },
  artist_revenue_milestone: { label: 'View analytics', href: '/profile/artist?tab=analytics' },
  // Empire Mode
  artist_empire_city: { label: 'Open City Unlocks', href: '/city-unlocks' },
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
