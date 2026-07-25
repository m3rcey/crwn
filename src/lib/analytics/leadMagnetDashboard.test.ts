// Tests for the lead-magnet dashboard aggregation.
//
// These are the numbers an admin makes decisions on, so a wrong rate or a noise row topping a
// ranking is a real (silent) failure. Locked here: the funnel metric counts, the two rates
// (activation, builder completion), the min-views floor on conversion rankings, and the top-
// calculator ordering.

import { describe, expect, it } from 'vitest';

import {
  computeMetrics,
  conversionByDimension,
  calculatorPerformance,
  topOf,
  type FunnelRow,
} from './leadMagnetDashboard';

const row = (stage: string, extra: Partial<FunnelRow> = {}): FunnelRow => ({
  stage,
  calculator: null,
  campaign: null,
  referrer: null,
  video: null,
  ...extra,
});

describe('computeMetrics', () => {
  it('counts each stage and derives the two rates', () => {
    const rows = [
      ...Array(100).fill(0).map(() => row('page_viewed')),
      ...Array(40).fill(0).map(() => row('calculator_completed')),
      ...Array(20).fill(0).map(() => row('email_submitted')),
      ...Array(10).fill(0).map(() => row('account_created')),
      ...Array(8).fill(0).map(() => row('builder_opened')),
      ...Array(6).fill(0).map(() => row('builder_published')),
      ...Array(3).fill(0).map(() => row('mission_completed')),
    ];
    const m = computeMetrics(rows);
    expect(m.views).toBe(100);
    expect(m.completions).toBe(40);
    expect(m.emails).toBe(20);
    expect(m.accounts).toBe(10);
    expect(m.activationRate).toBeCloseTo(10 / 40); // accounts / completions
    expect(m.builderCompletion).toBeCloseTo(6 / 8); // published / opened
  });

  it('never divides by zero', () => {
    const m = computeMetrics([]);
    expect(m.activationRate).toBe(0);
    expect(m.builderCompletion).toBe(0);
  });
});

describe('conversionByDimension respects the min-views floor and sorts by rate', () => {
  const rows: FunnelRow[] = [
    // source A: 100 views, 30 completions -> 30%
    ...Array(100).fill(0).map(() => row('page_viewed', { referrer: 'A' })),
    ...Array(30).fill(0).map(() => row('calculator_completed', { referrer: 'A' })),
    // source B: 10 views, 8 completions -> 80% (real, above floor)
    ...Array(10).fill(0).map(() => row('page_viewed', { referrer: 'B' })),
    ...Array(8).fill(0).map(() => row('calculator_completed', { referrer: 'B' })),
    // source C: 1 view, 1 completion -> 100% but NOISE (below floor of 5)
    row('page_viewed', { referrer: 'C' }),
    row('calculator_completed', { referrer: 'C' }),
  ];

  it('drops sub-floor keys and ranks the rest by rate', () => {
    const ranked = conversionByDimension(rows, 'referrer', { minViews: 5 });
    expect(ranked.map((r) => r.key)).toEqual(['B', 'A']); // C dropped, B (80%) over A (30%)
    expect(topOf(ranked)?.key).toBe('B');
    expect(topOf(ranked)?.rate).toBeCloseTo(0.8);
  });

  it('groups untagged rows under "unknown"', () => {
    const ranked = conversionByDimension(
      [row('page_viewed'), row('page_viewed'), row('calculator_completed')],
      'video',
      { minViews: 1 },
    );
    expect(ranked[0].key).toBe('unknown');
  });
});

describe('calculatorPerformance ranks by completions', () => {
  it('aggregates per calculator and sorts, so the top row is the top performer', () => {
    const rows: FunnelRow[] = [
      ...Array(50).fill(0).map(() => row('page_viewed', { calculator: 'worth' })),
      ...Array(20).fill(0).map(() => row('calculator_completed', { calculator: 'worth' })),
      ...Array(5).fill(0).map(() => row('account_created', { calculator: 'worth' })),
      ...Array(30).fill(0).map(() => row('page_viewed', { calculator: 'vault-revenue-planner' })),
      ...Array(25).fill(0).map(() => row('calculator_completed', { calculator: 'vault-revenue-planner' })),
    ];
    const perf = calculatorPerformance(rows);
    expect(perf[0].calculator).toBe('vault-revenue-planner'); // 25 completions > 20
    expect(perf[0].completions).toBe(25);
    const worth = perf.find((p) => p.calculator === 'worth');
    expect(worth).toMatchObject({ views: 50, completions: 20, accounts: 5 });
  });
});
