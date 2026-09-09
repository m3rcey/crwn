// paymentReadiness.ts: the ONE rule for whether an artist can take a fan's money right now.
//
// WHY THIS EXISTS (Astra activation audit, 2026-09-08). `/api/stripe/checkout` guarded on
// `stripe_connect_id` being present and nothing else. But `/api/stripe/connect` CREATES the
// Express account and saves that id BEFORE the artist is sent to Stripe's hosted onboarding, so
// the id exists from the moment they click Connect. Every artist who starts onboarding and stops
// (Stripe asks for legal name, date of birth, address, SSN and a bank account, so stopping is
// common) therefore looked payable. Their fans got a live Subscribe button, checkout passed the
// guard, Stripe rejected the session, and the fan read "Failed to create checkout session".
// The audit hit exactly this. It is not a test artifact: it is what an abandoner's fans see.
//
// THE RULE, AND WHY IT IS THESE TWO FACTS
//
//   1. Charges are enabled. The durable proof is the `stripe_connected` activation milestone,
//      which `reconcileStripeConnect` writes ONLY when Stripe itself answers
//      `charges_enabled: true`. Never client-asserted, never written by the connect route.
//   2. The tier carries a live Stripe price for the interval being bought. A wizard-created
//      tier has NULL price ids until `backfillTierPrices` runs on connect, so a connected
//      artist can still have an unpriced rung.
//
// This is not a new definition. It is the rule the Quest Engine's `artist_stripe_connected` and
// `loadStripeConnected` already used, extracted so all three read one source instead of three
// copies of the same expression.
//
// PURE ON PURPOSE. No Stripe call, no database client, no network. The caller supplies the row.
// A readiness answer may never widen access: it only ever refuses, and the checkout route stays
// the authority. The fan-facing surface uses `chargesMilestonePresent` because the public view
// withholds the account id (correctly), which is why the two predicates are separate.

/** Why a paid tier cannot be bought right now. Null means it can. */
export type PurchaseBlocker = 'artist_payments_unavailable' | 'tier_price_missing';

/** What the FAN reads. Never implies the fan did anything wrong, never names Stripe internals. */
export const PURCHASE_BLOCKER_MESSAGE: Record<PurchaseBlocker, string> = {
  artist_payments_unavailable: 'This artist is still setting up payments, so paid memberships are not available yet. Join the free tier and you will be here when it opens.',
  tier_price_missing: 'This membership is not open for new members yet. Join the free tier and you will be here when it opens.',
};

/** Short label for a disabled paid control. */
export const PURCHASE_BLOCKED_LABEL = 'Not available yet';

interface MilestoneCarrier {
  activation_milestones?: unknown;
}

/**
 * Has Stripe confirmed this artist can accept charges?
 *
 * The milestone is the durable record of `charges_enabled`, so its presence is the fact. This is
 * the half a PUBLIC reader can check: `artist_profiles_public` exposes `activation_milestones`
 * and deliberately does not expose `stripe_connect_id`.
 */
export function chargesMilestonePresent(row: MilestoneCarrier | null | undefined): boolean {
  const milestones = (row?.activation_milestones || {}) as Record<string, unknown>;
  return !!milestones.stripe_connected;
}

/**
 * The full server-side check: a Connect account AND confirmed charges. Reading
 * `stripe_connect_id` requires the service role (its SELECT is revoked from anon and
 * authenticated), so only a server caller can satisfy this.
 */
export function stripeChargesReady(
  row: (MilestoneCarrier & { stripe_connect_id?: string | null }) | null | undefined,
): boolean {
  return !!row?.stripe_connect_id && chargesMilestonePresent(row);
}

/**
 * Which Stripe price a given interval actually buys. Annual falls back to the monthly price when
 * the tier offers no annual one, which is what the checkout route's line item already does; this
 * keeps the readiness answer and the purchase using the same id.
 */
export function resolvedPriceId(
  tier: { stripe_price_id?: string | null; stripe_annual_price_id?: string | null },
  interval: 'month' | 'year' | string | null | undefined,
): string | null {
  return (interval === 'year'
    ? tier.stripe_annual_price_id || tier.stripe_price_id
    : tier.stripe_price_id) || null;
}

/**
 * Can this fan be offered this paid tier right now? Returns the blocker, or null when the
 * purchase may proceed. A free rung (price 0) never routes through Stripe and is never blocked.
 */
export function tierPurchaseBlocker(args: {
  price: number | null | undefined;
  stripe_price_id?: string | null;
  stripe_annual_price_id?: string | null;
  interval?: 'month' | 'year' | string | null;
  chargesReady: boolean;
}): PurchaseBlocker | null {
  if (!args.price || args.price <= 0) return null; // free join: no Stripe, nothing to block
  if (!args.chargesReady) return 'artist_payments_unavailable';
  if (!resolvedPriceId(args, args.interval)) return 'tier_price_missing';
  return null;
}
