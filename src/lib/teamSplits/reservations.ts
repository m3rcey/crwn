// Team Splits — the ATOMIC RESERVATION client (TS-MONEY-012, TS-MONEY-013, TS-MONEY-016..019).
//
// Every payment rail gets its collaborator cents from HERE, never from a pure calculation. The
// difference matters: `computeFunding` says what a deal is OWED, this says what the cap can still
// AFFORD, and only the database can answer the second question without racing itself.
//
// FAIL CLOSED. Until schema-phase2-team-split-cap-reservations.sql is applied, every grant returns
// ZERO. That funds no split, which creates no liability, which is the only safe failure direction.
// It is also why the cashout rail can stay shut without anything else breaking.

import type { SupabaseClient } from '@supabase/supabase-js';

type Admin = SupabaseClient | any;

/** The canonical Stripe money identity a reservation is bound to. */
export type MoneyKind = 'checkout_session' | 'payment_intent' | 'invoice';

export interface MoneyIdentity {
  kind: MoneyKind;
  id: string;
}

/** Missing function / relation: the migration has not run. */
function isMissingSchema(err: any): boolean {
  const c = err?.code;
  return c === '42883' || c === '42P01' || c === '42703' || /does not exist|schema cache/i.test(err?.message || '');
}

export interface GrantedReserve {
  /** Cents actually granted per deal, cap-safe. Sums to `totalCents`. */
  byDeal: Record<string, number>;
  totalCents: number;
  /** True when the reservation ledger is not available yet, so NOTHING was granted. */
  schemaPending: boolean;
}

/**
 * Reserve cap headroom atomically for every deal this sale qualifies for.
 *
 * Deals are granted in SORTED ID ORDER. That is not cosmetic: each grant takes a row lock on its
 * deal, and two concurrent charges touching the same pair of deals in opposite orders would
 * deadlock. A stable order makes the lock sequence identical for every caller.
 *
 * Partial grants are expected and correct. A deal whose cap is nearly full gets what remains and
 * the rest of the sale proceeds; the payment is never blocked by a full cap.
 */
export async function grantReserves(
  admin: Admin,
  money: MoneyIdentity,
  wantByDeal: Record<string, number>,
): Promise<GrantedReserve> {
  const dealIds = Object.keys(wantByDeal)
    .filter((id) => (wantByDeal[id] ?? 0) > 0)
    .sort(); // deterministic lock ordering
  if (dealIds.length === 0 || !money.id) {
    return { byDeal: {}, totalCents: 0, schemaPending: false };
  }

  const byDeal: Record<string, number> = {};
  let total = 0;

  for (const dealId of dealIds) {
    try {
      const { data, error } = await admin.rpc('grant_team_split_reservation', {
        p_deal_id: dealId,
        p_money_kind: money.kind,
        p_money_id: money.id,
        p_want_cents: Math.floor(wantByDeal[dealId]),
      });
      if (error) throw error;
      const granted = Math.max(0, Number(data) || 0);
      if (granted > 0) {
        byDeal[dealId] = granted;
        total += granted;
      }
    } catch (err) {
      if (isMissingSchema(err)) {
        // The whole grant is void, not partial: a sale must not withhold for some deals and not
        // others based on which RPC call happened to fail first.
        return { byDeal: {}, totalCents: 0, schemaPending: true };
      }
      console.error('[teamSplits/reservations] grant failed, granting nothing for this deal:', err);
    }
  }

  return { byDeal, totalCents: total, schemaPending: false };
}

/**
 * provisional -> funded, at settlement, against the canonical earnings row.
 *
 * This is what turns "we intend to hold these cents" into "these cents exist", and it is the only
 * transition that makes a reservation accrual-eligible.
 */
export async function fundReserves(
  admin: Admin,
  money: MoneyIdentity,
  earningId: string,
): Promise<number> {
  try {
    const { data, error } = await admin.rpc('fund_team_split_reservation', {
      p_money_kind: money.kind,
      p_money_id: money.id,
      p_earning_id: earningId,
    });
    if (error) throw error;
    return Math.max(0, Number(data) || 0);
  } catch (err) {
    if (!isMissingSchema(err)) console.error('[teamSplits/reservations] fund failed:', err);
    return 0;
  }
}

/**
 * provisional -> released, for TERMINAL non-payment only.
 *
 * A funded reservation is never released: real money moved, so its disposition is a D3 return or a
 * clawback, never a headroom give-back. The RPC enforces that; this is the readable statement of it.
 *
 * Deliberately NOT called on a transient subscription payment failure. Stripe retries the same
 * invoice, and releasing early would let another charge take the headroom and leave the retried
 * invoice unable to fund a collaborator it had already promised.
 */
export async function releaseReserves(
  admin: Admin,
  money: MoneyIdentity,
  reason: string,
): Promise<number> {
  try {
    const { data, error } = await admin.rpc('release_team_split_reservation', {
      p_money_kind: money.kind,
      p_money_id: money.id,
      p_reason: reason,
    });
    if (error) throw error;
    return Math.max(0, Number(data) || 0);
  } catch (err) {
    if (!isMissingSchema(err)) console.error('[teamSplits/reservations] release failed:', err);
    return 0;
  }
}

/** Freeze every reservation funded by an earning that is now disputed (TS-MONEY-017). */
export async function freezeReservesForEarning(
  admin: Admin,
  earningId: string,
  reason: string,
): Promise<number> {
  try {
    const { data, error } = await admin.rpc('freeze_team_split_reservations', {
      p_earning_id: earningId,
      p_reason: reason,
    });
    if (error) throw error;
    return Math.max(0, Number(data) || 0);
  } catch (err) {
    if (!isMissingSchema(err)) console.error('[teamSplits/reservations] freeze failed:', err);
    return 0;
  }
}

/** Unfreeze on a WON dispute. Explicit and separate so restoration is never a side effect. */
export async function unfreezeReservesForEarning(admin: Admin, earningId: string): Promise<number> {
  try {
    const { data, error } = await admin.rpc('unfreeze_team_split_reservations', {
      p_earning_id: earningId,
    });
    if (error) throw error;
    return Math.max(0, Number(data) || 0);
  } catch (err) {
    if (!isMissingSchema(err)) console.error('[teamSplits/reservations] unfreeze failed:', err);
    return 0;
  }
}

/**
 * Record a D3 artist return against a funded reservation. Idempotent on the Stripe transfer id, so
 * a crash between the transfer and this write cannot pay the artist twice.
 *
 * Returns the cents recorded, or 0 when the RPC refused (already returned, not funded, or frozen).
 */
export async function recordSurplusReturn(
  admin: Admin,
  reservationId: string,
  cents: number,
  reason: string,
  transferId: string,
): Promise<number> {
  try {
    const { data, error } = await admin.rpc('return_team_split_surplus', {
      p_reservation_id: reservationId,
      p_cents: Math.floor(cents),
      p_reason: reason,
      p_transfer_id: transferId,
    });
    if (error) throw error;
    return Math.max(0, Number(data) || 0);
  } catch (err) {
    if (!isMissingSchema(err)) console.error('[teamSplits/reservations] surplus record failed:', err);
    return 0;
  }
}

/** Is the reservation ledger available? Used by the cashout readiness gate. */
export async function reservationLedgerReady(admin: Admin): Promise<boolean> {
  try {
    const { error } = await admin.from('team_split_cap_reservations').select('id').limit(1);
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
}
