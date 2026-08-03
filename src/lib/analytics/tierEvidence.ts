// tierEvidence.ts — derived, per-rung evidence about the four-tier ladder.
//
// EVIDENCE, NOT ADVICE. This module answers "what happened on each rung" and stops there. It
// contains no thresholds, no recommendations, no scoring and no pricing logic. The
// deterministic Constraint Engine is the intended consumer and is deliberately NOT built here.
//
// DERIVED ON READ, like the roadmap, the strategy brain and the starter offer. Nothing
// computed here is stored. A conversion rate written to a table is a definition frozen at the
// moment it was wrong; derived on read, the same definition can be corrected retroactively
// across all history.
//
// Financial values are read from the authoritative rows (subscription_tiers.price, in cents,
// like every price in this codebase). No arithmetic is duplicated from the calculators, and
// no revenue is recomputed here: MRR and earnings already have exactly one owner each.

import { TIER_EVENT_TYPES } from './tierEvents';

// ---------------------------------------------------------------------------
// Pure math
// ---------------------------------------------------------------------------

export interface TierCounts {
  views: number;
  checkoutStarts: number;
  joins: number;
  activeMembers: number;
  canceledMembers: number;
}

export interface TierRates {
  /** checkoutStarts / views. Null when there were no views. */
  viewToCheckout: number | null;
  /** joins / checkoutStarts. Null when nobody started checkout. */
  checkoutToPaid: number | null;
  /** joins / views. Null when there were no views. */
  viewToPaid: number | null;
}

/**
 * Rates from counts. Every rate is null on a zero denominator, never 0.
 *
 * This is the single most important line in the file. "Nobody looked at this tier" and
 * "everybody looked and nobody bought" are opposite diagnoses with opposite fixes, and a 0%
 * that silently means "no data" is how a product tells an artist to fix the wrong thing.
 */
export function computeTierRates(counts: TierCounts): TierRates {
  const { views, checkoutStarts, joins } = counts;
  return {
    viewToCheckout: views > 0 ? checkoutStarts / views : null,
    checkoutToPaid: checkoutStarts > 0 ? joins / checkoutStarts : null,
    viewToPaid: views > 0 ? joins / views : null,
  };
}

export interface TierEvidenceRow extends TierCounts, TierRates {
  tierId: string;
  tierName: string;
  /** Integer cents, straight off subscription_tiers.price. */
  priceCents: number;
  /** 0-based rank by price ascending. The free rung is 0 when one exists. */
  rank: number;
  isFree: boolean;
}

export interface TierEvidenceLimitations {
  /**
   * True when tier-interaction rows exist for the range. False means the migration has not
   * run, or the range predates instrumentation, and view-based rates will all be null.
   */
  interactionDataAvailable: boolean;
  /**
   * ALWAYS false today, and it is not an oversight.
   *
   * `subscriptions` carries a UNIQUE (fan_id, artist_id) and every write is an UPSERT on that
   * pair, so a fan moving from Silver to Gold OVERWRITES tier_id in place. The previous rung
   * is gone; there is no transition row and no history table. Upgrade and downgrade rates are
   * therefore not derivable from the current schema and are reported as unavailable rather
   * than estimated. Fabricating them from cancel-and-resubscribe patterns would be a guess
   * presented as a measurement.
   */
  upgradeHistoryAvailable: boolean;
  notes: string[];
}

export interface TierEvidence {
  from: string;
  to: string;
  tiers: TierEvidenceRow[];
  totals: TierCounts & TierRates;
  limitations: TierEvidenceLimitations;
}

export interface TierRecord {
  id: string;
  name: string;
  price: number | null;
  is_active?: boolean | null;
}

export interface SubscriptionRecord {
  tier_id: string | null;
  status: string | null;
  created_at?: string | null;
  canceled_at?: string | null;
}

export interface TierEventRecord {
  tier_id: string | null;
  event_type: string | null;
}

/**
 * Assemble per-tier evidence from already-fetched rows. Pure, so the whole metric surface is
 * testable without a database.
 *
 * `joins` counts subscriptions CREATED inside the range (the conversion that the views and
 * checkout starts in that same range could have produced). `activeMembers` is a point-in-time
 * headcount and is deliberately not range-filtered: those are different questions and merging
 * them would make the join rate drift as old members churn.
 */
export function assembleTierEvidence(args: {
  tiers: TierRecord[];
  events: TierEventRecord[];
  subscriptions: SubscriptionRecord[];
  from: string;
  to: string;
  /** False when the tier_events table could not be read (pre-migration). */
  interactionDataAvailable?: boolean;
}): TierEvidence {
  const { tiers, events, subscriptions, from, to } = args;

  const inRange = (iso: string | null | undefined): boolean => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return false;
    return t >= new Date(from).getTime() && t < new Date(to).getTime();
  };

  const viewsByTier = new Map<string, number>();
  const startsByTier = new Map<string, number>();
  for (const e of events) {
    if (!e.tier_id) continue;
    if (e.event_type === 'tier_card_viewed') {
      viewsByTier.set(e.tier_id, (viewsByTier.get(e.tier_id) ?? 0) + 1);
    } else if (e.event_type === 'tier_checkout_started') {
      startsByTier.set(e.tier_id, (startsByTier.get(e.tier_id) ?? 0) + 1);
    }
  }

  const joinsByTier = new Map<string, number>();
  const activeByTier = new Map<string, number>();
  const canceledByTier = new Map<string, number>();
  for (const s of subscriptions) {
    if (!s.tier_id) continue;
    if (inRange(s.created_at)) joinsByTier.set(s.tier_id, (joinsByTier.get(s.tier_id) ?? 0) + 1);
    if (s.status === 'active') activeByTier.set(s.tier_id, (activeByTier.get(s.tier_id) ?? 0) + 1);
    if (s.status === 'canceled' && inRange(s.canceled_at)) {
      canceledByTier.set(s.tier_id, (canceledByTier.get(s.tier_id) ?? 0) + 1);
    }
  }

  // Rank by price ascending: the ladder's own order, independent of the names an artist chose.
  const ordered = [...tiers].sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));

  const rows: TierEvidenceRow[] = ordered.map((t, i) => {
    const priceCents = Number(t.price) || 0;
    const counts: TierCounts = {
      views: viewsByTier.get(t.id) ?? 0,
      checkoutStarts: startsByTier.get(t.id) ?? 0,
      joins: joinsByTier.get(t.id) ?? 0,
      activeMembers: activeByTier.get(t.id) ?? 0,
      canceledMembers: canceledByTier.get(t.id) ?? 0,
    };
    return {
      tierId: t.id,
      tierName: t.name,
      priceCents,
      rank: i,
      isFree: priceCents === 0,
      ...counts,
      ...computeTierRates(counts),
    };
  });

  const totalCounts: TierCounts = rows.reduce<TierCounts>(
    (acc, r) => ({
      views: acc.views + r.views,
      // A free rung never produces a checkout start, so it contributes 0 here and the ladder
      // total stays an honest denominator for the paid rungs.
      checkoutStarts: acc.checkoutStarts + r.checkoutStarts,
      joins: acc.joins + r.joins,
      activeMembers: acc.activeMembers + r.activeMembers,
      canceledMembers: acc.canceledMembers + r.canceledMembers,
    }),
    { views: 0, checkoutStarts: 0, joins: 0, activeMembers: 0, canceledMembers: 0 },
  );

  const notes: string[] = [];
  if (!args.interactionDataAvailable) {
    notes.push(
      'Tier interaction events are unavailable for this range, so view-based rates are null. This is expected before schema-phase2-tier-events.sql is applied, or for a range that predates it.',
    );
  }
  notes.push(
    'Upgrade and downgrade rates are not derivable: subscriptions are unique per (fan, artist) and an upgrade overwrites tier_id in place, leaving no transition history.',
  );

  return {
    from,
    to,
    tiers: rows,
    totals: { ...totalCounts, ...computeTierRates(totalCounts) },
    limitations: {
      interactionDataAvailable: !!args.interactionDataAvailable,
      upgradeHistoryAvailable: false,
      notes,
    },
  };
}

// ---------------------------------------------------------------------------
// Server reader
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

/**
 * Read one artist's tier evidence for a date range.
 *
 * The caller is responsible for proving ownership of `artistId` (the route does this from the
 * SESSION, never from the request body). Every query here is filtered by that id, so one
 * artist's rows can never appear in another artist's response.
 *
 * Fail-soft on the events table only: before the migration runs, tier_events does not exist
 * and the correct behavior is an evidence object with null view rates and a stated limitation,
 * not a 500 that hides the counts CRWN can already produce.
 */
export async function readTierEvidence(
  db: Db,
  args: { artistId: string; from: string; to: string },
): Promise<TierEvidence> {
  const { artistId, from, to } = args;

  const [tiersRes, subsRes] = await Promise.all([
    db
      .from('subscription_tiers')
      .select('id, name, price, is_active')
      .eq('artist_id', artistId)
      .eq('is_active', true),
    db
      .from('subscriptions')
      .select('tier_id, status, created_at, canceled_at')
      .eq('artist_id', artistId),
  ]);

  let events: TierEventRecord[] = [];
  let interactionDataAvailable = false;
  try {
    const { data, error } = await db
      .from('tier_events')
      .select('tier_id, event_type')
      .eq('artist_id', artistId)
      .in('event_type', [...TIER_EVENT_TYPES])
      .gte('event_date', from.slice(0, 10))
      .lt('event_date', to.slice(0, 10));
    if (!error) {
      events = (data ?? []) as TierEventRecord[];
      interactionDataAvailable = true;
    }
  } catch {
    /* pre-migration: leave interactionDataAvailable false */
  }

  return assembleTierEvidence({
    tiers: (tiersRes.data ?? []) as TierRecord[],
    events,
    subscriptions: (subsRes.data ?? []) as SubscriptionRecord[],
    from,
    to,
    interactionDataAvailable,
  });
}
