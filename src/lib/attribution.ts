/**
 * Attribution / payout-hold config for the referral + clipper rails.
 *
 * PAYOUT_HOLD_DAYS=0 disables the hold (rows clear immediately).
 * A referral_earnings row is only counted toward a fan cashout once
 * cleared_at <= now() (see atomic_fan_cashout in
 * supabase/schema-phase2-attribution-hardening.sql). Rows inserted without
 * an explicit cleared_at default to now() in the DB (fail-open: never
 * strand fan money).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const PAYOUT_HOLD_DAYS = 7;

/** ISO timestamp when a commission earned now becomes payable. */
export function clearedAt(from: Date = new Date()): string {
  return new Date(from.getTime() + PAYOUT_HOLD_DAYS * 86400000).toISOString();
}

export interface ReferralEarningInput {
  referral_id: string;
  artist_id: string;
  referrer_fan_id: string;
  earning_id: string | null;
  gross_amount: number;
  commission_amount: number;
}

/**
 * Insert a referral_earnings row carrying the payout hold. If the cleared_at
 * column is not present yet (migration not applied), fall back to inserting
 * without it so commission is NEVER lost — the row then clears immediately
 * (today's behavior). Deploy order therefore does not matter.
 *
 * Pass clearedAtValue = new Date().toISOString() for clawbacks (immediate).
 */
export async function insertHeldReferralEarning(
  admin: SupabaseClient,
  row: ReferralEarningInput,
  clearedAtValue: string = clearedAt(),
): Promise<void> {
  const withHold = await admin
    .from('referral_earnings')
    .insert({ ...row, cleared_at: clearedAtValue });
  if (!withHold.error) return;
  const fallback = await admin.from('referral_earnings').insert(row);
  if (fallback.error) {
    console.error('referral_earnings insert failed:', fallback.error);
  }
}
