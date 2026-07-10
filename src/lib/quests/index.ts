// Quest Engine — public surface. Assignment, prerequisite gating, fetching, and
// connected artist→fan quest generation. All functions take the service-role
// admin client and are best-effort (log-and-degrade, never throw on the hot path).

import { QUEST_TEMPLATES, getTemplate, templatesForRole, fanQuestsForArtistTemplate } from './templates';
import { syncQuest } from './evaluator';
import { levelFromXp } from './progression';
import type { QuestInstance, QuestRole, QuestTemplate, CompletionEvent } from './types';

export * from './types';
export { QUEST_TEMPLATES, getTemplate, templatesForRole, liveQuestTemplates } from './templates';
export { levelFromXp, updateStreak, ARTIST_LEVEL_KEYS, FAN_STAGE_KEYS } from './progression';
export { evaluateCondition, completeQuest, syncQuest } from './evaluator';
export { recommendNextQuest } from './recommend';
export type { QuestRecommendation } from './recommend';

export interface AssignOpts {
  userId: string;
  role: QuestRole;
  artistId: string | null;
  templateKey: string;
  related?: {
    campaignId?: string;
    tierId?: string;
    productId?: string;
    missionId?: string;
    liveId?: string;
    demandId?: string;
    cityUnlockId?: string;
    bountyId?: string;
    city?: string;
  };
  source?: string;
}

function instanceKey(userId: string, templateKey: string, artistId: string | null) {
  return `${userId}:${templateKey}:${artistId ?? 'global'}`;
}

/** Have all of a template's prerequisites been completed by this user for this artist? */
async function prerequisitesMet(admin: any, opts: AssignOpts, template: QuestTemplate): Promise<boolean> {
  const prereqs = template.prerequisites ?? [];
  if (prereqs.length === 0) return true;
  try {
    let q = admin
      .from('quest_instances')
      .select('template_key')
      .eq('user_id', opts.userId)
      .eq('status', 'completed')
      .in('template_key', prereqs);
    q = opts.artistId ? q.eq('artist_id', opts.artistId) : q.is('artist_id', null);
    const { data } = await q;
    const completed = new Set((data ?? []).map((r: any) => r.template_key));
    return prereqs.every((p) => completed.has(p));
  } catch (err) {
    console.error('[quests] prerequisitesMet failed:', err);
    return false;
  }
}

/**
 * Assign a quest to a user if they don't already have an OPEN instance of it.
 * Returns the instance id, or null if skipped (duplicate/unknown/locked).
 */
export async function assignQuest(admin: any, opts: AssignOpts): Promise<string | null> {
  const template = getTemplate(opts.templateKey);
  if (!template) {
    console.error('[quests] assignQuest: unknown template', opts.templateKey);
    return null;
  }

  // Skip if an open (non-terminal) instance already exists.
  try {
    let existing = admin
      .from('quest_instances')
      .select('id, status')
      .eq('user_id', opts.userId)
      .eq('template_key', opts.templateKey)
      .not('status', 'in', '(completed,skipped,expired,failed,archived)');
    existing = opts.artistId ? existing.eq('artist_id', opts.artistId) : existing.is('artist_id', null);
    const { data: open } = await existing.maybeSingle();
    if (open) return open.id;
  } catch {
    /* fall through — the unique index is the real guard */
  }

  // Non-repeatable quests only get assigned once ever.
  if (!template.repeatable) {
    try {
      let done = admin
        .from('quest_instances')
        .select('id')
        .eq('user_id', opts.userId)
        .eq('template_key', opts.templateKey)
        .eq('status', 'completed');
      done = opts.artistId ? done.eq('artist_id', opts.artistId) : done.is('artist_id', null);
      const { data: already } = await done.maybeSingle();
      if (already) return null;
    } catch {
      /* ignore */
    }
  }

  const prereqOk = await prerequisitesMet(admin, opts, template);
  const status = prereqOk ? 'available' : 'locked';

  const r = opts.related ?? {};
  try {
    const { data, error } = await admin
      .from('quest_instances')
      .insert({
        user_id: opts.userId,
        role: opts.role,
        artist_id: opts.artistId,
        template_key: template.key,
        title: template.title,
        subtitle: template.subtitle ?? null,
        description: template.description ?? null,
        why_it_matters: template.whyItMatters ?? null,
        category: template.category,
        quest_type: template.questType,
        difficulty: template.difficulty,
        estimated_time: template.estimatedTime ?? null,
        steps: template.steps ?? [],
        completion_condition: template.completionCondition,
        reward: template.reward ?? {},
        unlocks: template.unlocks ?? [],
        status,
        total_steps: (template.steps ?? []).length,
        related_campaign_id: r.campaignId ?? null,
        related_tier_id: r.tierId ?? null,
        related_product_id: r.productId ?? null,
        related_mission_id: r.missionId ?? null,
        related_live_id: r.liveId ?? null,
        related_demand_id: r.demandId ?? null,
        related_city_unlock_id: r.cityUnlockId ?? null,
        related_bounty_id: r.bountyId ?? null,
        related_city: r.city ?? null,
        priority_score: template.priorityScore ?? 100,
        repeatable: template.repeatable ?? false,
        can_stream_live: template.canStreamLive ?? false,
        source: opts.source ?? 'system',
        created_by: 'system',
      })
      .select('id')
      .single();
    if (error) {
      // Unique-index collision (concurrent assign) is expected and fine.
      if (!String(error.message).includes('duplicate')) {
        console.error('[quests] assignQuest insert failed:', error.message);
      }
      return null;
    }
    return data.id;
  } catch (err) {
    console.error('[quests] assignQuest threw:', err);
    return null;
  }
}

/**
 * Ensure a user holds all currently-eligible quests for their role/artist world.
 * Idempotent: assigns any missing available quests whose prerequisites are met.
 * This is the "quest assignment logic" — call on dashboard load / after actions.
 */
export async function ensureRoleQuests(
  admin: any,
  opts: { userId: string; role: QuestRole; artistId: string | null },
): Promise<number> {
  const templates = templatesForRole(opts.role);
  let assigned = 0;
  for (const t of templates) {
    const id = await assignQuest(admin, {
      userId: opts.userId,
      role: opts.role,
      artistId: opts.artistId,
      templateKey: t.key,
    });
    if (id) assigned++;
  }
  return assigned;
}

/** Fetch a user's quests (optionally filtered by role/status). */
export async function getQuests(
  admin: any,
  opts: { userId: string; role?: QuestRole; statuses?: string[] },
): Promise<QuestInstance[]> {
  try {
    let q = admin.from('quest_instances').select('*').eq('user_id', opts.userId);
    if (opts.role) q = q.eq('role', opts.role);
    if (opts.statuses?.length) q = q.in('status', opts.statuses);
    q = q.order('priority_score', { ascending: false }).order('sort_order', { ascending: true });
    const { data } = await q;
    return (data ?? []) as QuestInstance[];
  } catch (err) {
    console.error('[quests] getQuests failed:', err);
    return [];
  }
}

/**
 * Re-evaluate every open quest for a user and auto-complete any now satisfied.
 * Returns the templates that completed on THIS pass (for popups / notifications).
 */
export async function refreshQuests(
  admin: any,
  opts: { userId: string; role?: QuestRole },
): Promise<{ completions: CompletionEvent[] }> {
  const open = await getQuests(admin, {
    userId: opts.userId,
    role: opts.role,
    statuses: ['available', 'active', 'in_progress', 'ready_to_complete'],
  });
  const completions: CompletionEvent[] = [];
  for (const inst of open) {
    const result = await syncQuest(admin, inst);
    if (result?.completed) {
      completions.push({
        questId: inst.id,
        templateKey: inst.template_key,
        title: inst.title,
        questType: inst.quest_type,
        difficulty: inst.difficulty,
        role: inst.role,
        xpAwarded: result.xpAwarded,
        newXp: result.newXp,
        newLevel: result.newLevel,
        leveledUp: result.leveledUp,
        levelTitle: levelFromXp(inst.role, result.newXp).levelTitle,
        unlocked: result.unlocked,
        badges: result.reward?.badges ?? [],
        proofCard: !!result.reward?.proofCard,
      });
    }
  }
  return { completions };
}

/**
 * When an artist creates something (campaign/offer/live), spawn the connected
 * fan quests for one supporter. Broadcasting to all supporters is a cron/fan-out
 * concern (Phase 3) — this is the per-fan primitive it will call.
 */
export async function generateConnectedFanQuests(
  admin: any,
  opts: { fanId: string; artistId: string; artistTemplateKey: string; related?: AssignOpts['related'] },
): Promise<number> {
  const fanKeys = fanQuestsForArtistTemplate(opts.artistTemplateKey);
  let assigned = 0;
  for (const key of fanKeys) {
    const id = await assignQuest(admin, {
      userId: opts.fanId,
      role: 'fan',
      artistId: opts.artistId,
      templateKey: key,
      related: opts.related,
      source: 'campaign',
    });
    if (id) assigned++;
  }
  return assigned;
}

/** Is the Quest Engine dark-launch flag on? Reads admin_settings.quest_engine. */
export async function isQuestEngineEnabled(admin: any): Promise<boolean> {
  try {
    const { data } = await admin.from('admin_settings').select('value').eq('key', 'quest_engine').maybeSingle();
    return !!data?.value?.enabled;
  } catch {
    return false;
  }
}

/** Unused-import guard: keep the catalog referenced for tree-shaking clarity. */
export const TEMPLATE_COUNT = Object.keys(QUEST_TEMPLATES).length;
