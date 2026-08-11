// tierTransitions.ts — the membership-depth history primitive (Z8).
//
// PURE. No database, no network, no clock of its own. The writer lives in `tierTransitionStore.ts`.
//
// WHAT THIS MEASURES, AND WHAT IT DOES NOT
// ----------------------------------------
// A tier transition is a change in a fan's MEMBERSHIP COMMITMENT STATE with one artist. That is ONE
// component of fan economic value, not a score for the fan. Referrals, one-off purchases, live
// spend, participation and advocacy are all real depth and none of them are here. Nothing in this
// module may be read as "this fan is worth more than that fan".
//
// WHY RAW, NOT LABELLED
// ---------------------
// Rows store `fromTierId` and `toTierId`, never "upgrade" or "downgrade". Direction is DERIVED on
// read from tier price, because a stored label freezes an interpretation that can go wrong: an
// artist can reprice a tier after the fact, and a row that said "upgrade" would then be lying about
// history it can no longer justify. Raw truth ages better than a derived label.
//
// FINANCIAL BOUNDARY
// ------------------
// No money lives here. No GMV, no MRR, no earnings, no fee, no refund. A transition is a state fact;
// any financial interpretation is read from the canonical earnings/subscription rails at query time.

/** Where the fact came from. Reuses the evidence vocabulary the rest of CRWN already speaks. */
export type TransitionEvidence =
  /** A confirmed product/payment state change CRWN watched happen. */
  | 'observed'
  /** A starting position recorded for a membership that already existed. Not a movement. */
  | 'baseline'
  /** Supplied by an external import (Patreon and friends). CRWN did not see the change. */
  | 'imported';

/** The seam that produced the row, so coverage gaps are findable later. */
export type TransitionSource =
  | 'stripe_checkout'
  | 'stripe_subscription_update'
  | 'scheduled_downgrade'
  | 'import'
  | 'baseline';

export interface TierTransition {
  artistId: string;
  fanId: string;
  subscriptionId: string | null;
  /** Null when the fan had no prior paid tier (a first paid subscription, or a baseline row). */
  fromTierId: string | null;
  /** Null when membership ENDED (paid to nothing). Never null on a baseline row. */
  toTierId: string | null;
  /** When the state ACTUALLY changed, not when a request was made. */
  occurredAt: string;
  source: TransitionSource;
  evidence: TransitionEvidence;
  /** Durable identity. One row per key, forever. See `transitionKey`. */
  eventKey: string;
}

/**
 * The durable identity a retry must collide with.
 *
 * Stripe redelivers webhooks, and an internal route can be double-submitted, so a timestamp is not
 * an identity: two deliveries of the same event carry the same `evt_...` id but can be processed
 * seconds apart. Prefer the Stripe event id; fall back to the state change itself, which is
 * naturally unique per subscription because a subscription cannot arrive at the same tier twice in
 * the same minute by two different real events.
 */
export function transitionKey(input: {
  stripeEventId?: string | null;
  subscriptionId?: string | null;
  fanId: string;
  artistId: string;
  toTierId: string | null;
  occurredAt: string;
}): string {
  if (input.stripeEventId) return `evt:${input.stripeEventId}`;
  const minute = input.occurredAt.slice(0, 16); // YYYY-MM-DDTHH:mm
  const subject = input.subscriptionId ?? `${input.artistId}:${input.fanId}`;
  return `sub:${subject}:to:${input.toTierId ?? 'none'}:${minute}`;
}

/** Direction, derived on READ from the prices in force when you ask. Never stored. */
export type TransitionDirection = 'deeper' | 'shallower' | 'lateral' | 'started' | 'ended' | 'unknown';

/**
 * Classify a transition using tier PRICE, which is the ordering production already uses: the live
 * upgrade/downgrade branch in `/api/stripe/subscription-update` decides with
 * `newTier.price > currentTierPrice`. Reusing it means this module cannot disagree with the code
 * that actually charges people.
 *
 * Returns `unknown` rather than guessing when a price is missing (a deleted tier, a pre-migration
 * row). An honest gap beats a fabricated direction.
 */
export function directionOf(
  t: Pick<TierTransition, 'fromTierId' | 'toTierId'>,
  priceOf: (tierId: string) => number | null | undefined,
): TransitionDirection {
  if (!t.fromTierId && t.toTierId) return 'started';
  if (t.fromTierId && !t.toTierId) return 'ended';
  if (!t.fromTierId || !t.toTierId) return 'unknown';

  const from = priceOf(t.fromTierId);
  const to = priceOf(t.toTierId);
  if (typeof from !== 'number' || typeof to !== 'number') return 'unknown';
  if (to > from) return 'deeper';
  if (to < from) return 'shallower';
  return 'lateral';
}

/**
 * Is this a real movement worth recording?
 *
 * The single most important guard in Z8. An artist REPRICING a tier is not a fan moving, and a
 * webhook re-firing with the same tier is not a fan moving either. Only a change of tier identity
 * counts. A same-tier "transition" would manufacture depth movement out of an artist's admin edit.
 */
export function isRealMovement(fromTierId: string | null, toTierId: string | null): boolean {
  if (fromTierId === toTierId) return false; // includes null -> null
  return true;
}

/** Distinct counting. Event count and fan count are different questions (§30). */
export function countMovements(
  transitions: TierTransition[],
  priceOf: (tierId: string) => number | null | undefined,
): { deeperEvents: number; shallowerEvents: number; uniqueFansDeeper: number; uniqueFansShallower: number } {
  const deeperFans = new Set<string>();
  const shallowerFans = new Set<string>();
  let deeperEvents = 0;
  let shallowerEvents = 0;

  for (const t of transitions) {
    // Baseline and imported rows are positions, not movements CRWN witnessed, so they are never
    // counted as an upgrade. Counting an import as an upgrade would invent a change nobody saw.
    if (t.evidence !== 'observed') continue;
    const d = directionOf(t, priceOf);
    if (d === 'deeper') {
      deeperEvents += 1;
      deeperFans.add(t.fanId);
    } else if (d === 'shallower') {
      shallowerEvents += 1;
      shallowerFans.add(t.fanId);
    }
  }

  return {
    deeperEvents,
    shallowerEvents,
    uniqueFansDeeper: deeperFans.size,
    uniqueFansShallower: shallowerFans.size,
  };
}
