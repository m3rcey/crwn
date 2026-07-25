// Opportunity tracking: the pure calculation core.
//
// An "opportunity" is a dollar figure a calculator revealed, tracked through four states:
//   revealed   - what the calculator estimated the artist could earn (monthly cents)
//   activated  - the artist built the feature, so the money is now in play
//   captured   - real money actually earned from that feature (from live revenue tables)
//   remaining  - revealed minus captured, floored at zero (never negative)
//
// The unit of tracking is (artist, FEATURE), not (artist, calculator). That is the whole
// duplicate-counting defense: two calculators (e.g. the Streaming Loss and the Vault planner) both
// describe the SAME membership money, so their reveals must NOT be summed. We take the MAX per
// feature. Captured is a real, feature-level revenue number, so it is unambiguous by construction.
//
// This module is pure (no I/O) so the arithmetic is fully testable. The recompute that reads real
// revenue lives in opportunityLedger.ts.

// The three disjoint feature categories the five calculators map onto. Disjoint is deliberate:
// each maps to ONE real revenue source, so captured can never be double-counted across features.
export const OPPORTUNITY_FEATURES = ['membership', 'live', 'referral'] as const;
export type OpportunityFeature = (typeof OPPORTUNITY_FEATURES)[number];

export const FEATURE_BY_CALCULATOR: Record<string, OpportunityFeature> = {
  worth: 'membership',
  'vault-revenue-planner': 'membership',
  'live-experience-calculator': 'live',
  'executive-producer-session': 'live',
  'share-to-earn-planner': 'referral',
};

export function featureForCalculator(slug: string): OpportunityFeature | null {
  return FEATURE_BY_CALCULATOR[slug] ?? null;
}

/** remaining = revealed - captured, never negative. Captured can exceed revealed (they beat the
 *  estimate); remaining is then zero, not a negative "you owe the calculator" figure. */
export function computeRemaining(revealedCents: number, capturedCents: number): number {
  return Math.max(0, Math.round(revealedCents) - Math.round(capturedCents));
}

// A calculator reveal: the monthly opportunity a specific completed calculator produced.
export interface Reveal {
  calculator: string;
  monthlyCents: number;
  /** When it was revealed, for the month/year dimensions. ISO string. */
  revealedAt: string;
}

export interface FeatureReveal {
  feature: OpportunityFeature;
  /** The winning calculator (the one with the max reveal for this feature). */
  calculator: string;
  revealedCents: number;
  revealedAt: string;
}

/**
 * Collapse a set of per-calculator reveals to one reveal PER FEATURE, taking the max so two
 * calculators describing the same money are never summed. This is the dedup rule.
 */
export function revealedByFeature(reveals: Reveal[]): FeatureReveal[] {
  const best = new Map<OpportunityFeature, FeatureReveal>();
  for (const r of reveals) {
    const feature = featureForCalculator(r.calculator);
    if (!feature) continue;
    if (!(r.monthlyCents > 0)) continue;
    const cur = best.get(feature);
    if (!cur || r.monthlyCents > cur.revealedCents) {
      best.set(feature, {
        feature,
        calculator: r.calculator,
        revealedCents: Math.round(r.monthlyCents),
        revealedAt: r.revealedAt,
      });
    }
  }
  return [...best.values()];
}

export interface Period {
  year: number;
  month: number; // 1-12
}

// A full ledger row's computable fields, given a feature reveal + its captured revenue + activation.
export interface OpportunityRow {
  feature: OpportunityFeature;
  calculator: string;
  revealedCents: number;
  capturedCents: number;
  remainingCents: number;
  activated: boolean;
  revealedAt: string;
  periodMonth: number; // 1-12, the capture month
  periodYear: number;
}

/** Assemble one ledger row's derived fields for a given capture period. Pure: captured, activated,
 *  and the period are passed in (the period is the CAPTURE month, not the reveal date). */
export function buildOpportunityRow(
  fr: FeatureReveal,
  capturedCents: number,
  activated: boolean,
  period: Period,
): OpportunityRow {
  return {
    feature: fr.feature,
    calculator: fr.calculator,
    revealedCents: fr.revealedCents,
    capturedCents: Math.max(0, Math.round(capturedCents)),
    remainingCents: computeRemaining(fr.revealedCents, capturedCents),
    // Captured money means the feature is in play, so a non-zero capture implies activated too.
    activated: activated || capturedCents > 0,
    revealedAt: fr.revealedAt,
    periodMonth: period.month,
    periodYear: period.year,
  };
}

// Map an `earnings.type` to the opportunity feature it captures. Disjoint on purpose: subscription
// -> membership, live ticket/tip -> live. Referral is NOT here (it is a cost netted out of
// subscription earnings; the referral feature's captured comes from referral_earnings separately).
export const EARNING_TYPE_TO_FEATURE: Record<string, OpportunityFeature> = {
  subscription: 'membership',
  live_ticket: 'live',
  live_tip: 'live',
};

export interface EarningRow {
  type: string;
  net_amount: number;
  stripe_payment_id?: string | null;
}

/**
 * Sum captured net revenue per feature from raw earnings rows, netting refunds/disputes back onto
 * the feature they came from. A refund is a negative earning keyed `<pi>_refund`; grouping by type
 * alone would strand it in a 'refund' bucket and OVERSTATE captured, so we resolve each refund to
 * its original payment's type. Originals not present in this batch are returned as
 * `unresolvedRefunds` for the caller to resolve with one lookup (they cannot be resolved purely).
 *
 * Pure and exported so the netting arithmetic is fully tested.
 */
export function capturedFromEarnings(rows: EarningRow[]): {
  captured: Record<OpportunityFeature, number>;
  unresolvedRefunds: { base: string; amount: number }[];
} {
  const captured: Record<OpportunityFeature, number> = { membership: 0, live: 0, referral: 0 };
  const typeByPi = new Map<string, string>();
  for (const r of rows) if (r.stripe_payment_id) typeByPi.set(r.stripe_payment_id, r.type);

  const unresolvedRefunds: { base: string; amount: number }[] = [];
  for (const r of rows) {
    const amt = Number(r.net_amount) || 0;
    if (r.type === 'refund' || r.type === 'dispute') {
      const base = String(r.stripe_payment_id ?? '').replace(/_(refund|dispute)$/, '');
      const origType = base ? typeByPi.get(base) : undefined;
      const f = origType ? EARNING_TYPE_TO_FEATURE[origType] : undefined;
      if (f) captured[f] += amt; // amt is negative -> subtracts from the right feature
      else if (base) unresolvedRefunds.push({ base, amount: amt });
    } else {
      const f = EARNING_TYPE_TO_FEATURE[r.type];
      if (f) captured[f] += amt;
    }
  }
  return { captured, unresolvedRefunds };
}

/** Totals across a set of rows, for a dashboard header. Remaining is summed from per-row remaining
 *  (each already floored), so it is never negative and never double-counts across features. */
export function totalsOf(rows: OpportunityRow[]): {
  revealedCents: number;
  capturedCents: number;
  remainingCents: number;
  activatedCount: number;
} {
  return rows.reduce(
    (acc, r) => ({
      revealedCents: acc.revealedCents + r.revealedCents,
      capturedCents: acc.capturedCents + r.capturedCents,
      remainingCents: acc.remainingCents + r.remainingCents,
      activatedCount: acc.activatedCount + (r.activated ? 1 : 0),
    }),
    { revealedCents: 0, capturedCents: 0, remainingCents: 0, activatedCount: 0 },
  );
}
