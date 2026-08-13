// Team Splits — the ENFORCED acceptance (D4, ratified 2026-08-12).
//
// A deal must not become economically binding if CRWN cannot honour its literal percentage.
// `commitment.ts` is the pure rule and the artist-facing explanation; THIS module performs the
// enforcement through `accept_team_split_deal`, which holds an advisory lock on the artist and
// flips the status in the same transaction as the check.
//
// Why the database and not application code: two collaborators accepting 60% and 50% of the same
// source at the same instant would both pass a read-then-write check, commit 110% between them,
// and leave one of two real people short-changed at the first sale. Locking is the only honest fix.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getArtistFeePercent } from '@/lib/platformTier';
import { commitmentErrorMessage } from './commitment';

type Admin = SupabaseClient | any;

/** Missing function / missing column: the migration has not run. */
function isMissingSchema(err: any): boolean {
  return err?.code === '42883' || err?.code === '42P01' || err?.code === '42703' ||
    /does not exist/i.test(err?.message || '');
}

/**
 * The artist's plan fee percent, from the single source of truth. Needed because a
 * `gross_revenue` deal claims a larger share of NET than the same number on a net basis, and D4 is
 * expressed in percent of net.
 *
 * Falls back to the Launch fee, which is the LARGEST fee and therefore the smallest artist share,
 * which makes a gross-basis claim look BIGGER and the validator stricter. Failing strict is the
 * right direction for a commitment check.
 */
export async function artistFeePercentFor(admin: Admin, artistId: string): Promise<number> {
  try {
    const { data } = await admin
      .from('artist_profiles')
      .select('platform_tier')
      .eq('id', artistId)
      .maybeSingle();
    return getArtistFeePercent(data?.platform_tier || 'starter');
  } catch {
    return getArtistFeePercent('starter');
  }
}

export type AcceptOutcome =
  | { kind: 'accepted'; status: 'accepted' | 'active'; committedPercent: number }
  | { kind: 'over_committed'; committedPercent: number; message: string }
  | { kind: 'not_acceptable' }
  | { kind: 'unavailable' };

/**
 * Accept the deal, or refuse it for over-commitment. Nothing in between.
 *
 * `collaboratorId` is the AUTHENTICATED session's user id and the RPC re-checks it against
 * `collaborator_user_id`, so possession of a deal id is not authority.
 */
export async function acceptDealEnforced(
  admin: Admin,
  input: {
    dealId: string;
    collaboratorId: string;
    goActive: boolean;
    platformFeePercent: number;
  },
): Promise<AcceptOutcome> {
  try {
    const { data, error } = await admin.rpc('accept_team_split_deal', {
      p_deal_id: input.dealId,
      p_collaborator_id: input.collaboratorId,
      p_go_active: input.goActive,
      p_platform_fee_percent: input.platformFeePercent,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    // No row at all: the deal was not found, not bound to this collaborator, or not in a state
    // that can be responded to. The route has already checked those, so this is a race.
    if (!row) return { kind: 'not_acceptable' };

    const committedPercent = Number(row.committed_percent ?? 0);
    if (!row.new_status) {
      return {
        kind: 'over_committed',
        committedPercent,
        message: commitmentErrorMessage({
          ok: false,
          totalPercentOfNet: committedPercent,
          // The count is what the artist needs; the RPC returns the total, and the route does not
          // enumerate other people's deals to the collaborator.
          conflicts: [{ dealId: '', claimPercentOfNet: 0 }],
          code: 'over_committed',
        }),
      };
    }
    return { kind: 'accepted', status: row.new_status, committedPercent };
  } catch (err) {
    if (isMissingSchema(err)) return { kind: 'unavailable' };
    console.error('[teamSplits/acceptance] enforced accept failed:', err);
    return { kind: 'unavailable' };
  }
}
