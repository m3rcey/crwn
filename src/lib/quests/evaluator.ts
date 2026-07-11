// Quest Engine — completion evaluator + completion transaction.
//
// Progress is DERIVED, never client-asserted: read from authoritative domain
// tables (subscriptions, subscription_tiers, products, tracks, road_campaigns)
// and the shared fan_events log. This is also what finally lets a fan mission
// advance past 'joined' — the "no event source exists yet" note in
// schema-phase2-mission-participants.sql.
//
// All functions take the SERVICE-ROLE admin client (they bypass RLS by design)
// and are best-effort: they log and degrade rather than throw on a bad read.

import { levelFromXp } from './progression';
import { awardFanBadge } from '@/lib/fanBadges';
import { createNotification } from '@/lib/notifications';
import type {
  QuestInstance,
  EvalResult,
  CompletionResult,
  QuestReward,
  QuestRole,
  CompletionCondition,
} from './types';

const EMPTY_EVAL: EvalResult = { done: false, progressPercent: 0, current: 0, target: 1 };

function pct(current: number, target: number): number {
  if (target <= 0) return current > 0 ? 100 : 0;
  return Math.min(100, Math.round((current / target) * 100));
}

// --- fan_events counting (supports fan-scoped counts the shared helper lacks) ---

async function countEvents(
  admin: any,
  opts: {
    artistId: string | null;
    fanId?: string;
    eventType: string;
    refKind?: string;
    refId?: string;
    sinceDays?: number;
  },
): Promise<number> {
  try {
    let q = admin.from('fan_events').select('id', { count: 'exact', head: true }).eq('event_type', opts.eventType);
    if (opts.artistId) q = q.eq('artist_id', opts.artistId);
    if (opts.fanId) q = q.eq('fan_id', opts.fanId);
    if (opts.refKind) q = q.eq('ref_kind', opts.refKind);
    if (opts.refId) q = q.eq('ref_id', opts.refId);
    if (opts.sinceDays) {
      const since = new Date(Date.now() - opts.sinceDays * 86400000).toISOString();
      q = q.gte('created_at', since);
    }
    const { count } = await q;
    return count || 0;
  } catch (err) {
    console.error('[quests] countEvents failed:', err);
    return 0;
  }
}

async function countActive(admin: any, table: string, match: Record<string, unknown>): Promise<number> {
  try {
    let q = admin.from(table).select('id', { count: 'exact', head: true });
    for (const [k, v] of Object.entries(match)) {
      // is_active was added to tracks/products/tiers AFTER rows existed, and the
      // onboarding creators don't set it, so many real rows have is_active = NULL.
      // NULL means "active" (not soft-deleted). Match TRUE-or-NULL, exclude only FALSE.
      if (k === 'is_active' && v === true) {
        q = q.not('is_active', 'is', false);
      } else {
        q = q.eq(k, v);
      }
    }
    const { count } = await q;
    return count || 0;
  } catch (err) {
    console.error(`[quests] countActive(${table}) failed:`, err);
    return 0;
  }
}

async function evalDomain(admin: any, instance: QuestInstance, cond: Extract<CompletionCondition, { kind: 'domain' }>): Promise<EvalResult> {
  const artistId = instance.artist_id;
  const userId = instance.user_id;
  const target = cond.count ?? 1;

  switch (cond.check) {
    case 'artist_has_tier': {
      const n = artistId ? await countActive(admin, 'subscription_tiers', { artist_id: artistId, is_active: true }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_has_product': {
      const n = artistId ? await countActive(admin, 'products', { artist_id: artistId, is_active: true }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_has_free_tier': {
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count } = await admin
          .from('subscription_tiers')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .not('is_active', 'is', false)
          .eq('price', 0);
        const n = count || 0;
        return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_has_paid_offer': {
      if (!artistId) return EMPTY_EVAL;
      try {
        const { count: tierC } = await admin
          .from('subscription_tiers')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .not('is_active', 'is', false)
          .gt('price', 0);
        let n = tierC || 0;
        if (n === 0) {
          const { count: prodC } = await admin
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('artist_id', artistId)
            .not('is_active', 'is', false)
            .gt('price', 0);
          n = prodC || 0;
        }
        return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_has_offer': {
      if (!artistId) return EMPTY_EVAL;
      const tiers = await countActive(admin, 'subscription_tiers', { artist_id: artistId, is_active: true });
      const products = tiers > 0 ? 0 : await countActive(admin, 'products', { artist_id: artistId, is_active: true });
      const n = tiers + products;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_has_track': {
      const n = artistId ? await countActive(admin, 'tracks', { artist_id: artistId, is_active: true }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_has_campaign': {
      const n = artistId ? await countActive(admin, 'road_campaigns', { artist_id: artistId }) : 0;
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'artist_has_avatar': {
      try {
        const { data } = await admin.from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
        const has = !!data?.avatar_url;
        return { done: has, progressPercent: has ? 100 : 0, current: has ? 1 : 0, target: 1 };
      } catch {
        return EMPTY_EVAL;
      }
    }
    case 'artist_supporter_count': {
      const n = artistId ? await countActive(admin, 'subscriptions', { artist_id: artistId, status: 'active' }) : 0;
      return { done: n >= target, progressPercent: pct(n, target), current: n, target };
    }
    case 'fan_has_subscription': {
      if (!artistId) return EMPTY_EVAL;
      const n = await countActive(admin, 'subscriptions', { fan_id: userId, artist_id: artistId, status: 'active' });
      return { done: n >= 1, progressPercent: n >= 1 ? 100 : 0, current: n, target: 1 };
    }
    case 'fan_referral_count': {
      // Authoritative: count real referral attributions, not a client "invite" tap.
      const n = await countActive(admin, 'referrals', { referrer_fan_id: userId });
      return { done: n >= target, progressPercent: pct(n, target), current: n, target };
    }
    case 'fan_supported_count': {
      try {
        const { data } = await admin
          .from('subscriptions')
          .select('artist_id')
          .eq('fan_id', userId)
          .eq('status', 'active');
        const distinct = new Set((data ?? []).map((r: any) => r.artist_id)).size;
        return { done: distinct >= target, progressPercent: pct(distinct, target), current: distinct, target };
      } catch {
        return EMPTY_EVAL;
      }
    }
    default:
      return EMPTY_EVAL;
  }
}

/** Compute live progress for a quest instance from its completion condition. */
export async function evaluateCondition(admin: any, instance: QuestInstance): Promise<EvalResult> {
  const cond = instance.completion_condition;
  if (!cond || cond.kind === 'manual') {
    // Manual quests only complete via completeQuest() — mirror stored progress.
    return {
      done: instance.status === 'completed',
      progressPercent: instance.progress_percent,
      current: instance.status === 'completed' ? 1 : 0,
      target: 1,
    };
  }
  if (cond.kind === 'fan_event') {
    const current = await countEvents(admin, {
      artistId: cond.scope === 'artist' ? instance.artist_id : instance.artist_id,
      fanId: cond.scope === 'artist' ? undefined : instance.user_id,
      eventType: cond.eventType,
      refKind: cond.refKind,
      refId: cond.refId,
      sinceDays: cond.sinceDays,
    });
    const target = cond.count;
    return { done: current >= target, progressPercent: pct(current, target), current, target };
  }
  if (cond.kind === 'domain') {
    return evalDomain(admin, instance, cond);
  }
  return EMPTY_EVAL;
}

// --- XP / progression writes (read-modify-write; acceptable for per-user cadence) ---

async function bumpProgression(
  admin: any,
  userId: string,
  artistId: string | null,
  role: QuestRole,
  deltaXp: number,
): Promise<{ oldXp: number; newXp: number; leveledUp: boolean; newLevel: number; levelKey: string }> {
  const scope = artistId ? 'artist' : 'global';
  let q = admin.from('user_progression').select('*').eq('user_id', userId);
  q = artistId ? q.eq('artist_id', artistId) : q.is('artist_id', null);
  const { data: existing } = await q.maybeSingle();

  const oldXp = existing?.xp ?? 0;
  const newXp = oldXp + deltaXp;
  const oldLevel = levelFromXp(role, oldXp);
  const newLevel = levelFromXp(role, newXp);

  if (existing) {
    await admin
      .from('user_progression')
      .update({ xp: newXp, level: newLevel.level, level_key: newLevel.levelKey, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await admin.from('user_progression').insert({
      user_id: userId,
      artist_id: artistId,
      scope,
      role,
      xp: newXp,
      level: newLevel.level,
      level_key: newLevel.levelKey,
    });
  }

  return {
    oldXp,
    newXp,
    leveledUp: newLevel.level > oldLevel.level,
    newLevel: newLevel.level,
    levelKey: newLevel.levelKey,
  };
}

async function recordUnlocks(admin: any, instance: QuestInstance, keys: string[]): Promise<string[]> {
  const done: string[] = [];
  for (const key of keys) {
    try {
      // Skip if already unlocked (partial unique indexes make upsert-onConflict awkward).
      let existsQ = admin.from('quest_unlocks').select('id').eq('user_id', instance.user_id).eq('unlock_key', key);
      existsQ = instance.artist_id ? existsQ.eq('artist_id', instance.artist_id) : existsQ.is('artist_id', null);
      const { data: found } = await existsQ.maybeSingle();
      if (found) continue;
      await admin.from('quest_unlocks').insert({
        user_id: instance.user_id,
        artist_id: instance.artist_id,
        unlock_key: key,
        source_quest_id: instance.id,
      });
      done.push(key);
    } catch (err) {
      console.error('[quests] recordUnlock failed:', key, err);
    }
  }
  return done;
}

/**
 * Complete a quest: idempotently flip status, grant XP once (xp_ledger), record
 * unlocks, and bump level. Safe to call repeatedly — a second call returns
 * { alreadyComplete: true } and grants nothing.
 */
export async function completeQuest(admin: any, instance: QuestInstance): Promise<CompletionResult> {
  const reward: QuestReward = instance.reward ?? {};
  const noop: CompletionResult = {
    completed: false,
    alreadyComplete: instance.status === 'completed',
    xpAwarded: 0,
    newXp: 0,
    newLevel: 1,
    leveledUp: false,
    unlocked: [],
    reward,
  };
  if (instance.status === 'completed') return noop;

  // 1. Flip status — guard on the pre-state so concurrent calls can't double-run.
  const { data: flipped } = await admin
    .from('quest_instances')
    .update({
      status: 'completed',
      progress_percent: 100,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', instance.id)
    .neq('status', 'completed')
    .select('id');

  if (!flipped || flipped.length === 0) {
    // Someone else completed it first.
    return { ...noop, alreadyComplete: true };
  }

  // 2. Grant XP via the ledger. Check-then-insert (NOT ON CONFLICT): the ledger's
  // unique index is PARTIAL, which Postgres can't use as an upsert arbiter — that
  // silently errored and XP never accrued. The status flip above already guarantees
  // this block runs at most once per instance, so a plain check-then-insert is safe.
  const xp = reward.xp ?? 0;
  let xpAwarded = 0;
  let bump = { oldXp: 0, newXp: 0, leveledUp: false, newLevel: 1, levelKey: '' };
  if (xp > 0) {
    const { data: existingLedger } = await admin
      .from('xp_ledger')
      .select('id')
      .eq('user_id', instance.user_id)
      .eq('quest_instance_id', instance.id)
      .eq('reason', 'quest_complete')
      .maybeSingle();

    let granted = false;
    if (!existingLedger) {
      const { error: insErr } = await admin.from('xp_ledger').insert({
        user_id: instance.user_id,
        artist_id: instance.artist_id,
        quest_instance_id: instance.id,
        amount: xp,
        reason: 'quest_complete',
      });
      granted = !insErr;
    }

    if (granted) {
      xpAwarded = xp;
      // Artists have one world → their XP lives on the GLOBAL row (artist_id NULL),
      // which is what the board reads. Fans accrue per-artist AND mirror to global
      // for cross-artist reputation.
      const primaryArtistId = instance.role === 'artist' ? null : instance.artist_id;
      bump = await bumpProgression(admin, instance.user_id, primaryArtistId, instance.role, xp);
      if (instance.role === 'fan' && instance.artist_id) {
        await bumpProgression(admin, instance.user_id, null, 'fan', xp);
      }
    }
  }

  // 3. Record unlocks (disclosure only — never grants access).
  const unlockKeys = [...(instance.unlocks ?? []), ...(reward.unlocks ?? [])];
  const unlocked = unlockKeys.length ? await recordUnlocks(admin, instance, [...new Set(unlockKeys)]) : [];

  // 4. Grant badges + fire notifications (all best-effort — never break completion).
  await grantRewardsAndNotify(admin, instance, reward, bump.leveledUp).catch((err) =>
    console.error('[quests] reward side-effects failed (non-fatal):', err),
  );

  return {
    completed: true,
    alreadyComplete: false,
    xpAwarded,
    newXp: bump.newXp,
    newLevel: bump.newLevel,
    leveledUp: bump.leveledUp,
    unlocked,
    reward,
  };
}

// Badges + notifications on completion. Fan badges go through the existing
// awardFanBadge (idempotent, already notifies fan + artist). Artist badges are
// carried as reward metadata (the completed quest IS the record — no new table).
// notifications.type is a hard CHECK enum, so every insert is .catch()'d: if the
// ALTER migration hasn't landed the row is skipped, completion still succeeds.
async function grantRewardsAndNotify(
  admin: any,
  instance: QuestInstance,
  reward: QuestReward,
  leveledUp: boolean,
): Promise<void> {
  const badges = reward.badges ?? [];
  if (instance.role === 'fan' && instance.artist_id && badges.length) {
    for (const badgeKey of badges) {
      await awardFanBadge(admin, {
        artistId: instance.artist_id,
        fanId: instance.user_id,
        badgeKey,
        source: 'mission',
        sourceId: instance.id,
      });
    }
  }

  const link = instance.role === 'artist' ? '/profile/artist?tab=rise' : '/home';
  const isMilestone = instance.quest_type === 'boss_quest' || instance.difficulty === 'boss';

  // Celebration copy: self-contained (no denormalized subtitle, which can be stale)
  // and always ends in "!" because it is a win.
  await createNotification(
    admin,
    instance.user_id,
    isMilestone ? 'quest_milestone' : 'quest_completed',
    isMilestone ? '🏆 Milestone passed!' : '✅ Quest complete!',
    isMilestone ? `You hit a big one: ${instance.title}!` : `You finished "${instance.title}". Keep rising!`,
    link,
  ).catch(() => {});

  if (leveledUp) {
    await createNotification(
      admin,
      instance.user_id,
      'level_up',
      '⬆️ You leveled up!',
      instance.role === 'artist' ? 'Your movement reached a new level!' : 'Your supporter status just rose!',
      link,
    ).catch(() => {});
  }
}

/**
 * Re-evaluate an instance and auto-complete it if its condition is now met.
 * Also mirrors live progress back onto the row. Returns the completion result
 * when it completed this call, else null.
 */
export async function syncQuest(admin: any, instance: QuestInstance): Promise<CompletionResult | null> {
  if (['completed', 'skipped', 'expired', 'failed', 'archived'].includes(instance.status)) return null;
  const result = await evaluateCondition(admin, instance);

  if (result.done) {
    return completeQuest(admin, instance);
  }

  // Not done — persist progress if it moved.
  if (result.progressPercent !== instance.progress_percent) {
    const nextStatus = result.progressPercent > 0 ? 'in_progress' : instance.status;
    await admin
      .from('quest_instances')
      .update({ progress_percent: result.progressPercent, status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', instance.id)
      .neq('status', 'completed');
  }
  return null;
}
