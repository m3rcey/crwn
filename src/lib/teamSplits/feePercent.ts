// Team Splits — the FIRST-CHARGE PERCENTAGE CONTRACT (TS-MONEY-014, TS-MONEY-015).
//
// THE PROBLEM
// -----------
// Stripe creates the first subscription invoice already `open`, and Checkout forbids editing it
// while the subscription is `incomplete`. So the only lever at creation is
// `subscription_data.application_fee_percent`, which Stripe limits to TWO DECIMAL PLACES.
//
// An exact cent target usually cannot be expressed as a 2dp percentage of the charge. Ordinary
// nearest-rounding is subsidy-safe (CRWN never pays) but CONTRACT-UNSAFE: it can retain FEWER cents
// than the collaborator's accepted split, and the accrual guard would then clamp the collaborator
// DOWN to the short amount. The collaborator would silently receive less than the deal they signed,
// because of a rounding artefact in a payment API they have never heard of.
//
// THE RULE
// --------
// Round the percentage UP, never to nearest. The first charge may retain a cent or two MORE than
// required, never less.
//
// The overage is ARTIST-OWNED SURPLUS. It is not CRWN revenue, not an extra platform fee, and not
// collaborator money: it is the artist's own money that CRWN happened to hold back, and it returns
// through the D3 path like any other unowed reserve.
//
// PURE. Integer cents in, integer cents and a 2dp percentage out.

/** Stripe's precision limit for application_fee_percent. */
export const FEE_PERCENT_DECIMALS = 2;
const SCALE = 10 ** FEE_PERCENT_DECIMALS; // 100 -> two decimals

/**
 * How Stripe turns a percentage into cents: a percentage of the invoice total, to the nearest cent.
 * Modelled explicitly so the safety proof below is about arithmetic we can state, not arithmetic we
 * assume.
 */
export function centsWithheldByPercent(grossCents: number, percent: number): number {
  if (grossCents <= 0 || percent <= 0) return 0;
  return Math.round((grossCents * percent) / 100);
}

export interface FeePercentPlan {
  /** The 2dp percentage to hand Stripe. */
  percent: number;
  /** What Stripe will actually withhold at that percentage. */
  withheldCents: number;
  /** withheldCents - requiredCents. Always >= 0. Artist-owned surplus (TS-MONEY-015). */
  overageCents: number;
  /**
   * False when even 100% cannot retain the required amount, which means the caller must FAIL CLOSED
   * and fund no Team Split on this charge rather than underfund one.
   */
  safe: boolean;
}

/**
 * The smallest 2dp percentage that retains AT LEAST `requiredCents` of `grossCents`.
 *
 * Ceiling, deliberately. `Math.ceil` on the scaled percentage guarantees the withheld amount is
 * never short; the loop that follows is a correctness belt for the one case where floating point
 * lands a hair under the boundary, and it can only ever step UP.
 */
export function feePercentForExactCents(grossCents: number, requiredCents: number): FeePercentPlan {
  const gross = Math.max(0, Math.round(grossCents));
  const required = Math.max(0, Math.round(requiredCents));

  if (gross <= 0 || required <= 0) {
    return { percent: 0, withheldCents: 0, overageCents: 0, safe: required === 0 };
  }

  let scaled = Math.ceil((required / gross) * 100 * SCALE);
  let percent = scaled / SCALE;

  // Nudge up while the modelled withholding is still short. Bounded by 100%: at most a handful of
  // steps, and it terminates because each step adds at least 1/SCALE of a percent.
  while (percent <= 100 && centsWithheldByPercent(gross, percent) < required) {
    scaled += 1;
    percent = scaled / SCALE;
  }

  if (percent > 100) {
    // Cannot be represented safely. The caller must fund nothing rather than underfund.
    return { percent: 100, withheldCents: centsWithheldByPercent(gross, 100), overageCents: 0, safe: false };
  }

  const withheldCents = centsWithheldByPercent(gross, percent);
  return {
    percent,
    withheldCents,
    overageCents: withheldCents - required,
    safe: true,
  };
}

/**
 * The full first-charge plan: CRWN's fee, the referral cut and the granted collaborator reserve are
 * all retained through ONE percentage, because Stripe gives us exactly one.
 *
 * Returns `safe: false` when the target cannot be represented, and the caller then falls back to
 * the unchanged fee and funds no split. That is the fail-closed direction demanded by D1: a
 * collaborator is owed nothing rather than owed money nobody withheld.
 */
export function firstChargeFeePlan(input: {
  grossCents: number;
  platformFeeCents: number;
  attributedCutCents: number;
  grantedReserveCents: number;
}): FeePercentPlan & { requiredCents: number } {
  const requiredCents =
    Math.max(0, input.platformFeeCents) +
    Math.max(0, input.attributedCutCents) +
    Math.max(0, input.grantedReserveCents);
  const plan = feePercentForExactCents(input.grossCents, requiredCents);
  return { ...plan, requiredCents };
}
