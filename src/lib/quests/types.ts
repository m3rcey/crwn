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
