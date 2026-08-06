// CRWN Revenue Models: the offer-archetype layer (founder decision, 2026-08-06).
//
// A SECOND, ORTHOGONAL axis to the sub-avatar taxonomy. The sub-avatar answers
// "who is this artist" (identity: priority tier, operating maturity, genre) and
// drives ACQUISITION: which funnel, which nurture themes, which framing. The
// revenue model answers "which monetization system should they run FIRST" and
// drives the OFFER PRESCRIPTION. The two never replace each other:
//
//   acquisition avatar  ->  revenue model  ->  personalized launch plan
//
// A Brand-Led Hip-Hop Artist can be a Membership Consolidation case, a
// Between-Tour Revenue case, or a Live Community case. That is why this is not
// a fifth sub-avatar and must never be merged into taxonomy.ts.
//
// House pattern (same as membershipStrategy / planRecommendation / the
// sub-avatar scorer): pure, deterministic, DERIVED ON READ from evidence that
// already exists. Every point of score carries a human-readable evidence line.
// Nothing here is stored; there is deliberately no override column until an
// artist actually asks for one.
//
// The four models and what they lean on:
//  - membership_consolidation  -> fanStackModel.ts (the consolidation math)
//  - between_tour_revenue      -> betweenTourModel.ts (the touring math)
//  - live_community_monetization -> live sessions + Executive Producer seats
//  - independent_empire_expansion -> the full ladder + shop + premium access
//
// Honesty rules:
//  - Touring evidence is only assigned when touring evidence EXISTS (the shared
//    calculator does not ask about shows; the between-tour tool does). No
//    touring answers, no between-tour prescription.
//  - Below the evidence floor the artist gets the DEFAULT (Membership
//    Consolidation, the ICP baseline: a proven seller with a fragmented stack)
//    marked isDefault, never a guessed "assignment".

import type { SubAvatarEvidence } from './assignment';

export const REVENUE_MODEL_VERSION = 'revenueModel@1';

export type RevenueModelKey =
  | 'membership_consolidation'
  | 'between_tour_revenue'
  | 'live_community_monetization'
  | 'independent_empire_expansion';

export interface RevenueModelDef {
  key: RevenueModelKey;
  /** Display label. Safe to rename; the key is not. */
  label: string;
  /** Who this model fits, in one artist-readable line. */
  bestFor: string;
  /** The initial offer this model prescribes, in one line. Real CRWN features only. */
  initialOffer: string;
  /** The ladder rung this model leads with (tierTemplate key; names come from RECOMMENDED_LADDER). */
  leadRung: 'wave' | 'inner_circle' | 'vault' | 'throne';
  /** The first moves, in order. Real routes only. */
  firstMoves: { label: string; route: string }[];
}

/** ORDER IS PRECEDENCE (ties break toward the earlier entry), matching the
 *  sub-avatar convention. Consolidation first: it is the ICP baseline. */
export const REVENUE_MODELS: RevenueModelDef[] = [
  {
    key: 'membership_consolidation',
    label: 'Membership Consolidation',
    bestFor: 'You run fans, sales and community across platforms that do not talk to each other.',
    initialOffer:
      'One membership home: the free front door plus the paid ladder, with your community and vault in the same place fans pay.',
    leadRung: 'inner_circle',
    firstMoves: [
      { label: 'Import every list you own', route: '/studio/fans' },
      { label: 'Confirm the full ladder', route: '/account/tiers' },
      { label: 'Send the launch announcement', route: '/studio/fans?view=campaigns' },
    ],
  },
  {
    key: 'between_tour_revenue',
    label: 'Between-Tour Revenue',
    bestFor: 'You have real ticket and VIP demand, and the income stops the night the run ends.',
    initialOffer:
      'Recurring VIP access on the Gold rung: presale priority, tour content and replays, with a structured VIP experience.',
    leadRung: 'vault',
    firstMoves: [
      { label: 'Build the VIP rung', route: '/account/tiers' },
      { label: 'Schedule a members-only session', route: '/studio/live' },
      { label: 'Put the promises on the calendar', route: '/studio/promise' },
    ],
  },
  {
    key: 'live_community_monetization',
    label: 'Live Community Monetization',
    bestFor: 'You already go live and talk to fans directly, and none of it pays you.',
    initialOffer:
      'Members-only streams and replays, plus ticketed limited-seat sessions where fans watch you work.',
    leadRung: 'vault',
    firstMoves: [
      { label: 'Schedule the first members live', route: '/studio/live' },
      { label: 'Gate the replays behind the ladder', route: '/account/tiers' },
      { label: 'Put the cadence on the calendar', route: '/studio/promise' },
    ],
  },
  {
    key: 'independent_empire_expansion',
    label: 'Independent Empire Expansion',
    bestFor: 'You already sell several things directly, and every new offer starts from zero.',
    initialOffer:
      'A premium membership connecting music, products, access and community, launched to the buyers you already have.',
    leadRung: 'throne',
    firstMoves: [
      { label: 'Build the premium offer', route: '/offers/new' },
      { label: 'Connect the shop to the ladder', route: '/studio/shop' },
      { label: 'Invite your proven buyers first', route: '/studio/fans' },
    ],
  },
];

export const REVENUE_MODEL_PRECEDENCE: Record<RevenueModelKey, number> = Object.fromEntries(
  REVENUE_MODELS.map((m, i) => [m.key, i]),
) as Record<RevenueModelKey, number>;

const BY_KEY: Record<string, RevenueModelDef> = Object.fromEntries(REVENUE_MODELS.map((m) => [m.key, m]));

export function getRevenueModel(key: string | null | undefined): RevenueModelDef | null {
  if (!key) return null;
  return BY_KEY[key] ?? null;
}

export function isRevenueModelKey(v: unknown): v is RevenueModelKey {
  return typeof v === 'string' && !!BY_KEY[v];
}

/** Evidence the shared SubAvatarEvidence does not carry: touring and shop facts.
 *  All optional; a missing fact is silence, never a zero. */
export interface RevenueModelExtras {
  /** Shows or tour dates per year (between-tour tool answers, when they exist). */
  showsPerYear?: number | null;
  /** VIP packages sold per year (between-tour tool answers). */
  vipBuyersPerYear?: number | null;
  /** Behavioral: active products in the CRWN shop. */
  productsListed?: number | null;
}

export interface RevenueModelRecommendation {
  model: RevenueModelKey;
  secondary: RevenueModelKey | null;
  version: string;
  confidence: 'high' | 'medium' | 'low';
  /** True when nothing cleared the evidence floor and the ICP baseline applied. */
  isDefault: boolean;
  /** Human-readable evidence lines for the winning model, strongest first. */
  evidence: string[];
}

interface Line {
  model: RevenueModelKey;
  points: number;
  line: string;
}

const n = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const soldDirect = (status: string | null | undefined): boolean =>
  status === 'direct_established' || status === 'direct_some';

/** The evidence floor: below this the default applies rather than a guess. */
const ASSIGN_FLOOR = 3;
const HIGH_CONFIDENCE = 5;

/** Every score line the evidence supports. Exported for tests and explain views. */
export function scoreRevenueModels(e: SubAvatarEvidence, x: RevenueModelExtras = {}): Line[] {
  const lines: Line[] = [];
  const push = (model: RevenueModelKey, points: number, line: string) => lines.push({ model, points, line });

  // Membership Consolidation: the fragmented stack itself is the evidence.
  const platforms = (e.platformsUsed ?? []).filter(Boolean);
  if (platforms.length >= 2) {
    push(
      'membership_consolidation',
      3,
      `Runs ${platforms.length} platforms that do not talk to each other (${platforms.slice(0, 4).join(', ')}${platforms.length > 4 ? ', ...' : ''})`,
    );
  }
  if (e.patreonImported === true) {
    push('membership_consolidation', 2, 'Imported a Patreon member list into CRWN');
  }
  if (platforms.length >= 2 && soldDirect(e.monetizationStatus)) {
    push('membership_consolidation', 1, 'Already sells directly across that scattered stack');
  }

  // Between-Tour Revenue: only real touring evidence counts. The shared
  // calculator never asks about shows, so this stays silent without it.
  if (n(x.showsPerYear) >= 6) {
    push('between_tour_revenue', 3, `${n(x.showsPerYear)} shows a year with nothing recurring between them`);
  } else if (n(x.showsPerYear) >= 1) {
    push('between_tour_revenue', 2, `Plays ${n(x.showsPerYear)} shows a year`);
  }
  if (n(x.vipBuyersPerYear) > 0) {
    push('between_tour_revenue', 2, `${n(x.vipBuyersPerYear)} fans a year already pay VIP prices`);
  }

  // Live Community Monetization: behavior beats intention, intention beats nothing.
  if (n(e.liveSessionsHosted) >= 1) {
    push('live_community_monetization', 3, `Already hosted ${n(e.liveSessionsHosted)} live sessions on CRWN`);
  }
  if (e.liveWilling === 'yes') {
    push('live_community_monetization', 2, 'Wants to go live for fans');
  }
  if (e.videoOutput === 'lots') {
    push('live_community_monetization', 1, 'Already puts out video constantly');
  }

  // Independent Empire Expansion: multiple proven income streams, ready to compound.
  if (e.monetizationStatus === 'direct_established') {
    push('independent_empire_expansion', 2, 'Direct sales are already a real income stream');
  }
  if (n(x.productsListed) >= 2) {
    push('independent_empire_expansion', 2, `${n(x.productsListed)} products already listed in the CRWN shop`);
  }
  if (n(e.currentSupporters) >= 25 || n(e.directRevenueCents) >= 100_000) {
    push('independent_empire_expansion', 1, 'A paying fanbase already exists to expand on');
  }
  if (n(e.audience) >= 250_000) {
    push('independent_empire_expansion', 1, `${n(e.audience).toLocaleString('en-US')} audience to sell the next offer to`);
  }

  return lines;
}

/**
 * Deterministic prescription. Same evidence, same model, and every claim can
 * show its evidence lines. Below the floor, the ICP baseline (Membership
 * Consolidation) applies as an honest default rather than a fake assignment.
 */
export function recommendRevenueModel(
  e: SubAvatarEvidence,
  x: RevenueModelExtras = {},
): RevenueModelRecommendation {
  const lines = scoreRevenueModels(e, x);
  const totals = new Map<RevenueModelKey, number>();
  for (const l of lines) totals.set(l.model, (totals.get(l.model) ?? 0) + l.points);

  const ranked = [...totals.entries()].sort(
    (a, b) => b[1] - a[1] || REVENUE_MODEL_PRECEDENCE[a[0]] - REVENUE_MODEL_PRECEDENCE[b[0]],
  );

  const top = ranked[0];
  if (!top || top[1] < ASSIGN_FLOOR) {
    return {
      model: 'membership_consolidation',
      secondary: null,
      version: REVENUE_MODEL_VERSION,
      confidence: 'low',
      isDefault: true,
      evidence: ['The ICP baseline: a proven direct-to-fan seller with a fragmented stack starts by consolidating it'],
    };
  }

  const evidence = lines
    .filter((l) => l.model === top[0])
    .sort((a, b) => b.points - a.points)
    .map((l) => l.line);

  const runnerUp = ranked[1];
  return {
    model: top[0],
    secondary: runnerUp && runnerUp[1] >= ASSIGN_FLOOR ? runnerUp[0] : null,
    version: REVENUE_MODEL_VERSION,
    confidence: top[1] >= HIGH_CONFIDENCE ? 'high' : 'medium',
    isDefault: false,
    evidence,
  };
}
