// Quest Engine — shared types. Mirrors supabase/schema-phase2-quest-engine.sql.
// The Quest Engine is a GUIDANCE + progression layer over existing CRWN systems.
// It never gates access (platform tier does that); "unlocks" are disclosure state.

export type QuestRole = 'artist' | 'fan';

export type QuestType =
  | 'main_quest'
  | 'side_quest'
  | 'daily_move'
  | 'weekly_goal'
  | 'boss_quest'
  | 'live_quest'
  | 'onboarding_quest'
  | 'ai_recommended_quest'
  | 'fulfillment_quest'
  | 'retention_quest'
  | 'campaign_quest'
  | 'promotion_quest'
  | 'daily_assignment'
  | 'questline_step';

export type QuestDifficulty = 'easy' | 'medium' | 'hard' | 'boss';

export type QuestStatus =
  | 'locked'
  | 'available'
  | 'active'
  | 'in_progress'
  | 'ready_to_complete'
  | 'completed'
  | 'skipped'
  | 'expired'
  | 'failed'
  | 'archived';

// ---- Declarative completion conditions (interpreted by evaluator.ts) ----

/** Counts rows in the shared fan_events log. */
export interface FanEventCondition {
  kind: 'fan_event';
  eventType: string; // FanEventType from src/lib/fanEvents.ts
  refKind?: string;
  refId?: string; // when omitted, counts any event of eventType for the artist/fan
  count: number; // target
  /** 'fan' counts only this user's events; 'artist' counts across the artist's world. */
  scope?: 'fan' | 'artist';
  sinceDays?: number; // rolling window (used by daily/weekly)
}

/** Checks an authoritative domain table (subscriptions, tiers, campaigns, ...). */
export interface DomainCondition {
  kind: 'domain';
  check: DomainCheck;
  count?: number; // threshold for count-style checks (default 1)
}

export type DomainCheck =
  // artist-side
  | 'artist_has_offer' // >=1 active subscription_tier OR product
  | 'artist_has_tier' // >=1 active subscription_tier
  | 'artist_has_free_tier' // >=1 active subscription_tier priced at 0 (the free front door)
  | 'artist_has_paid_offer' // >=1 active PAID subscription_tier (price>0) OR paid product
  | 'artist_has_product' // >=1 active product
  | 'artist_has_track' // >=1 active track
  | 'artist_has_avatar' // profiles.avatar_url set
  | 'artist_has_campaign' // >=1 road_campaign
  | 'artist_supporter_count' // active subscriptions >= count
  // artist-side — Rise Mode journey (Tutorial + Levels 1-4)
  | 'artist_profile_complete' // tagline + banner_url + bio all present (L1)
  | 'artist_destination_complete' // photo + banner + bio + slug + track + social link (L1 boss)
  | 'artist_has_socials' // profiles.social_links has >=1 non-empty link (L1)
  | 'artist_infrastructure_ready' // composite: full L1-L4 infrastructure in place (infra-ready gate)
  | 'artist_track_count' // active tracks >= count (L2 catalog depth)
  | 'artist_has_album' // >=1 active album (L2)
  | 'artist_has_playlist' // >=1 active artist playlist (L2)
  | 'artist_tier_count' // active PAID subscription_tiers >= count (L3)
  | 'artist_tier_has_benefits' // >=1 active tier carries >=1 benefit (L3)
  | 'artist_ladder_complete' // paid tiers >= min(3, plan paid-cap) — plan-aware (L3 boss)
  | 'artist_stripe_connected' // Stripe charges enabled (L4 boss — authoritative money gate)
  | 'artist_tier_purchasable' // >=1 paid tier with a Stripe price id (backfill ran) (L4)
  | 'artist_has_community_post' // >=1 active community post (L4 welcome post)
  // artist-side — Rise Mode journey (Levels 5-10 + Empire)
  | 'artist_free_supporter_count' // active subscriptions on a $0 tier >= count (L5 mini-boss)
  | 'artist_has_fan_contacts' // fan_contacts rows >= count (L5 prospect list)
  | 'artist_first_visit' // unique daily artist_page_visits rows >= count (L5 launch signal)
  | 'artist_promise_fulfilled' // fulfillment_events status='completed' >= count (L5 deliver the promise)
  | 'artist_members_post_count' // active community_posts gated to a tier >= count (L6/L7)
  | 'artist_went_live' // >=1 live_session that ended (L7)
  | 'artist_has_survey_response' // >=1 survey_response (L7 feedback)
  | 'artist_retention_cycle' // >=1 supporter past a billing period + a members post (L7 boss)
  | 'artist_has_proof_of_demand' // >=1 proof_of_demand test (L8)
  | 'artist_has_mission' // >=1 mission (L8)
  | 'artist_has_squad' // >=1 artist_squad (L8)
  | 'artist_campaign_closed' // >=1 road_campaign reached OR archived (L8 learning boss)
  | 'artist_campaign_reached' // >=1 road_campaign status='reached' (L8 success rank)
  | 'artist_has_smart_link' // >=1 active smart_link (L9)
  | 'artist_captured_lead' // a smart_link captured a lead OR >=1 fan_contact (L9)
  | 'artist_has_active_sequence' // >=1 active lifecycle sequence (L9)
  // artist-side: the fan funnel (Rise Mode first-revenue journey, 2026-09-03). All four read the
  // ONE funnel object (fan_automations) through src/lib/funnelReadiness.ts, never wizard state.
  | 'artist_has_lead_magnet' // the funnel's magnet exists AND its asset still exists (file key or an active track)
  | 'artist_funnel_live' // the funnel is active with a purchasable primary tier behind it
  | 'artist_offer_experience_live' // a valid, active Tier Offer Experience exists for the primary tier
  | 'artist_funnel_nurture_active' // an active free_join follow-up with messages and a conversion goal
  | 'artist_referrals_on' // referral_commission_rate > 0 (L9)
  | 'artist_clipper_on' // clipper program configured + started (L9)
  | 'artist_sent_campaign' // >=1 campaign with status 'sent' (L9 side)
  | 'artist_growth_loop' // free+paid tier + supporter + (smart link OR referrals on) (L9 boss)
  | 'artist_revenue_milestone' // sum(earnings.net_amount) >= count cents (L10, personalized)
  | 'artist_mrr_milestone' // sum of active supporters' tier prices >= count cents (Empire)
  | 'artist_has_team_split' // >=1 accepted/active team_split_deal (L10 side)
  | 'artist_referral_conversions' // referrals attributed to this artist >= count (Empire)
  | 'artist_cities_unlocked' // city_unlocks with status 'unlocked' >= count (Empire)
  | 'artist_beat_rise_mode' // composite victory: the authoritative CEO proof set (L10 final boss)
  // fan-side (relative to related_artist)
  | 'fan_has_subscription' // active subscription to the artist
  | 'fan_supported_count' // active subscriptions across all artists >= count
  | 'fan_referral_count'; // referrals attributed to this fan >= count (authoritative)

/** Completed only by an explicit server-side action (no automatic signal). */
export interface ManualCondition {
  kind: 'manual';
}

export type CompletionCondition = FanEventCondition | DomainCondition | ManualCondition;

// ---- Reward shape ----

export interface QuestReward {
  xp?: number;
  badges?: string[]; // fan_badges keys or artist milestone keys
  unlocks?: string[]; // disclosure keys → quest_unlocks
  proofCard?: boolean;
  content?: string[]; // draft-content keys (Rise Feed post, thank-you draft, ...)
  notifyFans?: boolean;
}

export interface QuestStep {
  title: string;
  hint?: string;
}

// ---- Template (catalog) ----

export interface QuestTemplate {
  key: string;
  title: string;
  subtitle?: string;
  description?: string;
  whyItMatters?: string;
  category: string;
  questType: QuestType;
  requiredRole: QuestRole;
  difficulty: QuestDifficulty;
  estimatedTime?: string;
  requiredFeature?: string;
  levelKey?: string;
  prerequisites?: string[]; // template keys
  steps?: QuestStep[];
  completionCondition: CompletionCondition;
  reward?: QuestReward;
  unlocks?: string[];
  buildTags?: string[]; // artist builds this is prioritized for
  canStreamLive?: boolean;
  repeatable?: boolean;
  priorityScore?: number;
  sortOrder?: number;
  /** On-demand quests (e.g. live quests) are started explicitly, not auto-assigned. */
  onDemand?: boolean;
  /** Artist quest → fan quest templates it spawns for supporters. */
  generatesFanQuests?: string[];
}

// ---- Instance (assigned to a user) ----

export interface QuestInstance {
  id: string;
  user_id: string;
  role: QuestRole;
  artist_id: string | null;
  template_key: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  why_it_matters: string | null;
  category: string;
  quest_type: QuestType;
  difficulty: QuestDifficulty;
  estimated_time: string | null;
  steps: QuestStep[];
  completion_condition: CompletionCondition;
  reward: QuestReward;
  unlocks: string[];
  status: QuestStatus;
  progress_percent: number;
  current_step: number;
  total_steps: number;
  related_campaign_id: string | null;
  related_tier_id: string | null;
  related_product_id: string | null;
  related_mission_id: string | null;
  related_live_id: string | null;
  related_demand_id: string | null;
  related_city_unlock_id: string | null;
  related_bounty_id: string | null;
  related_city: string | null;
  priority_score: number;
  repeatable: boolean;
  can_stream_live: boolean;
  source: string;
  created_by: string;
  expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProgression {
  id: string;
  user_id: string;
  artist_id: string | null;
  scope: 'global' | 'artist';
  role: QuestRole;
  xp: number;
  level: number;
  level_key: string | null;
  streak_count: number;
  longest_streak: number;
  last_active_date: string | null;
  artist_build_primary: string | null;
  artist_build_secondary: string | null;
  fan_role: string | null;
  updated_at: string;
  created_at: string;
}

/** What the evaluator computed for one instance. */
export interface EvalResult {
  done: boolean;
  progressPercent: number;
  current: number;
  target: number;
}

/** Returned by completeQuest for the popup / notification layer. */
export interface CompletionResult {
  completed: boolean;
  alreadyComplete: boolean;
  xpAwarded: number;
  newXp: number;
  newLevel: number;
  leveledUp: boolean;
  unlocked: string[];
  reward: QuestReward;
}

/** A fully-hydrated completion, shaped for the client celebration modal. */
export interface CompletionEvent {
  questId: string;
  templateKey: string | null;
  title: string;
  questType: QuestType;
  difficulty: QuestDifficulty;
  role: QuestRole;
  xpAwarded: number;
  newXp: number;
  newLevel: number;
  leveledUp: boolean;
  levelTitle: string;
  unlocked: string[]; // disclosure keys
  badges: string[]; // badge keys granted
  proofCard: boolean;
}
