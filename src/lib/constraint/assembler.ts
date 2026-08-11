// assembler.ts — SERVER ONLY. Gather the minimum authoritative evidence the pure engine needs.
//
// This is NOT an analytics warehouse. It answers exactly the questions readConstraint asks and
// nothing else, and it reuses the existing owners of each fact rather than re-deriving them:
//
//   launch state       -> the Quest Engine's evaluateCondition (the ONE completion oracle)
//   tier interactions  -> readTierEvidence (the tier evidence reader)
//   churn + benchmark  -> computeChurn (the same function /api/analytics uses)
//   promise health     -> summarizePromiseHealth (the same function the calendar uses)
//
// Every query is filtered by the artist id the CALLER already proved ownership of. Nothing in
// here reads an artist id from a request.

import { evaluateCondition } from '@/lib/quests/evaluator';
import type { DomainCheck, QuestInstance } from '@/lib/quests/types';
import { readTierEvidence } from '@/lib/analytics/tierEvidence';
import { computeChurn } from '@/lib/analytics/retention';
import { onlyFanPromises, summarizePromiseHealth } from '@/lib/fulfillment';
import { CONSTRAINT_THRESHOLDS, type ConstraintThresholds } from './thresholds';
import type { ConstraintEvidence } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: string | Date, to: Date): number | null {
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((to.getTime() - d.getTime()) / DAY_MS));
}

/**
 * Run one DomainCheck through the Quest Engine's own evaluator with a synthetic instance, the
 * same pattern /api/artist/roadmap uses. This is what keeps "has this artist launched" from
 * becoming a second definition that can disagree with the roadmap and the quests.
 */
async function check(
  db: Db,
  args: { artistId: string; userId: string },
  domainCheck: DomainCheck,
): Promise<boolean> {
  try {
    const instance = {
      id: `constraint:${domainCheck}`,
      user_id: args.userId,
      artist_id: args.artistId,
      status: 'active',
      progress_percent: 0,
      completion_condition: { kind: 'domain', check: domainCheck },
    } as unknown as QuestInstance;
    const res = await evaluateCondition(db, instance);
    return res.done;
  } catch {
    return false;
  }
}

export interface AssembleArgs {
  artistId: string;
  userId: string;
  /** Injectable for tests so the snapshot is deterministic. */
  now?: Date;
  thresholds?: ConstraintThresholds;
}

/**
 * Build the evidence snapshot. Every field that cannot be established honestly comes back
 * null, never zero: the engine treats null as "cannot evaluate this stage", and that
 * distinction is what stops a missing table from reading as a failing artist.
 */
export async function assembleConstraintEvidence(
  db: Db,
  args: AssembleArgs,
): Promise<ConstraintEvidence> {
  const t = args.thresholds ?? CONSTRAINT_THRESHOLDS;
  const now = args.now ?? new Date();
  const nowIso = now.toISOString();
  const { artistId, userId } = args;

  const reachFrom = new Date(now.getTime() - t.reach.lookbackDays * DAY_MS);
  const captureFrom = new Date(now.getTime() - t.freeCapture.lookbackDays * DAY_MS);
  const promiseFrom = new Date(now.getTime() - t.fulfillment.lookbackDays * DAY_MS);
  const tierFrom = new Date(now.getTime() - t.paidTierInterest.lookbackDays * DAY_MS);
  const monthStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  // ---- Launch state, through the shared completion oracle ----
  const [stripeConnected, tierPurchasable, hasTrack] = await Promise.all([
    check(db, { artistId, userId }, 'artist_stripe_connected'),
    check(db, { artistId, userId }, 'artist_tier_purchasable'),
    check(db, { artistId, userId }, 'artist_has_track'),
  ]);

  // ---- Artist row: slug (page live) and age ----
  let slug: string | null = null;
  let daysLive: number | null = null;
  try {
    const { data } = await db
      .from('artist_profiles')
      .select('slug, created_at')
      .eq('id', artistId)
      .maybeSingle();
    slug = data?.slug ?? null;
    daysLive = data?.created_at ? daysBetween(data.created_at, now) : null;
  } catch {
    /* leave null */
  }

  // ---- Reach: unique daily visitor rows in the lookback ----
  let uniqueVisits: number | null = null;
  try {
    const { data, error } = await db
      .from('artist_page_visits')
      .select('visitor_hash')
      .eq('artist_id', artistId)
      .gte('visit_date', reachFrom.toISOString().slice(0, 10));
    // Unique VISITORS, not visit-days: someone who returns on five days is one person who
    // found you, and counting them five times would overstate reach exactly where reach is
    // the thing being judged.
    if (!error) {
      uniqueVisits = new Set((data ?? []).map((v: { visitor_hash: string }) => v.visitor_hash)).size;
    }
  } catch {
    /* leave null: the engine refuses to diagnose downstream of unknown traffic */
  }

  // ---- Membership: tiers + subscriptions, one read each ----
  let freeMembers: number | null = null;
  let paidMembers: number | null = null;
  let freeJoinsInWindow: number | null = null;
  let daysSinceFirstFreeMember: number | null = null;
  let mrrCents: number | null = null;
  let premiumMrrShare: number | null = null;
  let churnRatePct: number | null = null;

  let tierPriceById = new Map<string, number>();
  try {
    const [{ data: tierRows }, { data: subRows }] = await Promise.all([
      db.from('subscription_tiers').select('id, price').eq('artist_id', artistId).eq('is_active', true),
      db
        .from('subscriptions')
        .select('tier_id, status, created_at, canceled_at')
        .eq('artist_id', artistId),
    ]);

    tierPriceById = new Map(
      (tierRows ?? []).map((r: { id: string; price: number | null }) => [r.id, Number(r.price) || 0]),
    );

    const subs = (subRows ?? []) as {
      tier_id: string | null;
      status: string | null;
      created_at: string;
      canceled_at?: string | null;
    }[];

    const active = subs.filter((s) => s.status === 'active');
    const priceOf = (s: { tier_id: string | null }) =>
      s.tier_id ? tierPriceById.get(s.tier_id) ?? 0 : 0;

    freeMembers = active.filter((s) => priceOf(s) === 0).length;
    const paid = active.filter((s) => priceOf(s) > 0);
    paidMembers = paid.length;
    mrrCents = paid.reduce((sum, s) => sum + priceOf(s), 0);

    // Free joins inside the capture window, matched to the same visitors window.
    freeJoinsInWindow = subs.filter(
      (s) => priceOf(s) === 0 && new Date(s.created_at).getTime() >= captureFrom.getTime(),
    ).length;

    // The first free member EVER, which is what makes "they have had time to be asked" real.
    const freeCreatedAts = subs
      .filter((s) => priceOf(s) === 0)
      .map((s) => new Date(s.created_at).getTime())
      .filter((ms) => !Number.isNaN(ms));
    if (freeCreatedAts.length > 0) {
      daysSinceFirstFreeMember = daysBetween(new Date(Math.min(...freeCreatedAts)), now);
    }

    // Depth: share of paid MRR from the top two rungs BY PRICE. Artists rename their tiers, so
    // rank by price and never by name (the same rule the tier template and waterfall use).
    if (mrrCents > 0) {
      const paidPrices = [...new Set([...tierPriceById.values()].filter((p) => p > 0))].sort((a, b) => b - a);
      const topTwo = new Set(paidPrices.slice(0, 2));
      const premiumCents = paid.filter((s) => topTwo.has(priceOf(s))).reduce((sum, s) => sum + priceOf(s), 0);
      premiumMrrShare = premiumCents / mrrCents;
    }

    churnRatePct = computeChurn(subs, monthStartIso).churnRatePct;
  } catch {
    /* leave nulls */
  }

  // ---- Has this artist EVER been paid? Read the money, not a funnel mirror. ----
  let hasFirstPaidConversion: boolean | null = null;
  try {
    const { count, error } = await db
      .from('earnings')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .gt('net_amount', 0);
    if (!error) hasFirstPaidConversion = (count ?? 0) > 0;
  } catch {
    /* leave null */
  }

  // ---- Platform churn benchmark, the same shape /api/analytics uses ----
  let platformChurnRatePct: number | null = null;
  try {
    const { data, error } = await db
      .from('subscriptions')
      .select('status, created_at, canceled_at')
      .limit(5000);
    if (!error) platformChurnRatePct = computeChurn(data ?? [], monthStartIso).churnRatePct;
  } catch {
    /* leave null: without a benchmark the engine will not judge retention */
  }

  let cancelReasonResponses: number | null = null;
  try {
    const { data: subIdRows } = await db.from('subscriptions').select('id').eq('artist_id', artistId);
    const ids = (subIdRows ?? []).map((r: { id: string }) => r.id);
    if (ids.length > 0) {
      const { count, error } = await db
        .from('cancellation_reasons')
        .select('id', { count: 'exact', head: true })
        .eq('context', 'fan')
        .in('subscription_id', ids);
      if (!error) cancelReasonResponses = count ?? 0;
    } else {
      cancelReasonResponses = 0;
    }
  } catch {
    /* leave null */
  }

  // ---- Promises, through the shared health summary ----
  let promiseSummary: ReturnType<typeof summarizePromiseHealth> | null = null;
  let oldestOverdue: { title: string; dueAt: string } | null = null;
  // Still PENDING and already past due. Counted straight off the rows rather than out of the
  // health summary, because the summary folds past-grace pending events in with rows the cron
  // already swept to `missed`, and those are different facts: one is still deliverable today,
  // the other is a verdict already recorded. The engine acts on the deliverable one.
  let overdueNow: number | null = null;
  try {
    const { data, error } = await db
      .from('fulfillment_events')
      .select('title, status, due_at, completed_at, metadata')
      .eq('artist_id', artistId)
      .gte('due_at', promiseFrom.toISOString())
      .order('due_at', { ascending: true })
      .limit(500);
    if (!error) {
      // ONLY promises owed to FANS. The Revenue Ramp writes the artist's own private growth plan
      // into these same tables (that is deliberate, it puts dated work where they already look),
      // and counting it here made a stale personal to-do read as a broken promise to someone who
      // had paid. FULFILLMENT outranks every growth stage, so that one row could suppress the real
      // diagnosis indefinitely. See `isFanPromiseEvent` in src/lib/fulfillment.ts.
      const events = onlyFanPromises(
        (data ?? []) as {
          title: string;
          status: string | null;
          due_at: string | null;
          completed_at: string | null;
          metadata: Record<string, unknown> | null;
        }[],
      );
      promiseSummary = summarizePromiseHealth(events, now);

      const stillOverdue = events.filter(
        (e) => e.status === 'pending' && e.due_at && new Date(e.due_at).getTime() < now.getTime(),
      );
      overdueNow = stillOverdue.length;
      // Rows arrive ordered by due_at ascending, so the first is the oldest.
      const oldest = stillOverdue[0];
      if (oldest?.due_at) oldestOverdue = { title: oldest.title, dueAt: oldest.due_at };
    }
  } catch {
    /* leave null */
  }

  // ---- Tier interactions, through the tier evidence reader ----
  let interactionDataAvailable = false;
  let paidRungs: ConstraintEvidence['tiers']['paidRungs'] = [];
  try {
    const evidence = await readTierEvidence(db, {
      artistId,
      from: tierFrom.toISOString(),
      to: nowIso,
    });
    interactionDataAvailable = evidence.limitations.interactionDataAvailable;
    paidRungs = evidence.tiers
      .filter((r) => !r.isFree)
      .map((r) => ({
        tierId: r.tierId,
        tierName: r.tierName,
        priceCents: r.priceCents,
        views: r.views,
        checkoutStarts: r.checkoutStarts,
        joins: r.joins,
      }));
  } catch {
    /* leave unavailable */
  }

  return {
    now: nowIso,
    launch: {
      pageLive: !!slug,
      stripeConnected,
      tierPurchasable,
      hasTrack,
      daysLive,
    },
    reach: { uniqueVisits, lookbackDays: t.reach.lookbackDays },
    membership: {
      freeMembers,
      paidMembers,
      freeJoinsInWindow,
      daysSinceFirstFreeMember,
      hasFirstPaidConversion,
      mrrCents,
      premiumMrrShare,
    },
    tiers: { interactionDataAvailable, paidRungs, lookbackDays: t.paidTierInterest.lookbackDays },
    promises: {
      resolved: promiseSummary?.resolved ?? null,
      completed: promiseSummary?.completed ?? null,
      missed: promiseSummary?.missed ?? null,
      completionRate: promiseSummary?.completionRate ?? null,
      overdueNow,
      oldestOverdue,
      lookbackDays: t.fulfillment.lookbackDays,
    },
    retention: { churnRatePct, platformChurnRatePct, cancelReasonResponses },
    slug,
  };
}
