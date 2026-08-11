// recommendationOutcome.ts — the Z3 evidence primitive: what CRWN recommended, whether the artist
// acted, and what the metric CRWN was trying to move did afterwards.
//
// PURE. No database, no network, no AI, no clock of its own (`now` is threaded in). Everything here
// is a function of a ConstraintResult the existing engine produced, so this file adds NO second
// opinion about what is limiting an artist. `readConstraint` stays the only diagnosis in CRWN.
//
// THE DISTINCTION THIS FILE EXISTS TO PRESERVE
// --------------------------------------------
// A completed action is NOT a successful recommendation. CRWN recommends "deliver your overdue
// promise", the artist delivers it, and the promise completion rate may still be below the
// threshold, or unmeasurable, or worse for unrelated reasons. Those are four different facts and
// this module keeps them four different fields:
//
//   recommendation -> what CRWN said, and what it believed at the time (baseline)
//   action         -> whether the DomainCheck that proves the move now passes
//   observation    -> the same metric, re-read later from the same rail
//   outcome        -> whether the CONSTRAINT cleared, which is not the same as either
//
// WHAT THIS MAY NEVER CLAIM
// -------------------------
// Causality. Anything else the artist did in the window is invisible to this record, and several
// recommendations can target the same metric. The vocabulary is therefore deliberately associative
// ("cleared while this was open"), never "this recommendation produced that result". No field in
// here is named `caused`, `impact`, `attributed` or `score`, and none should ever be.

import type { ConstraintThresholds } from './thresholds';
import { CONSTRAINT_THRESHOLDS } from './thresholds';
import type {
  ConfidenceLevel,
  ConstraintResult,
  ConstraintType,
  DiagnosedConstraint,
  EvidenceItem,
} from './types';
import { isDiagnosed } from './types';
// The canonical evidence vocabulary. Reused rather than redefined: the Money Model already
// distinguishes complete / modeled / missing, and a second set of words for the same idea is how a
// codebase ends up unable to compare its own numbers.
import type { MetricState } from '@/lib/frl/economics';

/** One metric as it stood at a point in time. `value: null` is MISSING, never zero. */
export interface ObservedMetric {
  /** Machine-readable key from the engine's own EvidenceItem. Never the prose label. */
  metric: string;
  value: number | null;
  unit?: EvidenceItem['unit'];
  state: MetricState;
}

/**
 * How a recommendation ended, measured by RE-RUNNING the existing engine rather than by comparing
 * numbers against a threshold invented here.
 *
 * `constraint_cleared` means the artist is no longer diagnosed with this constraint. It does NOT
 * mean this recommendation cleared it.
 */
export type OutcomeState =
  | 'not_measured_yet'
  | 'insufficient_evidence'
  | 'constraint_cleared'
  | 'constraint_persists';

/** A recommendation as it is issued. Baseline is captured here and never rewritten. */
export interface IssuedRecommendation {
  constraint: ConstraintType;
  /**
   * Durable identity for WHICH action was recommended, independent of its wording. The engine picks
   * between actions inside one constraint (reach can ask for contacts or for a campaign), and the
   * label is prose that copy edits will change. `<CONSTRAINT>:<DomainCheck | advisory>` survives both.
   */
  actionKey: string;
  /** The DomainCheck that proves the move was made, when one exists. Null = advisory, unverifiable. */
  verifiedBy: string | null;
  confidence: ConfidenceLevel;
  issuedAt: string;
  /** Every evidence line the diagnosis showed, as machine-readable metrics. */
  baseline: ObservedMetric[];
  /**
   * Days after issue at which the outcome may first be read, taken from the engine's OWN lookback
   * for this stage. Null where the policy defines no window for the stage: that is recorded as a
   * limitation, never filled in with a number chosen here.
   */
  measureAfterDays: number | null;
}

/** The durable action identity. Wording-independent by construction. */
export function actionKeyFor(constraint: ConstraintType, verifiedBy: string | null): string {
  return `${constraint}:${verifiedBy ?? 'advisory'}`;
}

/**
 * The measurement window for a constraint, from the founder-adjustable policy the engine already
 * uses. RETENTION, FIRST_PAID and DEPTH define no lookback (they are judged on standing state, not
 * on a window), so they return null and the caller records "no canonical window" rather than
 * inventing 7 or 30 days. Changing that is a founder decision, made in thresholds.ts.
 */
export function measurementWindowDays(
  constraint: ConstraintType,
  t: ConstraintThresholds = CONSTRAINT_THRESHOLDS,
): number | null {
  switch (constraint) {
    case 'FULFILLMENT':
      return t.fulfillment.lookbackDays;
    case 'REACH':
      return t.reach.lookbackDays;
    case 'FREE_CAPTURE':
      return t.freeCapture.lookbackDays;
    case 'PAID_TIER_INTEREST':
      return t.paidTierInterest.lookbackDays;
    case 'CHECKOUT_COMPLETION':
      return t.checkoutCompletion.lookbackDays;
    case 'RETENTION':
    case 'FIRST_PAID':
    case 'DEPTH':
      return null;
  }
}

/** Evidence lines -> observed metrics. A null value is `missing`; nothing here is ever modeled. */
export function baselineFrom(diagnosed: DiagnosedConstraint): ObservedMetric[] {
  return diagnosed.evidence.map((e) => ({
    metric: e.metric,
    value: e.value,
    ...(e.unit ? { unit: e.unit } : {}),
    // These come straight off CRWN's own product tables (promises kept, visits, checkout starts),
    // so a present value is `complete`. No estimate reaches this record; if one ever does, it must
    // arrive already labelled `modeled` rather than being inferred here.
    state: (e.value === null ? 'missing' : 'complete') as MetricState,
  }));
}

/**
 * Shape an issued recommendation from whatever the engine just returned. Returns null when there is
 * no diagnosis: `insufficient_evidence` is not a recommendation and must never become a row, or the
 * record would claim CRWN advised something when it deliberately stayed silent.
 */
export function issuedFrom(
  result: ConstraintResult,
  t: ConstraintThresholds = CONSTRAINT_THRESHOLDS,
): IssuedRecommendation | null {
  if (!isDiagnosed(result)) return null;
  const verifiedBy = result.action.verifiedBy ?? null;
  return {
    constraint: result.constraint,
    actionKey: actionKeyFor(result.constraint, verifiedBy),
    verifiedBy,
    confidence: result.confidence,
    issuedAt: result.evaluatedAt,
    baseline: baselineFrom(result),
    measureAfterDays: measurementWindowDays(result.constraint, t),
  };
}

/** Is this recommendation old enough to read an outcome for? */
export function isDueForMeasurement(
  rec: Pick<IssuedRecommendation, 'issuedAt' | 'measureAfterDays'>,
  now: string,
): boolean {
  // No canonical window means there is no defensible moment to call it, so it is never due. The
  // row stays open and honest instead of being measured against a made-up deadline.
  if (rec.measureAfterDays === null) return false;
  const due = new Date(rec.issuedAt).getTime() + rec.measureAfterDays * 86_400_000;
  return new Date(now).getTime() >= due;
}

export interface MeasuredOutcome {
  outcome: OutcomeState;
  /** The same metrics, re-read at measurement time. Empty when the engine could not evaluate. */
  observed: ObservedMetric[];
  /** What the engine says is limiting the artist NOW. Null when it cannot say. */
  constraintNow: ConstraintType | null;
  measuredAt: string;
}

/**
 * Classify the outcome by asking the EXISTING engine again.
 *
 * There is no threshold in this function, on purpose. "Improved" would need a definition of how
 * much movement counts, and CRWN has no measured basis for one; inventing it here would put a
 * number in front of an artist that nothing in the product supports. Instead the question is the
 * one the engine already answers with founder-approved thresholds: is this still the constraint?
 *
 * A different constraint appearing is `constraint_cleared` for THIS recommendation. It says the
 * artist moved past this stage, not that they are healthy, and not that this advice did it.
 */
export function classifyOutcome(
  issued: Pick<IssuedRecommendation, 'constraint'>,
  laterResult: ConstraintResult,
  now: string,
): MeasuredOutcome {
  if (!isDiagnosed(laterResult)) {
    // The engine went quiet. That is NOT success: too few promises to judge reads exactly like a
    // perfect month here, and calling either one an improvement would be a lie of omission.
    return { outcome: 'insufficient_evidence', observed: [], constraintNow: null, measuredAt: now };
  }
  const persists = laterResult.constraint === issued.constraint;
  return {
    outcome: persists ? 'constraint_persists' : 'constraint_cleared',
    observed: baselineFrom(laterResult),
    constraintNow: laterResult.constraint,
    measuredAt: now,
  };
}

/**
 * Did the artist do the thing? Separate from the outcome by design.
 *
 * `verifiedBy` names a DomainCheck the Quest Engine's evaluator already owns; this module never
 * evaluates one itself and never completes one. An advisory action (verifiedBy null) can never be
 * marked done, which is the honest answer: CRWN cannot see whether someone "reviewed their promise
 * workload".
 */
export function actionIsVerifiable(rec: Pick<IssuedRecommendation, 'verifiedBy'>): boolean {
  return rec.verifiedBy !== null;
}

/**
 * The one-line summary a founder surface may print. Deliberately associative.
 *
 * Note what it does not say. Not "this worked". Not "+3 promises delivered because of this". The
 * strongest true sentence is that the constraint changed while the recommendation was open.
 */
export function outcomeSummary(o: OutcomeState, actionCompleted: boolean): string {
  switch (o) {
    case 'not_measured_yet':
      return actionCompleted ? 'Acted on, too early to read the result' : 'Issued, not yet measured';
    case 'insufficient_evidence':
      return 'Not enough evidence to say what happened';
    case 'constraint_cleared':
      return actionCompleted
        ? 'Acted on, and this is no longer the constraint'
        : 'No longer the constraint, though the action was never verified';
    case 'constraint_persists':
      return actionCompleted ? 'Acted on, still the constraint' : 'Still the constraint';
  }
}
