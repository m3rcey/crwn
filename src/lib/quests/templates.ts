// Quest Engine — the template catalog (code = source of truth).
//
// These definitions are STATIC config, like the thresholds in src/lib/milestones.ts.
// syncTemplatesToDb() upserts them into quest_templates by `key` so the DB has a
// queryable catalog; AI/admin/artist-authored quests can also be inserted there.
//
// This Phase-1 seed is a REPRESENTATIVE connected set (artist Levels 1-3, fan
// Stages 1-2) that proves the engine end to end, not the full spec catalogue.
// Adding the rest is data entry against this same shape.

import type { QuestTemplate } from './types';

// ---------------------------------------------------------------------------
// ARTIST — Level 1: Setup
// ---------------------------------------------------------------------------
const ARTIST_SETUP: QuestTemplate[] = [
  {
    key: 'artist_add_photo',
    title: 'Add your artist photo',
    subtitle: 'Make your CRWN look real',
    whyItMatters: 'Supporters trust a face. A photo lifts profile conversion more than any other single field.',
    category: 'setup',
    questType: 'onboarding_quest',
    requiredRole: 'artist',
    difficulty: 'easy',
    estimatedTime: 'under 2 minutes',
    levelKey: 'setup',
    completionCondition: { kind: 'domain', check: 'artist_has_avatar' },
    reward: { xp: 25, badges: [], unlocks: ['rise_feed'] },
    priorityScore: 300,
    sortOrder: 10,
  },
  {
    key: 'artist_upload_first_track',
    title: 'Upload a track fans can’t get anywhere else',
    subtitle: 'An unreleased song, demo, or exclusive. Not on Spotify',
    whyItMatters:
      'A fan needs a reason to follow you HERE instead of just streaming you. Something they can only get on your CRWN is that reason.',
    category: 'setup',
    questType: 'main_quest',
    requiredRole: 'artist',
    difficulty: 'easy',
    estimatedTime: '10 minutes',
    levelKey: 'setup',
    steps: [
      { title: 'Pick a track fans can’t hear elsewhere' },
      { title: 'Upload it' },
      { title: 'Choose who gets it (free or supporters)' },
    ],
    completionCondition: { kind: 'domain', check: 'artist_has_track' },
    reward: { xp: 50 },
    priorityScore: 290,
    sortOrder: 20,
  },
  {
    key: 'artist_create_free_tier',
    title: 'Create a free tier',
    subtitle: 'Your front door: the easiest yes',
    whyItMatters:
      'A free tier is the top of your funnel. Casual listeners join for free, land on your list, and become the people you later convert to paid supporters. Skip it and you have nowhere for new fans to start.',
    category: 'offer',
    questType: 'main_quest',
    requiredRole: 'artist',
    difficulty: 'easy',
    estimatedTime: '5 minutes',
    requiredFeature: 'offer_builder',
    levelKey: 'setup',
    prerequisites: ['artist_upload_first_track'],
    steps: [
      { title: 'Name it (e.g. “The Circle”)' },
      { title: 'Keep the price at $0' },
      { title: 'Add what free followers get' },
      { title: 'Publish' },
    ],
    completionCondition: { kind: 'domain', check: 'artist_has_free_tier' },
    reward: { xp: 50, unlocks: ['supporter_leaderboard'] },
    priorityScore: 285,
    sortOrder: 25,
  },
  {
    key: 'artist_build_first_offer',
    title: 'Create a paid supporter tier',
    subtitle: 'Load it with the exclusives only supporters get',
    whyItMatters:
      'This is where fans become income. Put your best assets behind it (unreleased tracks, behind-the-scenes, early access) so supporting you is an obvious deal.',
    category: 'offer',
    questType: 'main_quest',
    requiredRole: 'artist',
    difficulty: 'medium',
    estimatedTime: '10 minutes',
    requiredFeature: 'offer_builder',
    levelKey: 'setup',
    prerequisites: ['artist_create_free_tier'],
    steps: [
      { title: 'Set a monthly price' },
      { title: 'Add what supporters get: exclusive tracks, perks, early access' },
      { title: 'Publish' },
    ],
    completionCondition: { kind: 'domain', check: 'artist_has_paid_offer' },
    reward: { xp: 100, badges: ['first_offer_built'], content: ['rise_feed_offer_post'] },
    priorityScore: 280,
    sortOrder: 30,
    generatesFanQuests: ['fan_subscribe_to_artist'],
  },
];

// ---------------------------------------------------------------------------
// ARTIST — Level 2: First Supporters
// ---------------------------------------------------------------------------
const ARTIST_FIRST_SUPPORTERS: QuestTemplate[] = [
  {
    key: 'artist_first_supporter',
    title: 'Get your first paid supporter',
    subtitle: 'Turn attention into your first believer',
    whyItMatters: 'The first dollar is the hardest and the most important. It proves the model works for you.',
    category: 'support',
    questType: 'boss_quest',
    requiredRole: 'artist',
    difficulty: 'hard',
    estimatedTime: 'multi-day',
    levelKey: 'first_supporters',
    prerequisites: ['artist_build_first_offer'],
    completionCondition: { kind: 'domain', check: 'artist_supporter_count', count: 1 },
    reward: { xp: 250, badges: ['first_supporter'], content: ['thank_you_draft'], notifyFans: true },
    priorityScore: 270,
    sortOrder: 10,
  },
  {
    key: 'artist_ten_supporters',
    title: 'Reach 10 supporters',
    subtitle: 'Your CRWN is officially moving',
    whyItMatters: 'Ten paying supporters is real momentum. That is enough signal to justify campaigns and missions.',
    category: 'support',
    questType: 'boss_quest',
    requiredRole: 'artist',
    difficulty: 'boss',
    estimatedTime: 'multi-day',
    levelKey: 'first_supporters',
    prerequisites: ['artist_first_supporter'],
    completionCondition: { kind: 'domain', check: 'artist_supporter_count', count: 10 },
    reward: {
      xp: 500,
      badges: ['first_10_supporters'],
      unlocks: ['fan_missions', 'campaign_hub'],
      content: ['milestone_post_draft'],
      notifyFans: true,
    },
    priorityScore: 260,
    sortOrder: 20,
  },
];

// ---------------------------------------------------------------------------
// ARTIST — Level 3: Campaign Starter
// ---------------------------------------------------------------------------
const ARTIST_CAMPAIGN_STARTER: QuestTemplate[] = [
  {
    key: 'artist_create_road_campaign',
    title: 'Launch your first Road To campaign',
    subtitle: 'Give fans a goal to rally around',
    whyItMatters: 'A campaign converts passive fans into active backers with a shared finish line.',
    category: 'campaign',
    questType: 'main_quest',
    requiredRole: 'artist',
    difficulty: 'medium',
    estimatedTime: '15 minutes',
    requiredFeature: 'campaign_hub',
    levelKey: 'campaign_starter',
    prerequisites: ['artist_ten_supporters'],
    steps: [
      { title: 'Name your campaign' },
      { title: 'Set a goal' },
      { title: 'Choose rewards' },
      { title: 'Attach an offer' },
      { title: 'Launch' },
    ],
    completionCondition: { kind: 'domain', check: 'artist_has_campaign' },
    reward: { xp: 250, badges: ['campaign_starter'], unlocks: ['road_to_pages'], content: ['campaign_share_card'] },
    canStreamLive: true,
    priorityScore: 250,
    sortOrder: 10,
    generatesFanQuests: ['fan_back_campaign', 'fan_share_campaign', 'fan_invite_friend'],
  },
];

// ---------------------------------------------------------------------------
// FAN — Stage 1: Discover
// ---------------------------------------------------------------------------
const FAN_DISCOVER: QuestTemplate[] = [
  {
    key: 'fan_listen_first_track',
    title: "Listen to a track",
    subtitle: 'Start with the music',
    category: 'discovery',
    questType: 'onboarding_quest',
    requiredRole: 'fan',
    difficulty: 'easy',
    estimatedTime: 'under 2 minutes',
    levelKey: 'discover',
    completionCondition: { kind: 'fan_event', eventType: 'like', scope: 'fan', count: 1 },
    reward: { xp: 10, badges: ['listener'] },
    priorityScore: 200,
    sortOrder: 10,
  },
];

// ---------------------------------------------------------------------------
// FAN — Stage 2: Support (+ connected campaign quests)
// ---------------------------------------------------------------------------
const FAN_SUPPORT: QuestTemplate[] = [
  {
    key: 'fan_subscribe_to_artist',
    title: 'Become a supporter',
    subtitle: 'Join a tier and unlock supporter perks',
    whyItMatters: 'Supporting early is how you prove you were here first, and it directly funds the rise.',
    category: 'support',
    questType: 'daily_assignment',
    requiredRole: 'fan',
    difficulty: 'medium',
    estimatedTime: '5 minutes',
    levelKey: 'support',
    completionCondition: { kind: 'domain', check: 'fan_has_subscription' },
    reward: { xp: 100, badges: ['supporter', 'day_one'], proofCard: true },
    priorityScore: 190,
    sortOrder: 10,
  },
  {
    key: 'fan_back_campaign',
    title: "Back the campaign",
    subtitle: 'Help push the current mission over the line',
    whyItMatters: 'Backers are named on the wall. This is the moment you become part of the story.',
    category: 'support',
    questType: 'campaign_quest',
    requiredRole: 'fan',
    difficulty: 'medium',
    estimatedTime: '5 minutes',
    levelKey: 'support',
    // Matches the signal the existing /api/road-campaigns/[id]/support route emits
    // (event_type 'custom', ref_kind 'campaign'). Money-campaign backing is refined
    // in Phase 3 when the connected campaign fan-out is wired.
    completionCondition: { kind: 'fan_event', eventType: 'custom', refKind: 'campaign', scope: 'fan', count: 1 },
    reward: { xp: 100, proofCard: true },
    priorityScore: 185,
    sortOrder: 20,
  },
  {
    key: 'fan_share_campaign',
    title: 'Share the campaign',
    subtitle: 'Post the campaign clip and bring people in',
    whyItMatters: 'One share can bring the supporter that unlocks the goal. Your reach is the artist’s reach.',
    category: 'promotion',
    questType: 'daily_assignment',
    requiredRole: 'fan',
    difficulty: 'easy',
    estimatedTime: 'under 2 minutes',
    levelKey: 'support',
    completionCondition: { kind: 'fan_event', eventType: 'share', refKind: 'campaign', scope: 'fan', count: 1 },
    reward: { xp: 25, proofCard: true },
    repeatable: true,
    priorityScore: 180,
    sortOrder: 30,
  },
  {
    key: 'fan_invite_friend',
    title: 'Invite one friend',
    subtitle: 'Bring someone into the movement',
    whyItMatters: 'Referrals are the highest-impact thing a fan can do, and they can earn you commission.',
    category: 'promotion',
    questType: 'daily_assignment',
    requiredRole: 'fan',
    difficulty: 'easy',
    estimatedTime: '5 minutes',
    levelKey: 'support',
    completionCondition: { kind: 'domain', check: 'fan_referral_count', count: 1 },
    reward: { xp: 50, badges: ['promoter'], proofCard: true },
    repeatable: true,
    priorityScore: 175,
    sortOrder: 40,
  },
];

// ---------------------------------------------------------------------------
// LIVE QUEST MODE — on-demand artist quests streamed with fans participating.
// Minimal set (3 types); more are data additions against this same shape. These
// are NOT auto-assigned — the artist starts one from the Live Quest launcher,
// which ties it to a live session and spawns the connected fan quests.
// ---------------------------------------------------------------------------
const LIVE_QUESTS: QuestTemplate[] = [
  {
    key: 'live_build_offer',
    title: 'Build an Offer (Live)',
    subtitle: 'Create your supporter offer with fans in the room',
    whyItMatters: 'Building live turns a solo task into a moment. Fans tell you what they want and buy it on the spot.',
    category: 'offer',
    questType: 'live_quest',
    requiredRole: 'artist',
    difficulty: 'medium',
    estimatedTime: '30 minutes',
    completionCondition: { kind: 'domain', check: 'artist_has_offer' },
    reward: { xp: 150, badges: ['live_commander'], content: ['rise_feed_offer_post'] },
    canStreamLive: true,
    onDemand: true,
    priorityScore: 120,
    generatesFanQuests: ['fan_subscribe_to_artist'],
  },
  {
    key: 'live_launch_campaign',
    title: 'Launch a Campaign (Live)',
    subtitle: 'Set a goal and rally the room to hit it',
    whyItMatters: 'A campaign launched live gets its first backers before the stream ends. Momentum is the whole game.',
    category: 'campaign',
    questType: 'live_quest',
    requiredRole: 'artist',
    difficulty: 'hard',
    estimatedTime: '30 minutes',
    completionCondition: { kind: 'domain', check: 'artist_has_campaign' },
    reward: { xp: 200, badges: ['live_commander'], content: ['campaign_share_card'] },
    canStreamLive: true,
    onDemand: true,
    priorityScore: 120,
    generatesFanQuests: ['fan_back_campaign', 'fan_share_campaign', 'fan_invite_friend'],
  },
  {
    key: 'live_final_push',
    title: 'Campaign Final Push (Live)',
    subtitle: 'Countdown live while fans share, buy, and clip',
    whyItMatters: 'The last hours decide it. A live push converts the fence-sitters who were waiting for a reason.',
    category: 'campaign',
    questType: 'live_quest',
    requiredRole: 'artist',
    difficulty: 'medium',
    estimatedTime: '1 hour',
    completionCondition: { kind: 'manual' },
    reward: { xp: 150, content: ['campaign_share_card'] },
    canStreamLive: true,
    onDemand: true,
    priorityScore: 115,
    generatesFanQuests: ['fan_share_campaign', 'fan_back_campaign', 'fan_invite_friend'],
  },
];

const ALL_TEMPLATES: QuestTemplate[] = [
  ...ARTIST_SETUP,
  ...ARTIST_FIRST_SUPPORTERS,
  ...ARTIST_CAMPAIGN_STARTER,
  ...LIVE_QUESTS,
  ...FAN_DISCOVER,
  ...FAN_SUPPORT,
];

export const QUEST_TEMPLATES: Record<string, QuestTemplate> = Object.fromEntries(
  ALL_TEMPLATES.map((t) => [t.key, t]),
);

export function getTemplate(key: string): QuestTemplate | undefined {
  return QUEST_TEMPLATES[key];
}

export function templatesForRole(role: 'artist' | 'fan'): QuestTemplate[] {
  // On-demand quests (live quests) are excluded — they're started explicitly,
  // never auto-assigned by ensureRoleQuests.
  return ALL_TEMPLATES.filter((t) => t.requiredRole === role && !t.onDemand).sort(
    (a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0),
  );
}

/** The on-demand Live Quest templates an artist can start from the launcher. */
export function liveQuestTemplates(): QuestTemplate[] {
  return ALL_TEMPLATES.filter((t) => t.onDemand && t.requiredRole === 'artist');
}

/** Fan quest template keys an artist quest spawns for supporters. */
export function fanQuestsForArtistTemplate(key: string): string[] {
  return getTemplate(key)?.generatesFanQuests ?? [];
}

/**
 * Upsert the code catalog into quest_templates (idempotent, by key). Call from an
 * admin/cron route after deploy so the DB catalog matches code. Best-effort.
 */
export async function syncTemplatesToDb(admin: any): Promise<{ synced: number }> {
  let synced = 0;
  for (const t of ALL_TEMPLATES) {
    try {
      const { error } = await admin.from('quest_templates').upsert(
        {
          key: t.key,
          title: t.title,
          subtitle: t.subtitle ?? null,
          description: t.description ?? null,
          why_it_matters: t.whyItMatters ?? null,
          category: t.category,
          quest_type: t.questType,
          required_role: t.requiredRole,
          difficulty: t.difficulty,
          estimated_time: t.estimatedTime ?? null,
          required_feature: t.requiredFeature ?? null,
          level_key: t.levelKey ?? null,
          prerequisites: t.prerequisites ?? [],
          steps: t.steps ?? [],
          completion_condition: t.completionCondition,
          reward: t.reward ?? {},
          unlocks: t.unlocks ?? [],
          build_tags: t.buildTags ?? [],
          can_stream_live: t.canStreamLive ?? false,
          repeatable: t.repeatable ?? false,
          priority_score: t.priorityScore ?? 100,
          sort_order: t.sortOrder ?? 0,
          source: 'system',
          created_by: 'system',
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );
      if (!error) synced++;
    } catch (err) {
      console.error('[quests] syncTemplate failed:', t.key, err);
    }
  }
  return { synced };
}
