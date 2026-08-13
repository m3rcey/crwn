// types.ts — the Constraint Engine's vocabulary.
//
// The engine answers ONE question: what is the earliest thing currently limiting this artist's
// direct-to-fan revenue, what evidence says so, and what is the single next move?
//
// It is a DECISION system, not an analytics system. Everything here is derived on read and
// stored nowhere, so a definition can be corrected retroactively across all history.

export const CONSTRAINT_TYPES = [
  'FULFILLMENT',
  'RETENTION',
  'REACH',
  'FREE_CAPTURE',
  'FIRST_PAID',
  'PAID_TIER_INTEREST',
  'CHECKOUT_COMPLETION',
  'DEPTH',
] as const;

export type ConstraintType = (typeof CONSTRAINT_TYPES)[number];

/**
 * Sample sufficiency, never a model's judgement.
 *  - at the minimum sample: `medium`
 *  - at highConfidenceSampleMultiple x the minimum: `high`
 *  - below the minimum: there is no diagnosis at all, not a `low` one
 *
 * `low` exists for stages whose signal is categorical rather than sampled (an overdue promise
 * is real at n = 1, but one overdue promise is not yet a pattern).
 */
export type ConfidenceLevel = 'low' | 'medium' | 'high';

/** One line of visible proof. Every diagnosis must show its work. */
export interface EvidenceItem {
  /** Plain sentence an artist can check against their own memory. */
  label: string;
  /** Machine-readable so a later surface can render it differently without re-deriving. */
  metric: string;
  value: number | null;
  /** Present when the value is a rate, so the UI never has to guess at formatting. */
  unit?: 'count' | 'rate' | 'days' | 'cents' | 'multiple';
}

/**
 * Exactly one corrective action. Never a menu: a list of three things to try is how an artist
 * ends the session having done none of them.
 */
export interface CorrectiveAction {
  /** Button-length label, e.g. "Import your fan contacts". */
  label: string;
  /** One sentence on why this specific move, loss-framed where honest. */
  why: string;
  /** An EXISTING route. The engine never invents a destination. */
  href: string;
  /**
   * The DomainCheck that proves this action was taken, when one exists. Read-only: the engine
   * NEVER completes a quest, awards XP or mutates roadmap state. This is here so a future
   * surface can show "done" without inventing a second completion oracle.
   */
  verifiedBy?: string | null;
}

export interface DiagnosedConstraint {
  status: 'diagnosed';
  constraint: ConstraintType;
  confidence: ConfidenceLevel;
  /** Neutral, never blaming. "Fans are viewing Silver but few start checkout." */
  title: string;
  explanation: string;
  evidence: EvidenceItem[];
  action: CorrectiveAction;
  evaluatedAt: string;
}

export interface InsufficientEvidence {
  status: 'insufficient_evidence';
  /** Why no diagnosis was made, in plain words. Shown to nobody by default. */
  reason: string;
  /** What would have to exist before a diagnosis is possible. */
  missingEvidence: string[];
  evaluatedAt: string;
}

export type ConstraintResult = DiagnosedConstraint | InsufficientEvidence;

export function isDiagnosed(r: ConstraintResult): r is DiagnosedConstraint {
  return r.status === 'diagnosed';
}

// ---------------------------------------------------------------------------
// The evidence the pure function consumes
// ---------------------------------------------------------------------------

/**
 * A normalized snapshot. EVERY field is nullable where the underlying fact may be genuinely
 * unknown, and the engine treats null as "cannot evaluate this stage" rather than as zero.
 * That distinction is the whole safety property: "nobody looked at your page" and "we have no
 * view data" are opposite facts with opposite correct responses.
 */
export interface ConstraintEvidence {
  /** ISO instant the snapshot was taken. Threaded through so the result is pure. */
  now: string;

  launch: {
    /** artist_profiles.slug exists and the page is live. */
    pageLive: boolean;
    /** DomainCheck artist_stripe_connected: charges enabled, milestone written. */
    stripeConnected: boolean;
    /** DomainCheck artist_tier_purchasable: a paid tier with a real Stripe price. */
    tierPurchasable: boolean;
    /** DomainCheck artist_has_track. */
    hasTrack: boolean;
    /** Whole days since the artist row was created. Null when unknown. */
    daysLive: number | null;
  };

  reach: {
    /** Unique daily visitors in the reach lookback. Null when unavailable. */
    uniqueVisits: number | null;
    lookbackDays: number;
  };

  membership: {
    /** Active subscriptions on a $0 tier. */
    freeMembers: number | null;
    /** Active subscriptions on a tier priced above 0. */
    paidMembers: number | null;
    /** Free joins created inside the freeCapture lookback. */
    freeJoinsInWindow: number | null;
    /** Whole days since the first free member ever joined. Null when there are none. */
    daysSinceFirstFreeMember: number | null;
    /** Has this artist EVER been paid by a fan (funnel first_paid_conversion / earnings). */
    hasFirstPaidConversion: boolean | null;
    /** Sum of active paid members' tier prices, in cents. */
    mrrCents: number | null;
    /** Share of paid MRR from the top two rungs by price. Null when there is no paid MRR. */
    premiumMrrShare: number | null;
  };

  tiers: {
    /** True when tier_events could be read at all (false pre-migration). */
    interactionDataAvailable: boolean;
    /** Per paid rung, ascending by price. The free rung is excluded: it has no checkout. */
    paidRungs: {
      tierId: string;
      tierName: string;
      priceCents: number;
      views: number;
      checkoutStarts: number;
      joins: number;
    }[];
    lookbackDays: number;
  };

  promises: {
    /** Promises that reached a verdict (completed + missed) in the lookback. */
    resolved: number | null;
    completed: number | null;
    missed: number | null;
    /** completed / resolved. Null on a zero denominator. */
    completionRate: number | null;
    /** Pending and past due right now, whatever the grace period. */
    overdueNow: number | null;
    /**
     * The oldest overdue promise, for the action. `id` is the `fulfillment_events` row id, and
     * it is here so the corrective action can deep-link to the exact obligation instead of
     * dropping the artist on a calendar to find again what CRWN just named for them. It is a
     * pointer, never authority: the Promise Calendar loads the artist's OWN events and matches,
     * so an id that is not theirs simply matches nothing.
     */
    oldestOverdue: { id: string; title: string; dueAt: string } | null;
    lookbackDays: number;
  };

  retention: {
    /** This artist's monthly churn, as a percentage (matching /api/analytics). */
    churnRatePct: number | null;
    /** Platform-wide monthly churn percentage over the same window. */
    platformChurnRatePct: number | null;
    /** Count of cancellation_reasons rows available to read. */
    cancelReasonResponses: number | null;
  };

  /** The artist's public slug, for share destinations. Null falls back to a safe route. */
  slug: string | null;
}
