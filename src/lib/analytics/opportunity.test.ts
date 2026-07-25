// Tests for the opportunity calculation core.
//
// This is money math, so the failure modes are silent and expensive: double-counting a reveal,
// a negative "remaining", a refund that never subtracts, a calculator mapped to the wrong feature.
// Each of those is locked here.

import { describe, expect, it } from 'vitest';

import {
  featureForCalculator,
  computeRemaining,
  revealedByFeature,
  buildOpportunityRow,
  capturedFromEarnings,
  totalsOf,
  OPPORTUNITY_FEATURES,
  type Reveal,
} from './opportunity';

describe('feature mapping', () => {
  it('maps the five calculators onto three disjoint features', () => {
    expect(featureForCalculator('worth')).toBe('membership');
    expect(featureForCalculator('vault-revenue-planner')).toBe('membership');
    expect(featureForCalculator('live-experience-calculator')).toBe('live');
    expect(featureForCalculator('executive-producer-session')).toBe('live');
    expect(featureForCalculator('share-to-earn-planner')).toBe('referral');
    expect(featureForCalculator('movement-page-blueprint')).toBeNull();
    expect(OPPORTUNITY_FEATURES).toEqual(['membership', 'live', 'referral']);
  });
});

describe('computeRemaining never goes negative', () => {
  it('is revealed minus captured, floored at zero', () => {
    expect(computeRemaining(10000, 4000)).toBe(6000);
    expect(computeRemaining(10000, 10000)).toBe(0);
    // Beating the estimate does not create a negative "you owe the calculator" figure.
    expect(computeRemaining(10000, 15000)).toBe(0);
  });
});

describe('revealedByFeature dedups by feature with MAX (prevents double counting)', () => {
  const reveals: Reveal[] = [
    { calculator: 'worth', monthlyCents: 300_000, revealedAt: '2026-07-01T00:00:00Z' },
    { calculator: 'vault-revenue-planner', monthlyCents: 120_000, revealedAt: '2026-07-02T00:00:00Z' },
    { calculator: 'live-experience-calculator', monthlyCents: 50_000, revealedAt: '2026-07-03T00:00:00Z' },
  ];

  it('collapses two membership calculators to ONE feature reveal at the max, never their sum', () => {
    const out = revealedByFeature(reveals);
    const membership = out.find((r) => r.feature === 'membership');
    expect(membership?.revealedCents).toBe(300_000); // max(300k,120k), NOT 420k
    expect(membership?.calculator).toBe('worth'); // the winning calculator
    expect(out).toHaveLength(2); // membership + live, no duplicate membership row
  });

  it('ignores unmapped calculators and zero/absent reveals', () => {
    const out = revealedByFeature([
      { calculator: 'movement-page-blueprint', monthlyCents: 999_999, revealedAt: '2026-07-01T00:00:00Z' },
      { calculator: 'worth', monthlyCents: 0, revealedAt: '2026-07-01T00:00:00Z' },
    ]);
    expect(out).toEqual([]);
  });
});

describe('capturedFromEarnings nets refunds back onto the right feature', () => {
  it('sums subscription -> membership and ticket/tip -> live', () => {
    const { captured } = capturedFromEarnings([
      { type: 'subscription', net_amount: 5000, stripe_payment_id: 'pi_1' },
      { type: 'live_ticket', net_amount: 1500, stripe_payment_id: 'pi_2' },
      { type: 'live_tip', net_amount: 500, stripe_payment_id: 'pi_3' },
      { type: 'purchase', net_amount: 9999, stripe_payment_id: 'pi_4' }, // not a tracked feature
    ]);
    expect(captured.membership).toBe(5000);
    expect(captured.live).toBe(2000);
    expect(captured.referral).toBe(0); // referral never comes from earnings
  });

  it('subtracts a refund from the feature of its ORIGINAL payment (in-batch)', () => {
    const { captured, unresolvedRefunds } = capturedFromEarnings([
      { type: 'subscription', net_amount: 5000, stripe_payment_id: 'pi_1' },
      { type: 'refund', net_amount: -5000, stripe_payment_id: 'pi_1_refund' },
    ]);
    expect(captured.membership).toBe(0); // 5000 - 5000, not stranded in a refund bucket
    expect(unresolvedRefunds).toEqual([]);
  });

  it('reports a refund whose original is not in the batch as unresolved (needs a lookup)', () => {
    const { captured, unresolvedRefunds } = capturedFromEarnings([
      { type: 'live_ticket', net_amount: 1500, stripe_payment_id: 'pi_2' },
      { type: 'refund', net_amount: -1500, stripe_payment_id: 'pi_OLD_refund' },
    ]);
    expect(captured.live).toBe(1500); // the refund is not applied until resolved
    expect(unresolvedRefunds).toEqual([{ base: 'pi_OLD', amount: -1500 }]);
  });
});

describe('buildOpportunityRow + totalsOf', () => {
  it('derives remaining and stamps the CAPTURE period, and captured implies activated', () => {
    const row = buildOpportunityRow(
      { feature: 'membership', calculator: 'worth', revealedCents: 10000, revealedAt: '2026-06-01T00:00:00Z' },
      4000,
      false, // not flagged activated...
      { year: 2026, month: 7 },
    );
    expect(row.remainingCents).toBe(6000);
    expect(row.periodYear).toBe(2026);
    expect(row.periodMonth).toBe(7);
    expect(row.activated).toBe(true); // ...but captured money means it IS in play
  });

  it('totals sum per-feature remaining (disjoint, never negative)', () => {
    const rows = [
      buildOpportunityRow({ feature: 'membership', calculator: 'worth', revealedCents: 10000, revealedAt: 'x' }, 4000, true, { year: 2026, month: 7 }),
      buildOpportunityRow({ feature: 'live', calculator: 'live-experience-calculator', revealedCents: 5000, revealedAt: 'x' }, 6000, true, { year: 2026, month: 7 }),
    ];
    const t = totalsOf(rows);
    expect(t.revealedCents).toBe(15000);
    expect(t.capturedCents).toBe(10000);
    expect(t.remainingCents).toBe(6000); // 6000 + 0 (live captured beat its reveal), never -1000
    expect(t.activatedCount).toBe(2);
  });
});
