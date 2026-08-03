// thresholds.ts — the ONE place every constraint threshold lives.
//
// FOUNDER-ADJUSTABLE POLICY. None of these numbers is a measured truth. They are starting
// values chosen so that a diagnosis never fires on a sample too small to mean anything, and
// they are expected to move once CRWN has real cohorts. Changing one is a one-line edit here,
// with no migration and no redeploy of anything but the app.
//
// The rule that matters more than any individual number: a threshold is a MINIMUM SAMPLE, not
// a target. Below it the engine returns `insufficient_evidence` and the artist keeps seeing
// their normal roadmap step. A weak diagnosis is worse than no diagnosis, because it sends an
// artist to rebuild something that was never actually tested.

export interface ConstraintThresholds {
  fulfillment: {
    /** Due promises before a completion RATE means anything. */
    minimumDuePromises: number;
    /** Below this share of resolved promises kept, fulfillment is the constraint. */
    minimumCompletionRate: number;
    lookbackDays: number;
  };
  retention: {
    /** Paid members before churn is a signal rather than one person leaving. */
    minimumPaidMembers: number;
    /** Multiple of the platform benchmark that counts as unhealthy. */
    unhealthyBenchmarkMultiplier: number;
  };
  reach: {
    /** Days live before "nobody visited" is the artist's problem to solve. */
    minimumDaysLive: number;
    /** Visits in the lookback below which reach is the constraint. */
    minimumVisitsForEvaluation: number;
    lookbackDays: number;
  };
  freeCapture: {
    /** Visits before a capture RATE is meaningful. */
    minimumVisits: number;
    /** Free joins per visit at or above which capture is healthy. */
    minimumHealthyRate: number;
    lookbackDays: number;
  };
  firstPaid: {
    /** Free members before "nobody upgraded" is evidence of an offer problem. */
    minimumFreeMembers: number;
    /** Time for the free list to have been asked at least once. */
    minimumDaysSinceFirstFreeMember: number;
  };
  paidTierInterest: {
    /** Views of a paid tier before a checkout-start rate is meaningful. */
    minimumTierViews: number;
    /** Checkout starts per view at or above which interest is healthy. */
    minimumCheckoutStartRate: number;
    lookbackDays: number;
  };
  checkoutCompletion: {
    /** Checkout starts before a completion rate is meaningful. */
    minimumCheckoutStarts: number;
    /** Joins per checkout start at or above which checkout is healthy. */
    minimumCompletionRate: number;
    lookbackDays: number;
  };
  depth: {
    /** Paid members before the ladder's SHAPE can be judged. */
    minimumPaidMembers: number;
    /** Share of paid MRR from the top two rungs at or above which depth is healthy. */
    minimumPremiumMrrShare: number;
  };
  confidence: {
    /**
     * Multiple of the minimum sample at which a diagnosis is `high` rather than `medium`.
     * Confidence is sample sufficiency, never a model's opinion.
     */
    highConfidenceSampleMultiple: number;
  };
}

export const CONSTRAINT_THRESHOLDS: ConstraintThresholds = {
  // Fulfillment and retention come FIRST in the evaluation order (see engine.ts), so their
  // thresholds are the ones most likely to change an artist's day. Both are deliberately
  // conservative: telling someone they are failing their supporters is the highest-cost
  // message the product can send, and it must never fire on three promises and a bad month.
  fulfillment: {
    minimumDuePromises: 5,
    minimumCompletionRate: 0.6,
    lookbackDays: 90,
  },
  retention: {
    minimumPaidMembers: 10,
    unhealthyBenchmarkMultiplier: 1.5,
  },
  reach: {
    minimumDaysLive: 7,
    minimumVisitsForEvaluation: 100,
    lookbackDays: 30,
  },
  freeCapture: {
    minimumVisits: 200,
    minimumHealthyRate: 0.02,
    lookbackDays: 30,
  },
  firstPaid: {
    minimumFreeMembers: 50,
    minimumDaysSinceFirstFreeMember: 30,
  },
  paidTierInterest: {
    minimumTierViews: 100,
    minimumCheckoutStartRate: 0.05,
    lookbackDays: 30,
  },
  checkoutCompletion: {
    minimumCheckoutStarts: 20,
    minimumCompletionRate: 0.3,
    lookbackDays: 30,
  },
  depth: {
    minimumPaidMembers: 20,
    minimumPremiumMrrShare: 0.2,
  },
  confidence: {
    highConfidenceSampleMultiple: 2,
  },
};

/** The widest lookback any stage asks for. The assembler fetches once, at this window. */
export function maxLookbackDays(t: ConstraintThresholds = CONSTRAINT_THRESHOLDS): number {
  return Math.max(
    t.fulfillment.lookbackDays,
    t.reach.lookbackDays,
    t.freeCapture.lookbackDays,
    t.paidTierInterest.lookbackDays,
    t.checkoutCompletion.lookbackDays,
  );
}
