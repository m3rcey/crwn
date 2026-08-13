// Team Splits — D3: RETURNING UNOWED RESERVE TO THE ARTIST (TS-MONEY-004, 015, 016, 019).
//
// Ratified: reserve that becomes deterministically unowed belongs to the ARTIST. Never CRWN.
//
// TWO THINGS THAT LOOK ALIKE AND ARE NOT
// --------------------------------------
//   RESERVATION RELEASE   the payment never settled. No money ever moved. Release cap HEADROOM.
//                         There is nothing to transfer, and transferring would invent money.
//   SURPLUS RETURN        the payment settled, CRWN physically holds artist-owned cents, and they
//                         are now definitively unowed. This is a real platform-to-artist TRANSFER.
//
// Only the second is D3. Confusing them would either strand artist money or fabricate a payment.
//
// WHAT IS NOT SURPLUS
// -------------------
// Money still legitimately at risk or still owed: an active hold, an unapproved deliverable, a live
// Stripe dispute, a Team Split business dispute, refund exposure, or a collaborator who simply has
// not cashed out yet. Those are HELD, not spare.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { recordSurplusReturn } from './reservations';

type Admin = SupabaseClient | any;

export interface SurplusReturnResult {
  attempted: number;
  returnedCents: number;
  transferId: string | null;
  reason:
    | 'not_funded'
    | 'frozen'
    | 'already_returned'
    | 'no_connect_account'
    | 'nothing_owed'
    | 'returned'
    | 'transfer_failed'
    | 'ledger_unavailable';
}

/**
 * Return `cents` of a FUNDED reservation to the artist.
 *
 * IDEMPOTENCY, both halves:
 *   - Stripe: a deterministic idempotency key derived from the reservation, so a crash between the
 *     transfer and the database write cannot send the artist a second payment.
 *   - CRWN: `return_team_split_surplus` refuses a reservation that already carries a transfer id.
 *
 * The artist's Connect account is derived SERVER-SIDE from the reservation's artist. No caller
 * supplies a destination, because a caller who could would be choosing where money goes.
 */
export async function returnSurplusToArtist(
  admin: Admin,
  stripe: Stripe,
  input: { reservationId: string; cents: number; reason: string },
): Promise<SurplusReturnResult> {
  const fail = (reason: SurplusReturnResult['reason']): SurplusReturnResult => ({
    attempted: 0, returnedCents: 0, transferId: null, reason,
  });

  try {
    const { data: res, error } = await admin
      .from('team_split_cap_reservations')
      .select('id, artist_id, cents, returned_cents, status, frozen_at, return_transfer_id')
      .eq('id', input.reservationId)
      .maybeSingle();
    if (error) throw error;
    if (!res) return fail('ledger_unavailable');

    // Only settled money returns. A provisional reservation is an intention, not cents.
    if (res.status !== 'funded') return fail('not_funded');
    // Disputed money is at risk, not spare.
    if (res.frozen_at) return fail('frozen');
    if (res.return_transfer_id) return fail('already_returned');

    const owed = Math.max(0, (res.cents ?? 0) - (res.returned_cents ?? 0));
    const cents = Math.min(Math.floor(input.cents), owed);
    if (cents <= 0) return fail('nothing_owed');

    // Destination is server-derived, through the one module allowed to read the Stripe id.
    const { data: artist } = await admin
      .from('artist_profiles')
      .select('stripe_connect_id')
      .eq('id', res.artist_id)
      .maybeSingle();
    const destination = artist?.stripe_connect_id;
    if (!destination) return fail('no_connect_account');

    let transferId: string;
    try {
      const transfer = await stripe.transfers.create(
        {
          amount: cents,
          currency: 'usd',
          destination,
          description: `CRWN Team Split surplus return (${input.reason})`,
          metadata: {
            crwn_reason: 'team_split_surplus_to_artist',
            crwn_reservation: res.id,
          },
        },
        // Derived from the reservation, so a retry after a lost response is the SAME operation at
        // Stripe rather than a second payment.
        { idempotencyKey: `crwn_tssurplus_${res.id}` },
      );
      transferId = transfer.id;
    } catch (err) {
      console.error('[teamSplits/surplus] artist transfer failed:', (err as Error)?.message);
      return fail('transfer_failed');
    }

    const recorded = await recordSurplusReturn(admin, res.id, cents, input.reason, transferId);
    if (recorded <= 0) {
      // Stripe moved the money but the ledger refused. Do NOT retry the transfer: the idempotency
      // key would return the same transfer, and a louder record is better than a silent double try.
      console.error('[teamSplits/surplus] transfer succeeded but ledger did not record it', {
        reservation: res.id, transferId, cents,
      });
    }

    return { attempted: cents, returnedCents: cents, transferId, reason: 'returned' };
  } catch (err) {
    console.error('[teamSplits/surplus] failed:', (err as Error)?.message);
    return fail('ledger_unavailable');
  }
}

/**
 * The accounting classification, stated once so no report has to guess.
 *
 * A surplus return is NOT CRWN revenue, NOT a CRWN expense, NOT a refund, NOT a collaborator
 * payout, and NOT new GMV. It is the return of artist-owned proceeds that CRWN was holding.
 */
export const SURPLUS_ACCOUNTING_CLASS = 'artist_owned_reserve_return' as const;
