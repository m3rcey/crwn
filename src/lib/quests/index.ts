// Quest Engine — public surface. Assignment, prerequisite gating, fetching, and
// connected artist→fan quest generation. All functions take the service-role
// admin client and are best-effort (log-and-degrade, never throw on the hot path).

import { QUEST_TEMPLATES, getTemplate, templatesForRole, fanQuestsForArtistTemplate } from './templates';
import { syncQuest, evaluateCondition, completeQuest } from './evaluator';
import { levelFromXp } from './progression';
import type { QuestInstance, QuestRole, QuestTemplate, CompletionEvent, EvalResult } from './types';

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

  // Read what the user ALREADY holds in ONE query, then only call assignQuest for
  // templates that are genuinely missing.
  //
  // This used to call assignQuest for all ~72 templates on every single load, and
  // each call costs 3+ round trips (open-instance check, completed check, prereq
  // check) before deciding it has nothing to do. That was ~200 sequential queries
  // per Rise Mode load on an account where the answer was always "already assigned".
  // assignQuest keeps its own guards, so this prefilter is an optimization, not the
  // correctness boundary: a race still lands on the unique index.
  const TERMINAL = ['completed', 'skipped', 'expired', 'failed', 'archived'];
  const openKeys = new Set<string>();
  const completedKeys = new Set<string>();
  try {
    let q = admin
      .from('quest_instances')
      .select('template_key, status')
      .eq('user_id', opts.userId);
    q = opts.artistId ? q.eq('artist_id', opts.artistId) : q.is('artist_id', null);
    const { data: rows } = await q;
    for (const r of rows ?? []) {
      if (r.status === 'completed') completedKeys.add(r.template_key);
      else if (!TERMINAL.includes(r.status)) openKeys.add(r.template_key);
    }
  } catch (err) {
    // Fall through with empty sets: every template gets the old per-template path,
    // which is slow but correct. Never let this optimization break assignment.
    console.error('[quests] ensureRoleQuests prefetch failed:', err);
  }

  // Mirrors assignQuest's own early-returns: an open instance always wins, and a
  // completed instance only blocks a NON-repeatable template.
  const missing = templates.filter(
    (t) => !openKeys.has(t.key) && !(!t.repeatable && completedKeys.has(t.key)),
  );

  let assigned = 0;
  for (const t of missing) {
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
 * Evaluate one instance without letting a single bad quest kill the whole pass.
 * Previously a throw inside syncQuest would reject the sequential loop and blank
 * the board; now one broken condition costs one quest, not the page. Terminal
 * statuses evaluate to null, matching the old syncQuest early-return.
 */
async function safeEvaluate(admin: any, inst: QuestInstance): Promise<EvalResult | null> {
  if (['completed', 'skipped', 'expired', 'failed', 'archived'].includes(inst.status)) return null;
  try {
    return await evaluateCondition(admin, inst);
  } catch (err) {
    console.error('[quests] evaluate failed for', inst.template_key, err);
    return null;
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

  // TWO PHASES, on purpose.
  //
  // Phase 1 (READ) evaluates every open quest CONCURRENTLY. `evaluateCondition` is
  // read-only (count queries), and an artist holds dozens of open quests, so doing
  // this one-at-a-time meant dozens of sequential round trips per pass. The route
  // runs up to 12 passes, so this was the single biggest cost in loading Rise Mode.
  //
  // Phase 2 (WRITE) stays SEQUENTIAL and must stay that way: completeQuest bumps XP
  // on the shared user_progression row with a read-modify-write, so completing two
  // quests concurrently would lose one of the grants.
  const evaluated = await Promise.all(
    open.map(async (inst) => ({ inst, result: await safeEvaluate(admin, inst) })),
  );

  // Progress-percent writes target distinct rows and touch no shared state, so
  // they are safe to run together. Only quests whose progress actually moved.
  await Promise.all(
    evaluated
      .filter(({ inst, result }) => result && !result.done && result.progressPercent !== inst.progress_percent)
      .map(({ inst, result }) =>
        admin
          .from('quest_instances')
          .update({
            progress_percent: result!.progressPercent,
            status: result!.progressPercent > 0 ? 'in_progress' : inst.status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', inst.id)
          .neq('status', 'completed'),
      ),
  );

  for (const { inst, result } of evaluated) {
    if (!result?.done) continue;
    const done = await completeQuest(admin, inst);
    if (!done?.completed) continue;
    completions.push({
      questId: inst.id,
      templateKey: inst.template_key,
      title: inst.title,
      questType: inst.quest_type,
      difficulty: inst.difficulty,
      role: inst.role,
      xpAwarded: done.xpAwarded,
      newXp: done.newXp,
      newLevel: done.newLevel,
      leveledUp: done.leveledUp,
      levelTitle: levelFromXp(inst.role, done.newXp).levelTitle,
      unlocked: done.unlocked,
      badges: done.reward?.badges ?? [],
      proofCard: !!done.reward?.proofCard,
    });
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
    const earning = completed.filter((inst) => ((inst.reward as any)?.xp ?? 0) > 0);
    if (earning.length === 0) return 0;

    // Fetch the whole ledger for these quests in ONE query. This is a self-heal for
    // a historical bug, so on any healthy account EVERY quest already has its row
    // and the per-quest lookup found nothing to do. Doing that lookup one at a time
    // meant a round trip per completed quest on every single Rise Mode load.
    const alreadyGranted = new Set<string>();
    const { data: ledger } = await admin
      .from('xp_ledger')
      .select('quest_instance_id')
      .eq('user_id', opts.userId)
      .eq('reason', 'quest_complete')
      .in('quest_instance_id', earning.map((i) => i.id));
    for (const row of ledger ?? []) alreadyGranted.add(row.quest_instance_id);

    let added = 0;
    // The writes stay SEQUENTIAL: bumpProgressionXp is a read-modify-write on one
    // shared progression row, so concurrent grants would lose XP.
    for (const inst of earning) {
      const xp = (inst.reward as any)?.xp ?? 0;
      if (alreadyGranted.has(inst.id)) continue;
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
