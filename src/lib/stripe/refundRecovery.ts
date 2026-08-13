// DESTINATION-CHARGE REFUND RECOVERY (TS-MONEY-007).
//
// THE DEFECT THIS CLOSES
// ----------------------
// CRWN sells through Stripe DESTINATION charges. Stripe: "When refunding a charge that has a
// transfer_data[destination], BY DEFAULT the destination account keeps the funds that were
// transferred to it, leaving the platform account to cover the negative balance from the refund."
//
// CRWN creates no refunds in code, so every refund is issued in the Stripe Dashboard. Unless the
// person clicking Refund also ticks the reverse-transfer option, the artist keeps their proceeds
// and CRWN's platform balance absorbs the entire refund. On a $100 Launch sale that is CRWN paying
// $88 of someone else's revenue back to a fan. It is a subsidy on ordinary refunds, with or
// without a Team Split, and it has been live the whole time.
//
// A checkbox in a dashboard is not a financial control. This module is the control: it runs from
// the refund WEBHOOK, so it covers refunds created anywhere, by anyone, including ones CRWN never
// initiated.
//
// WHAT IT DOES NOT DO
// -------------------
// It never fabricates recovery. If the artist's Connect balance cannot cover the reversal, Stripe
// takes them negative and recovers from future volume or their bank; if that ultimately fails, the
// loss is real and is reported rather than papered over. See `RecoveryOutcome.shortfall`.

import Stripe from 'stripe';

/** Proportional share of `total`, floored to integer cents. Never exceeds `total`. */
export function proportionalCents(total: number, numerator: number, denominator: number): number {
  if (denominator <= 0 || total <= 0 || numerator <= 0) return 0;
  return Math.min(total, Math.floor((total * numerator) / denominator));
}

/**
 * How many cents of the destination transfer still need reversing.
 *
 * THE DOUBLE-REVERSAL GUARD. Stripe already tracks `transfer.amount_reversed`, so a refund created
 * WITH `reverse_transfer: true` has already moved the money and this returns 0. Cumulative
 * reversals can never exceed the original transfer, which Stripe also enforces ("Can only reverse
 * up to the unreversed amount remaining of the transfer"), but computing it here means the common
 * case makes no API call at all.
 *
 * @param transferAmount     the original destination transfer, in cents
 * @param alreadyReversed    transfer.amount_reversed, in cents
 * @param chargeAmount       the original charge, in cents
 * @param totalRefunded      charge.amount_refunded, cumulative across every refund so far
 */
export function reversalStillOwed(input: {
  transferAmount: number;
  alreadyReversed: number;
  chargeAmount: number;
  totalRefunded: number;
}): number {
  const { transferAmount, alreadyReversed, chargeAmount, totalRefunded } = input;
  if (transferAmount <= 0 || chargeAmount <= 0 || totalRefunded <= 0) return 0;
  // Target reversal for the CUMULATIVE refunded amount, so multiple partial refunds converge
  // correctly instead of each computing its own slice and drifting.
  const target = proportionalCents(transferAmount, Math.min(totalRefunded, chargeAmount), chargeAmount);
  return Math.max(0, target - Math.max(0, alreadyReversed));
}

export interface RecoveryOutcome {
  attemptedCents: number;
  reversedCents: number;
  /** Cents that could not be recovered from the artist. Real loss exposure, never hidden. */
  shortfall: number;
  reason:
    | 'no_transfer'          // not a destination charge: nothing to recover
    | 'already_reversed'     // the refund was created with reverse_transfer, or a prior run did it
    | 'reversed'             // recovered in full
    | 'reversal_failed'      // Stripe refused; the shortfall is real
    | 'lookup_failed';
  transferReversalId?: string;
}

/**
 * Recover the artist's share of a refunded destination charge.
 *
 * IDEMPOTENT. Keyed on the charge and the cumulative refunded amount, so a redelivered
 * `charge.refunded` webhook computes a still-owed amount of zero and makes no second reversal.
 * The Stripe idempotency key is belt to that braces.
 *
 * NEVER THROWS: a refund must finish recording in CRWN's ledger even if recovery fails, because a
 * ledger that silently drops a refund is worse than one that records an unrecovered refund.
 */
export async function recoverArtistShareOnRefund(
  stripe: Stripe,
  charge: Stripe.Charge,
): Promise<RecoveryOutcome> {
  const none = (reason: RecoveryOutcome['reason']): RecoveryOutcome => ({
    attemptedCents: 0, reversedCents: 0, shortfall: 0, reason,
  });

  try {
    const transferId = typeof charge.transfer === 'string' ? charge.transfer : charge.transfer?.id;
    if (!transferId) return none('no_transfer');

    const transfer = await stripe.transfers.retrieve(transferId);
    const owed = reversalStillOwed({
      transferAmount: transfer.amount ?? 0,
      alreadyReversed: transfer.amount_reversed ?? 0,
      chargeAmount: charge.amount ?? 0,
      totalRefunded: charge.amount_refunded ?? 0,
    });
    if (owed <= 0) return none('already_reversed');

    try {
      const reversal = await stripe.transfers.createReversal(
        transferId,
        {
          amount: owed,
          description: `CRWN refund recovery for charge ${charge.id}`,
          metadata: { crwn_charge: charge.id, crwn_reason: 'destination_refund_recovery' },
        },
        // Deterministic from (transfer, cumulative refunded), so a retry of the SAME state is a
        // no-op at Stripe even if this process died after the call but before recording it.
        { idempotencyKey: `crwn_rev_${transferId}_${charge.amount_refunded}` },
      );
      return {
        attemptedCents: owed,
        reversedCents: reversal.amount ?? owed,
        shortfall: 0,
        reason: 'reversed',
        transferReversalId: reversal.id,
      };
    } catch (err) {
      // The artist's balance could not cover it, or Stripe refused. The money is genuinely not
      // recovered, and saying so is the point of this branch.
      console.error('[refundRecovery] transfer reversal failed:', (err as Error)?.message);
      return { attemptedCents: owed, reversedCents: 0, shortfall: owed, reason: 'reversal_failed' };
    }
  } catch (err) {
    console.error('[refundRecovery] lookup failed:', (err as Error)?.message);
    return none('lookup_failed');
  }
}
