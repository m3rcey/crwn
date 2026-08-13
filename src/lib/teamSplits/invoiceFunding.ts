// Team Splits — SUBSCRIPTION INVOICE FUNDING (TS-MONEY-011).
//
// The last unfunded rail, and the biggest one: subscriptions are the large majority of CRWN's
// earnings rows, so until this existed the reserve covered the minority of real revenue.
//
// WHY invoice.created, AND WHY IT IS THE ONLY WINDOW
// -------------------------------------------------
// Stripe, on invoice status transitions:
//   "Invoices are initially created with status=draft, and you can only edit them while they're in
//    this state."
//   "We wait 1 hour after receiving a successful response to the invoice.created event from all
//    listening webhooks before attempting payment. If we don't receive a successful response
//    within 72 hours, we attempt to finalize and send the invoice."
//   "During that time, we won't attempt to charge the customer unless we receive a successful
//    response."
// And on Connect subscriptions:
//   "The application_fee_amount set directly on an invoice overrides any application fee amount
//    calculated with application_fee_percent and is capped at the invoice's final charge amount."
//
// So the draft window is real, generous, and the ONLY place an exact cent amount can be attached.
// After finalization the monetary fields are immutable, which is exactly the property that makes
// D1 enforceable: an invoice that finalized without a reserve can never be back-filled into a
// collaborator obligation.
//
// WHY THIS COVERS EVERY INVOICE CLASS
// -----------------------------------
// The initial subscription charge, an ordinary renewal, a proration, a coupon'd invoice and a
// retried invoice are all just invoices with a draft phase. Keying on the invoice rather than on
// `billing_reason` means none of them is a special case, and a new billing reason Stripe invents
// later is funded automatically instead of silently skipped.
//
// FAILURE DIRECTION
// -----------------
// Any failure funds NOTHING. No reserve means the accrual guard yields zero, so the collaborator
// is owed nothing rather than owed money nobody withheld. The fan's payment is never blocked by a
// split calculation: the handler returns success so Stripe proceeds to charge.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { getArtistFeePercent } from '@/lib/platformTier';
import { resolveReserveForSale, reserveToStripeMetadata } from './reserve';

type Admin = SupabaseClient | any;

export interface InvoiceFundingResult {
  funded: boolean;
  reserveCents: number;
  applicationFeeAmount: number | null;
  reservedByDeal: Record<string, number>;
  reason:
    | 'not_subscription'
    | 'not_draft'
    | 'zero_amount'
    | 'no_subscription_row'
    | 'no_deals'
    | 'funded'
    | 'update_failed'
    | 'lookup_failed';
}

const none = (reason: InvoiceFundingResult['reason']): InvoiceFundingResult => ({
  funded: false, reserveCents: 0, applicationFeeAmount: null, reservedByDeal: {}, reason,
});

/** The amount CRWN's fee basis is computed on. `amount_due` is the invoice's real, post-discount total. */
function invoiceGrossCents(invoice: Stripe.Invoice): number {
  const anyInv = invoice as unknown as { amount_due?: number; total?: number; amount_remaining?: number };
  const v = anyInv.amount_due ?? anyInv.total ?? 0;
  return Math.max(0, Math.round(v));
}

/**
 * Establish the collaborator reserve on a DRAFT subscription invoice.
 *
 * Idempotent for free: it computes the same exact application fee from the same invoice every
 * time, and setting the same value twice is a no-op at Stripe. It also consumes no cap headroom by
 * itself, because headroom is read from the ACCRUAL ledger, which only moves after settlement.
 * A redelivered invoice.created therefore cannot double-reserve.
 */
export async function fundSubscriptionInvoice(
  admin: Admin,
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<InvoiceFundingResult> {
  try {
    const anyInv = invoice as unknown as {
      subscription?: string | null;
      status?: string;
      id?: string;
      application_fee_amount?: number | null;
    };

    const subscriptionId = typeof anyInv.subscription === 'string' ? anyInv.subscription : null;
    if (!subscriptionId) return none('not_subscription');

    // Monetary fields are editable ONLY while draft. A finalized invoice gets no reserve and
    // therefore no liability, which is D1 enforced by Stripe rather than by our own bookkeeping.
    if (anyInv.status && anyInv.status !== 'draft') return none('not_draft');

    const grossCents = invoiceGrossCents(invoice);
    if (grossCents <= 0) return none('zero_amount'); // 100% coupon, credit balance, trial: nothing to split

    // Server-derived, always: the subscription row is the authority for artist and tier.
    const { data: sub } = await admin
      .from('subscriptions')
      .select('artist_id, tier_id, fan_id')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();
    if (!sub?.artist_id || !sub?.tier_id) return none('no_subscription_row');

    const platformFeePercent = await getArtistFeePercent(sub.artist_id);

    // Referral/clipper is artist-funded and already inside application_fee_percent today. It must
    // come off BEFORE the collaborator share, or a Team Split could consume money already owed to
    // a referrer. Read the live referral the same way the renewal earnings writer does.
    const { data: referral } = await admin
      .from('referrals')
      .select('commission_rate')
      .eq('artist_id', sub.artist_id)
      .eq('referred_fan_id', sub.fan_id)
      .eq('status', 'active')
      .maybeSingle();
    const attributedCutPercent = Math.max(0, Number(referral?.commission_rate ?? 0));

    const reserve = await resolveReserveForSale(admin, {
      artistId: sub.artist_id,
      sourceType: 'tier',
      sourceId: sub.tier_id,
      grossCents,
      platformFeePercent,
      attributedCutPercent,
    });
    if (reserve.reserveCents <= 0) return { ...none('no_deals'), reservedByDeal: {} };

    // The EXACT retained amount, in integer cents. This overrides application_fee_percent for this
    // invoice only; the subscription itself is never touched, so no proration, no billing-date
    // change, no price change, no re-attribution.
    const applicationFeeAmount =
      reserve.breakdown.platformFeeCents +
      reserve.breakdown.attributedCutCents +
      reserve.breakdown.collaboratorReserveCents;

    // Stripe caps the fee at the invoice total; assert it ourselves so a bug surfaces here rather
    // than as a silently truncated fee that funds less than the ledger will later claim.
    if (applicationFeeAmount > grossCents) {
      console.error('[invoiceFunding] computed fee exceeds invoice total, funding nothing', {
        invoice: anyInv.id, applicationFeeAmount, grossCents,
      });
      return none('update_failed');
    }

    await stripe.invoices.update(
      anyInv.id as string,
      {
        application_fee_amount: applicationFeeAmount,
        // The per-deal map rides on the INVOICE, so settlement records proven funding rather than
        // recomputing from deal terms that may have changed between draft and payment.
        metadata: reserveToStripeMetadata(reserve.reservedByDeal),
      },
      // Same invoice + same computed fee is the same operation, so a redelivered event is a no-op.
      { idempotencyKey: `crwn_inv_fee_${anyInv.id}_${applicationFeeAmount}` },
    );

    return {
      funded: true,
      reserveCents: reserve.reserveCents,
      applicationFeeAmount,
      reservedByDeal: reserve.reservedByDeal,
      reason: 'funded',
    };
  } catch (err) {
    // NEVER throw. A split that cannot be computed must not stop a fan's subscription from being
    // charged; it must only stop a collaborator from being owed.
    console.error('[invoiceFunding] failed, funding nothing:', (err as Error)?.message);
    return none('lookup_failed');
  }
}
