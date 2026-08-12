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

import { isGovernable, type CommunicationCandidate } from './taxonomy';

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

/*
 * INTERRUPTION ARBITRATION LIVES IN THE POP-UP ENGINE, NOT HERE. (F-07, 2026-08-12)
 *
 * `selectSingleInterruption` used to sit here with zero production callers while the Pop-up
 * Engine independently selected one pop-up per user per day by its own per-popup priorities.
 * Two theoretical owners of "which interruption wins" is exactly the duplicate-authority
 * failure this module exists to prevent, so the unwired one was retired.
 *
 * The formal ownership split:
 *   - Communications Governor (this file): classification and precedence for MULTI-ITEM
 *     channels (the notification feed), through `createNotification`.
 *   - Pop-up Engine (`src/lib/popups`): single-interruption arbitration, because its
 *     per-popup priorities (Stripe 100, first broadcast 80, break-even 75, ... Post-Win
 *     celebration 30) carry product semantics the eight taxonomy classes cannot represent.
 *
 * The precedence INVARIANTS the retired function encoded did not retire with it: they are
 * asserted against the Pop-up Engine registry in `governor.test.ts`, in the layer that
 * actually decides.
 */
