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

/**
 * Flip locked quests to available once their prerequisites are completed. Needed
 * because assignQuest only checks prereqs at assign-time (when nothing is done yet),
 * so the whole ladder starts locked. Returns how many were unlocked this pass.
 */
export async function unlockEligibleQuests(
  admin: any,
  opts: { userId: string; artistId: string | null },
): Promise<number> {
  try {
    let lq = admin.from('quest_instances').select('id, template_key').eq('user_id', opts.userId).eq('status', 'locked');
    lq = opts.artistId ? lq.eq('artist_id', opts.artistId) : lq.is('artist_id', null);
    const { data: locked } = await lq;
    if (!locked?.length) return 0;

    let cq = admin.from('quest_instances').select('template_key').eq('user_id', opts.userId).eq('status', 'completed');
    cq = opts.artistId ? cq.eq('artist_id', opts.artistId) : cq.is('artist_id', null);
    const { data: done } = await cq;
    const completed = new Set((done ?? []).map((r: any) => r.template_key));

    let count = 0;
    for (const inst of locked) {
      const t = inst.template_key ? getTemplate(inst.template_key) : undefined;
      const prereqs = t?.prerequisites ?? [];
      if (prereqs.every((p) => completed.has(p))) {
        await admin
          .from('quest_instances')
          .update({ status: 'available', updated_at: new Date().toISOString() })
          .eq('id', inst.id)
          .eq('status', 'locked');
        count++;
      }
    }
    return count;
  } catch (err) {
    console.error('[quests] unlockEligibleQuests failed:', err);
    return 0;
  }
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
    // NOTE: order ONLY by columns that exist on quest_instances. `sort_order` lives
    // on quest_templates, NOT instances — ordering by it made PostgREST error and
    // this function silently return [], so NO quest ever completed and the board
    // was always empty. created_at is the safe secondary sort.
    q = q.order('priority_score', { ascending: false }).order('created_at', { ascending: true });
    const { data, error } = await q;
    if (error) {
      console.error('[quests] getQuests query error:', error.message);
      return [];
    }
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

/**
 * Backfill XP for quests that COMPLETED before XP granting worked (the xp_ledger
 * ON CONFLICT bug). For each completed instance with reward.xp that has no ledger
 * row, insert the grant and bump progression. Idempotent + silent (no celebration —
 * these are historical). Self-heals any account stuck at 0 XP. Returns XP added.
 */
export async function reconcileXp(
  admin: any,
  opts: { userId: string; role: QuestRole },
): Promise<number> {
  try {
    const completed = await getQuests(admin, { userId: opts.userId, role: opts.role, statuses: ['completed'] });
    let added = 0;
    for (const inst of completed) {
      const xp = (inst.reward as any)?.xp ?? 0;
      if (xp <= 0) continue;
      const { data: existing } = await admin
        .from('xp_ledger')
        .select('id')
        .eq('user_id', opts.userId)
        .eq('quest_instance_id', inst.id)
        .eq('reason', 'quest_complete')
        .maybeSingle();
      if (existing) continue;
      const { error } = await admin.from('xp_ledger').insert({
        user_id: opts.userId,
        artist_id: inst.artist_id,
        quest_instance_id: inst.id,
        amount: xp,
        reason: 'quest_complete',
      });
      if (error) continue;
      const primaryArtistId = inst.role === 'artist' ? null : inst.artist_id;
      await bumpProgressionXp(admin, opts.userId, primaryArtistId, inst.role, xp);
      if (inst.role === 'fan' && inst.artist_id) {
        await bumpProgressionXp(admin, opts.userId, null, 'fan', xp);
      }
      added += xp;
    }
    return added;
  } catch (err) {
    console.error('[quests] reconcileXp failed:', err);
    return 0;
  }
}

// Minimal XP bump used only by reconciliation (mirrors evaluator.bumpProgression
// but without the celebration return shape). Read-modify-write on user_progression.
async function bumpProgressionXp(
  admin: any,
  userId: string,
  artistId: string | null,
  role: QuestRole,
  deltaXp: number,
): Promise<void> {
  let q = admin.from('user_progression').select('*').eq('user_id', userId);
  q = artistId ? q.eq('artist_id', artistId) : q.is('artist_id', null);
  const { data: existing } = await q.maybeSingle();
  const newXp = (existing?.xp ?? 0) + deltaXp;
  const level = levelFromXp(role, newXp);
  if (existing) {
    await admin
      .from('user_progression')
      .update({ xp: newXp, level: level.level, level_key: level.levelKey, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await admin.from('user_progression').insert({
      user_id: userId,
      artist_id: artistId,
      scope: artistId ? 'artist' : 'global',
      role,
      xp: newXp,
      level: level.level,
      level_key: level.levelKey,
    });
  }
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
