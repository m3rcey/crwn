// earningsNet.ts — the ONE net calculation for a subscription earning. PURE.
//
// F-01 (product consistency audit, 2026-08-12): on an INITIAL referred subscription, Stripe
// charges the artist `base platform fee + attributed referral/clipper cut` (checkout adds the
// cut to application_fee_percent), but the earnings row stored `gross - base fee`, so the
// ledger overstated the artist's take by exactly the commission and Team Splits accrued on
// money that belonged to the referrer. The RENEWAL handler already subtracted the commission.
// Two paths, two formulas, one of them wrong: this module is the single formula both use.
//
// SEMANTICS, settled by the remediation task:
//   - `net_amount` is what Stripe actually left the artist: gross - base fee - attributed cut.
//   - `platform_fee` stays the platform's BASE cut only. The commission is pass-through to the
//     referrer, not platform revenue, so admin revenue metrics keep reading platform_fee.
//   - The commission is capped at what the fee could cover (gross - base fee), matching the
//     cap checkout applies in percent space, so the platform never funds a gap and net never
//     goes negative.
//
// Integer cents in, integer cents out. No floating-point money leaves this module.

export interface SubscriptionEarningNetInput {
  /** Tier price in cents. */
  grossCents: number;
  /** The platform's BASE fee in cents (already rounded by the caller from the plan percent). */
  platformFeeCents: number;
  /**
   * The referral/clipper cut in PERCENT that checkout added to application_fee_percent
   * (0 when the subscription is unattributed, or for sessions created before the
   * `attributed_cut` metadata key existed).
   */
  attributedCutPercent: number;
}

export interface SubscriptionEarningNet {
  /** The commission in cents that belongs to the referrer/clipper. */
  commissionCents: number;
  /** The artist's true take in cents: gross - base fee - commission. Never negative. */
  netCents: number;
}

/**
 * Compute the commission and the artist's net for one subscription payment.
 * Used by BOTH the initial-checkout handler and the renewal handler, which is what makes
 * "the two paths agree" structural rather than aspirational.
 */
export function subscriptionEarningNet(input: SubscriptionEarningNetInput): SubscriptionEarningNet {
  const gross = toSafeCents(input.grossCents);
  const fee = Math.min(toSafeCents(input.platformFeeCents), gross);
  const cut = toSafePercent(input.attributedCutPercent);

  // Same formula the renewal handler always used: round the percent, cap at what the
  // fee could cover so the platform never funds a gap.
  const commissionCents = Math.min(Math.round(gross * (cut / 100)), gross - fee);
  const netCents = gross - fee - commissionCents;

  return { commissionCents, netCents };
}

/** Cents must be a non-negative integer; anything else is treated as 0, never NaN. */
function toSafeCents(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.round(v);
}

/** A percent must sit in [0, 100]; anything else clamps, never NaN. */
function toSafePercent(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(v, 100);
}
