// artistObserved.ts — Z9: this artist's own measured rates, or an honest refusal.
//
// PURE. No database, no network, no AI. It reads the ConstraintEvidence the assembler ALREADY
// builds, so it adds zero queries and zero schema: every number here is one the Constraint Engine
// was already looking at, just exposed with its provenance instead of only its verdict.
//
// WHAT ARTIST-SPECIFIC LEARNING MEANS HERE
// ----------------------------------------
//   Artist A's own past -> Artist A's own future. Nothing else.
//
// There is no cross-artist anything in this file and there must never be: no benchmark, no cohort,
// no "artists like you", no population prior. That is Z10's question and it carries privacy
// decisions this module is not allowed to pre-empt. The only inputs are one artist's own evidence.
//
// WHAT MAY NEVER BE LEARNED
// -------------------------
// The SAMPLE FLOORS and HEALTH THRESHOLDS in thresholds.ts are founder POLICY, not estimates. This
// module READS them to decide whether an artist's own rate is trustworthy yet; it never adjusts
// them, and no artist's history may move them. Learning a threshold would mean an artist's own bad
// month quietly redefining what "healthy" means for them, which is how a measurement system starts
// congratulating people for declining.
//
// NOT A SCORE
// -----------
// Nothing here is combined into an index, a rating or a confidence number. Each rate stands alone
// with its numerator, denominator, window and sample, so an operator can always trace a value back
// to the events that produced it.

import { CONSTRAINT_THRESHOLDS, type ConstraintThresholds } from './thresholds';
import type { ConstraintEvidence } from './types';

/** The rates an artist's own history can currently support. Deliberately few. */
export type ObservedMetricKey = 'free_capture_rate' | 'checkout_completion_rate';

/**
 * Why a rate is or is not usable. `insufficient_sample` is the honest middle state that most
 * "learning" systems skip: CRWN HAS the artist's data and still refuses to lean on it yet.
 */
export type ObservedStatus =
  | 'artist_observed'
  | 'insufficient_sample'
  | 'no_evidence';

export interface ObservedRate {
  metric: ObservedMetricKey;
  /** The artist's own measured rate, or null when it cannot be computed. NEVER 0 for missing. */
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  /** The denominator is the sample: rates are only as trustworthy as what they were measured over. */
  sample: number | null;
  /** The canonical minimum from thresholds.ts. Policy, read not written. */
  minimumSample: number;
  /** The canonical lookback from thresholds.ts, in days. */
  windowDays: number;
  status: ObservedStatus;
  /** True only when the artist's own value may stand in for a generic assumption. */
  active: boolean;
  /** One plain sentence an operator can read. Never rendered as a claim about other artists. */
  explanation: string;
}

const rate = (num: number | null, den: number | null): number | null =>
  num === null || den === null || den <= 0 ? null : num / den;

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

/**
 * The artist's own free-capture rate: free joins per unique visitor, over the canonical
 * free-capture window, gated by the canonical minimum visit count.
 *
 * Null visits mean "we cannot see traffic", which is NOT zero traffic. The distinction is the whole
 * reason the Constraint Engine's evidence is nullable, and losing it here would turn a measurement
 * gap into a damning statistic about the artist.
 */
function freeCaptureRate(e: ConstraintEvidence, t: ConstraintThresholds): ObservedRate {
  const denominator = e.reach.uniqueVisits;
  const numerator = e.membership.freeJoinsInWindow;
  const value = rate(numerator, denominator);
  const minimumSample = t.freeCapture.minimumVisits;
  const windowDays = t.freeCapture.lookbackDays;

  if (denominator === null || numerator === null) {
    return {
      metric: 'free_capture_rate', value: null, numerator, denominator, sample: denominator,
      minimumSample, windowDays, status: 'no_evidence', active: false,
      explanation: 'CRWN cannot see enough of this artist traffic or joins to measure a capture rate.',
    };
  }
  if (denominator < minimumSample) {
    return {
      metric: 'free_capture_rate', value, numerator, denominator, sample: denominator,
      minimumSample, windowDays, status: 'insufficient_sample', active: false,
      explanation: `Measured on ${denominator} visits in ${windowDays} days, below the ${minimumSample} needed before this artist own rate is used instead of the model.`,
    };
  }
  return {
    metric: 'free_capture_rate', value, numerator, denominator, sample: denominator,
    minimumSample, windowDays, status: 'artist_observed', active: true,
    explanation: `This artist own capture rate is ${pct(value as number)}: ${numerator} free joins from ${denominator} visits in the last ${windowDays} days.`,
  };
}

/**
 * The artist's own checkout completion: joins per checkout start, summed across paid rungs over the
 * canonical window. Summed rather than averaged, because a mean of per-tier rates would weight a
 * rung with three starts the same as one with three hundred.
 */
function checkoutCompletionRate(e: ConstraintEvidence, t: ConstraintThresholds): ObservedRate {
  const minimumSample = t.checkoutCompletion.minimumCheckoutStarts;
  const windowDays = t.checkoutCompletion.lookbackDays;

  if (!e.tiers.interactionDataAvailable) {
    return {
      metric: 'checkout_completion_rate', value: null, numerator: null, denominator: null, sample: null,
      minimumSample, windowDays, status: 'no_evidence', active: false,
      explanation: 'Tier interaction data cannot be read, so no checkout rate is measurable.',
    };
  }

  const denominator = e.tiers.paidRungs.reduce((s, r) => s + r.checkoutStarts, 0);
  const numerator = e.tiers.paidRungs.reduce((s, r) => s + r.joins, 0);
  const value = rate(numerator, denominator);

  if (denominator <= 0) {
    return {
      metric: 'checkout_completion_rate', value: null, numerator, denominator, sample: denominator,
      minimumSample, windowDays, status: 'no_evidence', active: false,
      explanation: 'Nobody started a checkout in the window, so there is no completion rate to measure.',
    };
  }
  if (denominator < minimumSample) {
    return {
      metric: 'checkout_completion_rate', value, numerator, denominator, sample: denominator,
      minimumSample, windowDays, status: 'insufficient_sample', active: false,
      explanation: `Measured on ${denominator} checkout starts in ${windowDays} days, below the ${minimumSample} needed before this artist own rate is used instead of the model.`,
    };
  }
  return {
    metric: 'checkout_completion_rate', value, numerator, denominator, sample: denominator,
    minimumSample, windowDays, status: 'artist_observed', active: true,
    explanation: `This artist own checkout completion is ${pct(value as number)}: ${numerator} of ${denominator} started checkouts finished in the last ${windowDays} days.`,
  };
}

/** Every artist-observed rate CRWN can currently stand behind, for ONE artist's own evidence. */
export function observedRates(
  evidence: ConstraintEvidence,
  t: ConstraintThresholds = CONSTRAINT_THRESHOLDS,
): ObservedRate[] {
  return [freeCaptureRate(evidence, t), checkoutCompletionRate(evidence, t)];
}

/**
 * Substitute the artist's own rate for a generic modelled one, or keep the model.
 *
 * FALLBACK IS MANDATORY. An artist with no data, thin data or unreadable data keeps the generic
 * assumption and loses nothing: "learning" must never be the reason someone gets a worse product.
 * The return value always says which was used and why, so no caller can present a modelled number
 * as measured, or the reverse.
 */
export function rateOrModel(
  observed: ObservedRate | undefined,
  modelledValue: number,
): { value: number; source: 'artist_observed' | 'modelled'; sample: number | null; explanation: string } {
  if (observed && observed.active && typeof observed.value === 'number') {
    return { value: observed.value, source: 'artist_observed', sample: observed.sample, explanation: observed.explanation };
  }
  return {
    value: modelledValue,
    source: 'modelled',
    sample: observed?.sample ?? null,
    explanation: observed?.explanation ?? 'Using the generic model: this artist has no measured rate yet.',
  };
}

/** The subset a coaching surface may be told about. Only rates that are actually active. */
export function activeObservedRates(evidence: ConstraintEvidence, t: ConstraintThresholds = CONSTRAINT_THRESHOLDS): ObservedRate[] {
  return observedRates(evidence, t).filter((r) => r.active);
}
