// Team Splits — revenue allocation math + qualifying-earnings resolution.
//
// SAFETY: allocations are computed against the `earnings` ledger (READ ONLY).
// This module never writes to the Stripe webhook path. The daily cron
// (/api/cron/team-split-accruals) calls getQualifyingEarnings() then
// splitAmountForEarning()/applyCap() per row and inserts held accruals.
//
// Basis: net_artist_revenue -> earnings.net_amount (already net of platform fee
// AND fan/clipper commission on BOTH the initial payment and renewals — F-01
// closed the initial-payment gap via the shared subscriptionEarningNet helper)
// so Team Splits sit AFTER fan/clipper in the stack and a collaborator can never
// be owed more than the artist got.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TeamSplitDeal } from './types';

/** The earnings-row shape the allocator needs. */
export interface EarningRow {
  id: string;
  fan_id: string | null;
  type: string;
  gross_amount: number;
  net_amount: number;
  stripe_payment_id: string | null;
  created_at: string;
}

/** Raw split amount (pre-cap) in cents for one earning under a deal. */
export function splitAmountForEarning(earning: EarningRow, deal: TeamSplitDeal): number {
  const basis = deal.payout_basis === 'gross_revenue' ? earning.gross_amount : earning.net_amount;
  if (basis <= 0) return 0;
  const pct = deal.percentage ?? 0;
  if (pct <= 0) return 0;
  return Math.round((basis * pct) / 100);
}

/** Apply the cap given what has already been accrued. Never returns negative. */
export function applyCap(rawAmount: number, alreadyAccrued: number, capAmount: number | null): number {
  if (rawAmount <= 0) return 0;
  if (capAmount == null) return rawAmount;
  const remaining = capAmount - alreadyAccrued;
  if (remaining <= 0) return 0;
  return Math.min(rawAmount, remaining);
}

/** Positive revenue event types (refund/dispute are handled as clawbacks). */
const POSITIVE_TYPES = ['subscription', 'purchase', 'booking', 'live_ticket'];

function typesForSource(sourceType: string): string[] {
  switch (sourceType) {
    case 'tier':
      return ['subscription'];
    case 'product':
    case 'track':
      return ['purchase'];
    case 'live_session':
      return ['live_ticket'];
    case 'booking':
      return ['booking'];
    default:
      return POSITIVE_TYPES; // all_earnings only — every other source is fenced or returns []
  }
}

/** Effective [start, end] window for a deal. */
export function dealWindow(deal: TeamSplitDeal): { start: string; end: string } {
  const start = deal.starts_at || deal.accepted_at || deal.created_at;
  const end = deal.ends_at || new Date().toISOString();
  return { start, end };
}

/** The tier/product a road campaign drives revenue to, plus its own time window. */
interface ResolvedCampaign {
  src: 'tier' | 'product';
  srcId: string;
  start: string;
  end: string;
}

/**
 * Resolve a `road_campaign` deal down to the tier/product fence it actually
 * sells. `earnings` has NO road_campaigns FK (earnings.source_campaign_id points
 * at `campaigns`, the email-blast table — a different thing), so the only honest
 * attribution is the campaign's linked checkout target, bounded by the
 * campaign's own [started_at, deadline].
 *
 * Returns null when the campaign drives no revenue target (goal_type of
 * supporters/rsvps/votes/... with no linked tier or product). Callers MUST then
 * accrue nothing: an unfenceable source pays $0, never "everything".
 */
async function resolveRoadCampaign(
  admin: SupabaseClient,
  deal: TeamSplitDeal,
): Promise<ResolvedCampaign | null> {
  if (!deal.revenue_source_id) return null;

  const { data: campaign } = await admin
    .from('road_campaigns')
    .select('artist_id, linked_tier_id, linked_product_id, started_at, deadline')
    .eq('id', deal.revenue_source_id)
    .maybeSingle();

  // Must exist and belong to the same artist as the deal.
  if (!campaign || campaign.artist_id !== deal.artist_id) return null;

  const srcId = campaign.linked_tier_id || campaign.linked_product_id;
  if (!srcId) return null;

  return {
    src: campaign.linked_tier_id ? 'tier' : 'product',
    srcId,
    start: campaign.started_at,
    end: campaign.deadline || new Date().toISOString(),
  };
}

const laterOf = (a: string, b: string) => (a > b ? a : b);
const earlierOf = (a: string, b: string) => (a < b ? a : b);

/**
 * Return the earnings rows that qualify for this deal and have NOT yet been
 * accrued (idempotent — safe to call repeatedly). Resolves the source through
 * the parallel purchase/subscription tables because `earnings` has no
 * first-class source FK.
 */
export async function getQualifyingEarnings(
  admin: SupabaseClient,
  deal: TeamSplitDeal,
): Promise<EarningRow[]> {
  let { start, end } = dealWindow(deal);

  // Resolve the effective fence. `road_campaign` is not a first-class revenue
  // source — it collapses to the tier/product it sells, intersected with the
  // campaign's own window. Anything that cannot be fenced accrues NOTHING.
  let src: string = deal.revenue_source_type;
  let srcId = deal.revenue_source_id;

  if (src === 'road_campaign') {
    const resolved = await resolveRoadCampaign(admin, deal);
    if (!resolved) return [];
    src = resolved.src;
    srcId = resolved.srcId;
    start = laterOf(start, resolved.start);
    end = earlierOf(end, resolved.end);
    if (start >= end) return [];
  }

  // `custom` / `none` name no revenue source. Paying them on every earning is an
  // unlabelled `all_earnings` deal — the one thing Team Splits exists to prevent.
  if (src === 'custom' || src === 'none') return [];

  const types = typesForSource(src);

  // Rows already accrued for this deal (exclude them).
  const { data: accrued } = await admin
    .from('team_split_earnings')
    .select('earning_id')
    .eq('deal_id', deal.id)
    .not('earning_id', 'is', null);
  const accruedIds = new Set((accrued || []).map((r: { earning_id: string }) => r.earning_id));

  // Base candidate earnings for this artist in the window.
  const { data: earnings } = await admin
    .from('earnings')
    .select('id, fan_id, type, gross_amount, net_amount, stripe_payment_id, created_at')
    .eq('artist_id', deal.artist_id)
    .in('type', types)
    .gt('net_amount', 0)
    .gte('created_at', start)
    .lte('created_at', end);

  let candidates: EarningRow[] = (earnings || []) as EarningRow[];
  candidates = candidates.filter((e) => !accruedIds.has(e.id));
  if (candidates.length === 0) return [];

  // `all_earnings` is the ONE legitimate unfenced source: it is explicitly
  // labelled, hard-flagged high-risk in warnings.ts, and the artist opted in.
  if (src === 'all_earnings') return candidates;

  // Every other source needs an id to fence against. Without one there is
  // nothing to attribute, so accrue nothing.
  if (!srcId) return [];

  if (src === 'tier') {
    // A fan has one subscription per (fan_id, artist_id); attribute subscription
    // earnings to that fan's current tier.
    const { data: subs } = await admin
      .from('subscriptions')
      .select('fan_id')
      .eq('artist_id', deal.artist_id)
      .eq('tier_id', srcId);
    const fanIds = new Set((subs || []).map((s: { fan_id: string }) => s.fan_id));
    return candidates.filter((e) => e.fan_id && fanIds.has(e.fan_id));
  }

  // product / track / live_session / booking -> match via stripe payment intent.
  let intentIds = new Set<string>();
  if (src === 'product') {
    const { data } = await admin.from('purchases').select('stripe_payment_intent_id').eq('product_id', srcId);
    intentIds = new Set((data || []).map((r: { stripe_payment_intent_id: string }) => r.stripe_payment_intent_id).filter(Boolean));
  } else if (src === 'track') {
    const { data } = await admin.from('purchases').select('stripe_payment_intent_id').eq('track_id', srcId);
    intentIds = new Set((data || []).map((r: { stripe_payment_intent_id: string }) => r.stripe_payment_intent_id).filter(Boolean));
  } else if (src === 'live_session') {
    const { data } = await admin.from('live_ticket_purchases').select('stripe_payment_intent_id').eq('session_id', srcId);
    intentIds = new Set((data || []).map((r: { stripe_payment_intent_id: string }) => r.stripe_payment_intent_id).filter(Boolean));
  } else if (src === 'booking') {
    const { data } = await admin.from('booking_purchases').select('stripe_payment_intent_id').eq('booking_session_id', srcId);
    intentIds = new Set((data || []).map((r: { stripe_payment_intent_id: string }) => r.stripe_payment_intent_id).filter(Boolean));
  }

  return candidates.filter((e) => e.stripe_payment_id && intentIds.has(e.stripe_payment_id));
}

/** Sum of commission accrued to date for a deal (authoritative, from the ledger). */
export async function accruedToDate(admin: SupabaseClient, dealId: string): Promise<number> {
  const { data } = await admin
    .from('team_split_earnings')
    .select('commission_amount')
    .eq('deal_id', dealId);
  return (data || []).reduce((s: number, r: { commission_amount: number }) => s + r.commission_amount, 0);
}
