// governor.ts — the Communications Governor. PURE.
//
// No database, no network, no AI, no clock of its own. It imports the taxonomy and nothing else,
// which is what makes the next two sentences enforceable rather than aspirational.
//
// IT GOVERNS ATTENTION, NEVER DIAGNOSIS.
// It decides which of several ALREADY-LEGITIMATE communications should be delivered now, coexist,
// wait, or be withheld. It never decides what is wrong with an artist's business. It does not call
// `readConstraint`, does not evaluate launch readiness, does not decide whether a promise exists
// and does not invent candidates. Every candidate arrives with an owner who already established
// that it is true; the governor only arbitrates attention between them. A governor that diagnosed
// would be a second Constraint Engine, and Z4/Z5 exist to prevent exactly that.
//
// FOUNDER DECISIONS ENCODED HERE (2026-08-11)
// -------------------------------------------
// 1. NO GLOBAL CROSS-CHANNEL CAP. There is deliberately no per-day budget, no message counter and
//    no cross-channel cooldown anywhere in this file. CRWN has no shared send history across
//    email, notifications and pop-ups, so a global cap would be enforced against evidence CRWN
//    does not have, and would suppress real communication to satisfy a number nobody measured.
//    Existing channel-local caps (the pop-up engine's one-per-day, notify-subscribers' 8/day)
//    remain authoritative inside their own channels and are untouched.
// 2. CELEBRATIONS COEXIST, BUT NEVER DISPLACE. In a multi-item channel a celebration is always
//    delivered alongside a fan obligation. Where a channel admits exactly one winner, the
//    obligation wins and the celebration is DEFERRED, never suppressed: it stays eligible for a
//    later moment. Losing an interruption contest is not the same as being cancelled.
//
// UNKNOWN IS UNKNOWN
// ------------------
// Context fields are optional and `undefined` means NOT KNOWN, never `false`. The governor will
// not withhold a communication on the strength of a fact it does not have. This is the same
// discipline as `MetricState`'s missing-is-not-zero, applied to attention.

import {
  classRank,
  isGovernable,
  type CommunicationCandidate,
} from './taxonomy';

export type CommunicationDecision =
  /** Send it. Used for critical and for ungoverned passthrough. */
  | 'deliver'
  /** Send it, alongside other things that are also being sent. Multi-item channels. */
  | 'coexist'
  /** Not now. Still legitimate, still eligible later. NEVER a deletion. */
  | 'defer'
  /** Do not send. Reserved: nothing in V1 produces this, and that is deliberate (see below). */
  | 'suppress';

export interface GovernedResult {
  candidate: CommunicationCandidate;
  decision: CommunicationDecision;
  /** Machine-readable why, for tests and logs. Never rendered to a user. */
  reason: string;
}

/**
 * What the CALLER already knows. Nothing here is fetched: a governor that assembled its own
 * context would put a Constraint Engine read on every notification write.
 *
 * Every field is optional and unknown-safe. A producer that knows nothing passes `{}` and gets
 * today's behavior, which is the correct default for a boundary being introduced under live
 * traffic.
 */
export interface CommsContext {
  /**
   * 'feed'         → many items may be shown together (the notification list).
   * 'interruption' → exactly one candidate may take the moment (a pop-up).
   */
  channel: 'feed' | 'interruption';
  /** True only when the caller has POSITIVELY established an open fan obligation. */
  hasOpenFanObligation?: boolean;
  /** True only when the caller has POSITIVELY established the artist cannot yet take money. */
  launchBlocked?: boolean;
}

/**
 * Govern a set of candidates for a MULTI-ITEM channel.
 *
 * The default is generous on purpose. A notification feed is a list, not an interruption, so the
 * failure mode to avoid is not "too many items", it is "a low-priority nudge dressed as urgent
 * while something that actually matters is buried". V1 therefore classifies and orders, and only
 * defers in the two cases where the caller has POSITIVE evidence that a growth message would
 * currently be misleading.
 */
export function governCommunications(
  context: CommsContext,
  candidates: CommunicationCandidate[],
): GovernedResult[] {
  return candidates.map((candidate) => {
    // Not ours to govern: fan-facing, or the artist's own voice. Straight through.
    if (!isGovernable(candidate)) {
      return { candidate, decision: 'deliver' as const, reason: 'ungoverned:not_crwn_artist_comm' };
    }

    // Transactional and account truth. Fails OPEN through governance, always, in every channel.
    // Nothing optional may ever stand between an artist and a payment or security fact.
    if (candidate.class === 'critical') {
      return { candidate, decision: 'deliver' as const, reason: 'critical:bypass' };
    }

    // Founder decision 2: a celebration is never withheld from a feed because something more
    // important also exists. It coexists; ordering is what expresses the difference.
    if (candidate.class === 'celebration') {
      return { candidate, decision: 'coexist' as const, reason: 'celebration:coexists_in_feed' };
    }

    // Growth must not be the loudest thing in the room when CRWN positively knows the artist
    // cannot take money yet, or owes a paying fan something. Deferred, not suppressed: the
    // opportunity is still real, it is simply not what this moment is for. Note both checks are
    // `=== true`: an unknown context never defers anything.
    if (candidate.class === 'growth' && candidate.deferrable) {
      if (context.launchBlocked === true) {
        return { candidate, decision: 'defer' as const, reason: 'growth:deferred_launch_blocked' };
      }
      if (context.hasOpenFanObligation === true) {
        return { candidate, decision: 'defer' as const, reason: 'growth:deferred_fan_obligation' };
      }
    }

    // Everything else legitimately coexists in a list.
    return { candidate, decision: 'coexist' as const, reason: 'feed:coexists' };
  });
}

/**
 * Choose ONE candidate for a single-interruption channel, and defer the rest.
 *
 * Nothing is suppressed here either. Losing this moment leaves a candidate eligible for the next
 * one, which is precisely what the founder rule requires for celebrations: a fan obligation takes
 * the interruption, and the celebration surfaces later if its own eligibility still holds.
 *
 * NOT wired to the pop-up engine in this task. The pop-up engine already governs its own channel
 * (one per user per day, priority-sorted) and migrating it is a separate decision. This exists so
 * the precedence rule is expressed and tested once, in the layer that owns it.
 */
export function selectSingleInterruption(
  context: CommsContext,
  candidates: CommunicationCandidate[],
): { winner: GovernedResult | null; deferred: GovernedResult[] } {
  const governable = candidates.filter(isGovernable);
  const ungoverned = candidates.filter((c) => !isGovernable(c));

  if (!governable.length) {
    return {
      winner: null,
      deferred: ungoverned.map((candidate) => ({
        candidate,
        decision: 'deliver' as const,
        reason: 'ungoverned:not_crwn_artist_comm',
      })),
    };
  }

  // Stable sort by class precedence. Ties keep the caller's order rather than inventing a
  // tiebreaker, because a tiebreaker would be an opinion the taxonomy has not licensed.
  const ranked = governable
    .map((candidate, i) => ({ candidate, i }))
    .sort((a, b) => classRank(a.candidate.class) - classRank(b.candidate.class) || a.i - b.i);

  const [first, ...rest] = ranked;

  return {
    winner: {
      candidate: first.candidate,
      decision: 'deliver',
      reason: `interruption:won_as_${first.candidate.class}`,
    },
    deferred: [
      ...rest.map(({ candidate }) => ({
        candidate,
        decision: 'defer' as const,
        reason: `interruption:deferred_below_${first.candidate.class}`,
      })),
      ...ungoverned.map((candidate) => ({
        candidate,
        decision: 'deliver' as const,
        reason: 'ungoverned:not_crwn_artist_comm',
      })),
    ],
  };
}
