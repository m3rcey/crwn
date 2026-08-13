// Team Splits — the CHARGE-TIME RESERVE resolver. This is the module that puts collaborator money
// on the right side of the transfer.
//
// Canonical architecture: docs/crwn-brain/28-TEAM-SPLIT-FUNDING-ARCHITECTURE.md
//
// WHY THIS EXISTS
// ---------------
// CRWN sells through Stripe DESTINATION charges, so the artist's share settles into the ARTIST's
// Connect account and only the application fee stays with CRWN. Paying a collaborator afterwards
// therefore spent CRWN's own money: on a $100 Launch sale CRWN kept $8.80 after Stripe fees and
// would have transferred $44. This module makes the collaborator's share part of the application
// fee, so it is WITHHELD before the artist is paid, exactly as the referral rail already does.
//
// It is the ONE place that decides how many cents to reserve. Checkout routes and the invoice
// webhook call it; none of them re-implement percentage, cap or allocation math.
//
// EVERY INPUT IS SERVER-DERIVED. Nothing here accepts a client-supplied amount, deal, or fee.

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeFunding, reconciles, type FundingDeal, type FundingBreakdown } from './funding';
import { resolveScope, scopesOverlap, type Scope } from './commitment';
import type { RevenueSourceType } from './types';

type Admin = SupabaseClient | any;

/** Postgres codes meaning "the migration has not run". Treated as "no reserve", which is safe. */
function isMissingSchema(err: any): boolean {
  return err?.code === '42P01' || err?.code === '42703' || err?.code === '42883';
}

export interface SaleContext {
  artistId: string;
  /** The canonical fence this sale belongs to. Resolved server-side from what is being bought. */
  sourceType: RevenueSourceType;
  sourceId: string | null;
  /** What the fan is ACTUALLY charged after any discount, in cents. Never a sticker price. */
  grossCents: number;
  /** The artist's plan fee percent, from TIER_LIMITS. Never hardcoded by a caller. */
  platformFeePercent: number;
  /** Referral or clipper commission percent already being added to the application fee. */
  attributedCutPercent: number;
}

export interface ResolvedReserve {
  breakdown: FundingBreakdown;
  /** Per-deal reserve in cents, the shape that rides onto `earnings.metadata.team_split_reserved`. */
  reservedByDeal: Record<string, number>;
  /** Total to add to the application fee. 0 when nothing qualifies. */
  reserveCents: number;
  /** Why nothing was reserved, for logs and tests. Never surfaced to a fan. */
  reason?: 'no_deals' | 'schema_pending' | 'read_failed' | 'zero_gross' | 'not_reconciled';
}

/** An empty, conservation-valid result. Reserving nothing is always safe: nobody can then accrue. */
function emptyReserve(sale: SaleContext, reason: ResolvedReserve['reason']): ResolvedReserve {
  const breakdown = computeFunding(
    {
      grossCents: sale.grossCents,
      platformFeePercent: sale.platformFeePercent,
      attributedCutPercent: sale.attributedCutPercent,
    },
    [],
  );
  return { breakdown, reservedByDeal: {}, reserveCents: 0, reason };
}

/**
 * Which deals may fund from THIS sale?
 *
 * Fences are resolved through the same `commitment.ts` scope model the over-commitment validator
 * uses, so "what a deal covers" has exactly one definition. A `road_campaign` collapses to the
 * tier/product it sells, and an unresolvable one covers nothing.
 *
 * D2 is enforced here as well as at accrual: a deal whose funding boundary starts AFTER this sale
 * cannot reserve against it, so it can never later claim it either.
 */
async function qualifyingDeals(
  admin: Admin,
  sale: SaleContext,
  now: Date,
): Promise<FundingDeal[] | null> {
  const { data: deals, error } = await admin
    .from('team_split_deals')
    .select('id, percentage, payout_basis, cap_amount, revenue_source_type, revenue_source_id, status, starts_at, ends_at, accepted_at, created_at')
    .eq('artist_id', sale.artistId)
    .in('status', ['accepted', 'active']);
  if (error) throw error;
  if (!deals || deals.length === 0) return [];

  const saleScope: Scope = resolveScope(sale.sourceType, sale.sourceId);
  if (saleScope.kind === 'unfenced') return [];

  const out: FundingDeal[] = [];
  for (const d of deals) {
    if (!d.percentage || d.percentage <= 0) continue;

    // The funding boundary. No reserve before it, therefore no accrual from it (D1 + D2).
    const startsAt = d.starts_at || d.accepted_at;
    if (!startsAt || new Date(startsAt).getTime() > now.getTime()) continue;
    if (d.ends_at && new Date(d.ends_at).getTime() < now.getTime()) continue;

    let dealScope = resolveScope(d.revenue_source_type as RevenueSourceType, d.revenue_source_id);
    if (d.revenue_source_type === 'road_campaign') {
      const resolved = await resolveCampaignScope(admin, sale.artistId, d.revenue_source_id);
      dealScope = resolved ? { kind: 'source', src: resolved.src, id: resolved.id } : { kind: 'unfenced' };
    }
    if (!scopesOverlap(saleScope, dealScope)) continue;

    // Cap headroom, read from the authoritative ledger.
    const { data: accrued } = await admin
      .from('team_split_earnings')
      .select('commission_amount')
      .eq('deal_id', d.id);
    const alreadyAccrued = (accrued || []).reduce(
      (s: number, r: { commission_amount: number }) => s + (r.commission_amount || 0),
      0,
    );

    out.push({
      id: d.id,
      percentage: Number(d.percentage),
      payout_basis: d.payout_basis === 'gross_revenue' ? 'gross_revenue' : 'net_artist_revenue',
      cap_amount: d.cap_amount ?? null,
      already_accrued: Math.max(0, alreadyAccrued),
    });
  }

  // Deterministic order so two identical sales reserve identically. Over-commitment is refused at
  // acceptance (D4), so ordering can no longer decide who is paid; this is only reproducibility.
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

async function resolveCampaignScope(
  admin: Admin,
  artistId: string,
  campaignId: string | null,
): Promise<{ src: 'tier' | 'product'; id: string } | null> {
  if (!campaignId) return null;
  const { data } = await admin
    .from('road_campaigns')
    .select('artist_id, linked_tier_id, linked_product_id')
    .eq('id', campaignId)
    .maybeSingle();
  if (!data || data.artist_id !== artistId) return null;
  if (data.linked_tier_id) return { src: 'tier', id: data.linked_tier_id };
  if (data.linked_product_id) return { src: 'product', id: data.linked_product_id };
  return null;
}

/**
 * THE ENTRY POINT. How many cents must be withheld from this sale to fund collaborators.
 *
 * NEVER THROWS. Every failure path returns a zero reserve, because the failure direction that
 * matters is "the collaborator is owed nothing", never "the collaborator is owed money nobody
 * funded". A checkout must not fail because a split could not be computed.
 *
 * CAP CONCURRENCY. Two sales settling together can both see the same cap headroom and both reserve
 * it. That over-collects, which is the safe direction: the accrual guard still clamps to the cap,
 * and the excess becomes D3 surplus that returns to the ARTIST. Holding a database lock across a
 * Stripe API call would be a worse trade than a small, self-correcting over-collection.
 */
export async function resolveReserveForSale(
  admin: Admin,
  sale: SaleContext,
  now: Date = new Date(),
): Promise<ResolvedReserve> {
  try {
    if (!sale.artistId || sale.grossCents <= 0) return emptyReserve(sale, 'zero_gross');

    const deals = await qualifyingDeals(admin, sale, now);
    if (!deals || deals.length === 0) return emptyReserve(sale, 'no_deals');

    const breakdown = computeFunding(
      {
        grossCents: sale.grossCents,
        platformFeePercent: sale.platformFeePercent,
        attributedCutPercent: sale.attributedCutPercent,
      },
      deals,
    );

    // CONSERVATION IS A PRECONDITION, not a report. If the cents do not add up there is phantom
    // money, and the correct response is to reserve nothing rather than to withhold a number
    // nobody can reconcile.
    if (!reconciles(breakdown)) {
      console.error('[teamSplits/reserve] breakdown failed conservation, reserving nothing', {
        artistId: sale.artistId,
        grossCents: sale.grossCents,
      });
      return emptyReserve(sale, 'not_reconciled');
    }

    const reservedByDeal: Record<string, number> = {};
    for (const d of breakdown.perDeal) {
      if (d.reserveCents > 0) reservedByDeal[d.dealId] = d.reserveCents;
    }

    return {
      breakdown,
      reservedByDeal,
      reserveCents: breakdown.collaboratorReserveCents,
    };
  } catch (err) {
    if (!isMissingSchema(err)) console.error('[teamSplits/reserve] resolve failed:', err);
    return emptyReserve(sale, isMissingSchema(err) ? 'schema_pending' : 'read_failed');
  }
}

/**
 * The metadata bag written onto the `earnings` row at settlement. This is the PROOF that money was
 * withheld, and `fundedReserveFor()` in funding.ts is the only reader. An accrual without it is
 * refused.
 *
 * Written from what the SETTLED charge actually shows, never from what checkout intended.
 */
export function reserveMetadata(reservedByDeal: Record<string, number>): Record<string, unknown> {
  const entries = Object.entries(reservedByDeal).filter(([, cents]) => cents > 0);
  return entries.length > 0 ? { team_split_reserved: Object.fromEntries(entries) } : {};
}

/**
 * Stripe metadata is a flat string map, so the per-deal reserve rides as ONE compact JSON string.
 * Kept under Stripe's 500-character value limit by construction: a sale with more collaborators
 * than fit is truncated to nothing rather than to a partial map, because a partial map would fund
 * some deals and silently strand others.
 */
export const RESERVE_STRIPE_METADATA_KEY = 'team_split_reserved';

export function reserveToStripeMetadata(reservedByDeal: Record<string, number>): Record<string, string> {
  const entries = Object.entries(reservedByDeal).filter(([, c]) => c > 0);
  if (entries.length === 0) return {};
  const json = JSON.stringify(Object.fromEntries(entries));
  if (json.length > 480) {
    console.error('[teamSplits/reserve] reserve map too large for Stripe metadata, omitting', {
      deals: entries.length,
    });
    return {};
  }
  return { [RESERVE_STRIPE_METADATA_KEY]: json };
}

/** Read the map back off a settled Stripe object. Malformed input funds nothing. */
export function reserveFromStripeMetadata(metadata: unknown): Record<string, number> {
  try {
    const raw = (metadata as Record<string, string> | null)?.[RESERVE_STRIPE_METADATA_KEY];
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = Math.floor(n);
    }
    return out;
  } catch {
    return {};
  }
}
