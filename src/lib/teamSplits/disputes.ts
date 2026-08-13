// Team Splits — STRIPE DISPUTE RECONCILIATION (TS-MONEY-017, TS-MONEY-018).
//
// TWO DIFFERENT THINGS, NEVER CONFLATED
// -------------------------------------
//   Stripe dispute          a fan's bank reversed a payment. Money. Handled here.
//   Team Split dispute      the artist and collaborator disagree about the work. Contract.
//                           Lives in `team_split_disputes` and has nothing to do with this file.
//
// STRIPE'S RULE FOR OUR TOPOLOGY
// ------------------------------
//   "For destination charges, with or without on_behalf_of, Stripe debits dispute amounts and fees
//    from your platform account."
// So CRWN is debited, the artist's transferred proceeds are NOT automatically pulled back, and the
// collaborator reserve is already sitting in CRWN's balance.
//
// That produces two different recoveries, and treating them the same would be a double count:
//   - the ARTIST's transferred proceeds may need a Stripe transfer reversal
//   - the COLLABORATOR reserve is already physically platform-held, so it is FROZEN in the ledger
//     and no Stripe call is made for it. Reversing it would be fabricating a recovery.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { recoverArtistShareOnRefund } from '@/lib/stripe/refundRecovery';
import { freezeReservesForEarning, unfreezeReservesForEarning } from './reservations';

type Admin = SupabaseClient | any;

export interface DisputeOutcome {
  handled: boolean;
  earningId: string | null;
  frozen: number;
  unfrozen: number;
  artistRecoveredCents: number;
  artistShortfallCents: number;
  status: string;
  reason: 'no_charge' | 'no_earning' | 'frozen' | 'restored' | 'finalized' | 'noop';
}

const none = (reason: DisputeOutcome['reason'], status = ''): DisputeOutcome => ({
  handled: false, earningId: null, frozen: 0, unfrozen: 0,
  artistRecoveredCents: 0, artistShortfallCents: 0, status, reason,
});

/**
 * Reconcile a Stripe dispute against the Team Split ledger.
 *
 * IDEMPOTENT at every step: freezing an already-frozen reservation is a no-op, unfreezing an
 * unfrozen one is a no-op, and the artist-transfer recovery reverses only what is still unreversed.
 * A redelivered `charge.dispute.updated` therefore cannot claw back or restore twice.
 */
export async function handleTeamSplitDispute(
  admin: Admin,
  stripe: Stripe,
  dispute: Stripe.Dispute,
): Promise<DisputeOutcome> {
  try {
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
    if (!chargeId) return none('no_charge');

    const charge = await stripe.charges.retrieve(chargeId);
    const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
    if (!paymentIntentId) return none('no_charge', dispute.status);

    const { data: earning } = await admin
      .from('earnings')
      .select('id')
      .eq('stripe_payment_id', paymentIntentId)
      .maybeSingle();
    if (!earning?.id) return none('no_earning', dispute.status);

    const status = dispute.status;

    // WON: the funds come back. Restore availability only from Stripe's own evidence, never
    // optimistically. The artist's transfer is NOT re-sent here: Stripe warns that re-transferring
    // a previous reversal can hit cross-border restrictions, so a failed restoration must surface
    // as reconciliation work rather than as a fabricated artist payment.
    if (status === 'won') {
      const unfrozen = await unfreezeReservesForEarning(admin, earning.id);
      return { handled: true, earningId: earning.id, frozen: 0, unfrozen,
               artistRecoveredCents: 0, artistShortfallCents: 0, status, reason: 'restored' };
    }

    // LOST or still OPEN: the money is gone or at risk. Freeze the collaborator side and pull the
    // artist's transferred share back where Stripe allows it.
    const frozen = await freezeReservesForEarning(admin, earning.id, `stripe_dispute_${status}`);

    // The artist's proceeds are the only part that physically left the platform, so it is the only
    // part a transfer reversal applies to. The collaborator reserve is already here and is handled
    // by the freeze above; reversing it too would double-count the same cents.
    const recovery = await recoverArtistShareOnRefund(stripe, charge as Stripe.Charge);
    if (recovery.shortfall > 0) {
      console.error('[teamSplits/disputes] UNRECOVERED artist share on dispute', {
        charge: chargeId, shortfall: recovery.shortfall, status,
      });
    }

    return {
      handled: true,
      earningId: earning.id,
      frozen,
      unfrozen: 0,
      artistRecoveredCents: recovery.reversedCents,
      artistShortfallCents: recovery.shortfall,
      status,
      reason: status === 'lost' ? 'finalized' : 'frozen',
    };
  } catch (err) {
    console.error('[teamSplits/disputes] reconciliation failed:', (err as Error)?.message);
    return none('noop', dispute?.status ?? '');
  }
}
