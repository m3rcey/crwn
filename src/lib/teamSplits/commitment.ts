// Team Splits — SCOPE OVERLAP and the over-commitment rule (D4, ratified 2026-08-12).
//
// THE RULE
// --------
// A deal must not become economically binding if CRWN cannot honour its literal percentage.
// So: reject at acceptance when the sum of concurrently applicable collaborator percentages on any
// overlapping scope would exceed 100% of the artist's qualifying net.
//
// No pro-rata. No first-accepted-wins. No array-order allocation. No hidden seniority. Those were
// all considered and rejected: each one silently decides, after the fact, which of two real people
// gets paid in full, and neither of them agreed to that.
//
// WHAT "OVERLAP" MEANS
// --------------------
// Not "every split this artist has". Two deals conflict only when the SAME future qualifying
// earning could legally match both:
//   60% of Product X  +  50% of Product Y   -> no conflict, different fences
//   60% of Product X  +  50% of Product X   -> conflict, 110%
//   60% of all_earnings + 50% of Product X  -> conflict, all_earnings matches Product X too
// `custom` and `none` name no revenue source and accrue nothing (allocation.ts returns []), so they
// can never conflict with anything.
//
// `road_campaign` is not a first-class fence. It collapses to the tier/product the campaign
// actually sells. That resolution needs a database read, so the CALLER resolves it and passes the
// resolved scope in; this module stays pure and testable.
//
// PURE. No I/O. Integer percentages in, decision out.

import type { PayoutBasis, RevenueSourceType } from './types';

/** The sources a deal can be fenced to, mirroring POSITIVE_TYPES in allocation.ts. */
export type FenceableSource = 'tier' | 'product' | 'track' | 'live_session' | 'booking';

/** A resolved, comparable fence. `road_campaign` must already be collapsed by the caller. */
export type Scope =
  | { kind: 'all_earnings' }
  | { kind: 'source'; src: FenceableSource; id: string }
  | { kind: 'unfenced' }; // custom / none / unresolvable: accrues nothing, conflicts with nothing

const FENCEABLE: readonly FenceableSource[] = ['tier', 'product', 'track', 'live_session', 'booking'];

/**
 * Turn a deal's stored source into a comparable scope.
 *
 * `resolvedRoadCampaign` is the tier/product a `road_campaign` deal was resolved to, or null when
 * it could not be resolved. An unresolvable campaign is `unfenced`: allocation.ts already accrues
 * nothing for it, so it must not block anything either.
 */
export function resolveScope(
  sourceType: RevenueSourceType,
  sourceId: string | null | undefined,
  resolvedRoadCampaign?: { src: 'tier' | 'product'; id: string } | null,
): Scope {
  if (sourceType === 'all_earnings') return { kind: 'all_earnings' };
  if (sourceType === 'road_campaign') {
    return resolvedRoadCampaign
      ? { kind: 'source', src: resolvedRoadCampaign.src, id: resolvedRoadCampaign.id }
      : { kind: 'unfenced' };
  }
  if (sourceType === 'custom' || sourceType === 'none') return { kind: 'unfenced' };
  if (!sourceId) return { kind: 'unfenced' }; // a fence with no id attributes nothing
  if ((FENCEABLE as readonly string[]).includes(sourceType)) {
    return { kind: 'source', src: sourceType as FenceableSource, id: sourceId };
  }
  return { kind: 'unfenced' };
}

/** Could ONE future earning match both scopes? */
export function scopesOverlap(a: Scope, b: Scope): boolean {
  if (a.kind === 'unfenced' || b.kind === 'unfenced') return false;
  if (a.kind === 'all_earnings' || b.kind === 'all_earnings') return true;
  return a.src === b.src && a.id === b.id;
}

/**
 * Deal statuses that are ECONOMICALLY BINDING: they can produce a funded reserve and therefore a
 * collaborator payable. A draft or a rejected invitation commits nothing and must not block a new
 * deal, or an artist could be locked out by paperwork they never signed.
 *
 * `sent` / `viewed` / `changes_requested` are deliberately EXCLUDED: nobody has agreed yet. The
 * race that matters (two acceptances landing together) is closed at acceptance, atomically, by the
 * database, not by widening this list.
 */
export const BINDING_STATUSES: readonly string[] = ['accepted', 'active'];

export interface CommitmentDeal {
  id: string;
  status: string;
  percentage: number | null;
  payout_basis: PayoutBasis;
  scope: Scope;
}

/**
 * Express a deal's claim as a percentage of the artist's QUALIFYING NET, which is the unit D4 is
 * written in.
 *
 * A `gross_revenue` deal claims a share of gross, and gross is bigger than net, so the same number
 * is a bigger claim. Converting with the artist's plan fee and NO referral is the LOWEST honest
 * value for that claim: a referral shrinks the net further and makes the real claim larger. Using
 * the low end means this validator only ever rejects contracts that are impossible even in the
 * artist's best case, and `computeFunding`'s runtime clamp remains the backstop for the rest. A
 * validator that guesses high would refuse deals that are actually payable.
 */
export function claimAsPercentOfNet(deal: CommitmentDeal, platformFeePercent: number): number {
  const pct = Math.max(0, deal.percentage ?? 0);
  if (pct === 0) return 0;
  if (deal.payout_basis !== 'gross_revenue') return pct;
  const artistShareOfGross = Math.max(1, 100 - Math.min(Math.max(platformFeePercent, 0), 99));
  return (pct * 100) / artistShareOfGross;
}

export interface CommitmentConflict {
  dealId: string;
  /** Percent of net this existing deal already claims on the overlapping scope. */
  claimPercentOfNet: number;
}

export interface CommitmentResult {
  ok: boolean;
  /** Total percent of net committed on the worst overlapping scope, candidate included. */
  totalPercentOfNet: number;
  conflicts: CommitmentConflict[];
  /** Machine-readable, safe to return to a client. Never exposes SQL or Stripe detail. */
  code?: 'over_committed';
}

/** Exactly 100% is allowed. It leaves the artist nothing, which is their call, but it is payable. */
export const MAX_COMMITTED_PERCENT_OF_NET = 100;

/**
 * Would accepting `candidate` push any overlapping scope past 100% of the artist's net?
 *
 * Compares the candidate against every binding deal it overlaps. A single total is enough because
 * the candidate is one scope: whatever overlaps it competes for the same earnings.
 */
export function validateCommitment(input: {
  candidate: CommitmentDeal;
  existing: CommitmentDeal[];
  platformFeePercent: number;
}): CommitmentResult {
  const { candidate, existing, platformFeePercent } = input;

  const candidateClaim = claimAsPercentOfNet(candidate, platformFeePercent);
  if (candidate.scope.kind === 'unfenced' || candidateClaim === 0) {
    // Accrues nothing, so it commits nothing.
    return { ok: true, totalPercentOfNet: 0, conflicts: [] };
  }

  const conflicts: CommitmentConflict[] = [];
  let total = candidateClaim;

  for (const other of existing) {
    if (other.id === candidate.id) continue;
    if (!BINDING_STATUSES.includes(other.status)) continue;
    if (!scopesOverlap(candidate.scope, other.scope)) continue;
    const claim = claimAsPercentOfNet(other, platformFeePercent);
    if (claim <= 0) continue;
    conflicts.push({ dealId: other.id, claimPercentOfNet: round2(claim) });
    total += claim;
  }

  const totalPercentOfNet = round2(total);
  return totalPercentOfNet > MAX_COMMITTED_PERCENT_OF_NET
    ? { ok: false, totalPercentOfNet, conflicts, code: 'over_committed' }
    : { ok: true, totalPercentOfNet, conflicts };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The artist-facing sentence. Says what is wrong and what it collides with, in money terms, without
 * naming a table, a column or a Stripe object.
 *
 * Copy rule: no em dashes.
 */
export function commitmentErrorMessage(result: CommitmentResult): string {
  const total = Math.round(result.totalPercentOfNet);
  const n = result.conflicts.length;
  const others = n === 1 ? 'another split' : `${n} other splits`;
  return (
    `This split would commit ${total}% of what you keep from this revenue, and you only have 100% to give. ` +
    `It overlaps ${others} already agreed on the same revenue. ` +
    `Lower the percentage, point it at different revenue, or end the overlapping split first.`
  );
}
