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
  campaignScorecard,
  biggestDropOf,
  dimensionKey,
  topOf,
  SCORECARD_STAGES,
  type FunnelRow,
  type ScorecardStage,
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

// ---------------------------------------------------------------------------
// Campaign scorecard: the report the founder publishes videos against.
// ---------------------------------------------------------------------------

describe('dimensionKey', () => {
  it('reads the column dimensions off the row', () => {
    expect(dimensionKey(row('page_viewed', { campaign: 'c1' }), 'campaign')).toBe('c1');
    expect(dimensionKey(row('page_viewed', { video: 'v1' }), 'video')).toBe('v1');
  });

  it('reads the tag dimensions out of metadata', () => {
    const r = row('page_viewed', { metadata: { angle: 'streaming_loss', platform: 'instagram' } });
    expect(dimensionKey(r, 'angle')).toBe('streaming_loss');
    expect(dimensionKey(r, 'platform')).toBe('instagram');
  });

  it('groups untagged and malformed rows under "unknown" rather than inventing a key', () => {
    expect(dimensionKey(row('page_viewed'), 'campaign')).toBe('unknown');
    expect(dimensionKey(row('page_viewed'), 'angle')).toBe('unknown');
    expect(dimensionKey(row('page_viewed', { metadata: { angle: 42 } }), 'angle')).toBe('unknown');
    expect(dimensionKey(row('page_viewed', { metadata: null }), 'angle')).toBe('unknown');
  });
});

describe('biggestDropOf', () => {
  it('names the transition that loses the most people', () => {
    const stages = {
      page_viewed: 1000,
      calculator_started: 900,
      calculator_completed: 200,
      email_submitted: 150,
      account_created: 100,
      setup_completed: 90,
      stripe_connected: 40,
      fans_imported: 30,
      first_paid_conversion: 10,
    } as Record<ScorecardStage, number>;
    const drop = biggestDropOf(stages);
    expect(drop).toMatchObject({ from: 'calculator_started', to: 'calculator_completed', lost: 700 });
    expect(drop!.lossRate).toBeCloseTo(700 / 900);
  });

  it('is null when nothing ever entered the funnel', () => {
    const empty = Object.fromEntries(SCORECARD_STAGES.map((s) => [s, 0])) as Record<ScorecardStage, number>;
    expect(biggestDropOf(empty)).toBeNull();
  });
});

describe('campaignScorecard', () => {
  const rows: FunnelRow[] = [
    // kcamp_v1: a lot of noise, one paying artist.
    ...Array(100).fill(0).map(() => row('page_viewed', { campaign: 'kcamp', video: 'kcamp_v1' })),
    ...Array(40).fill(0).map(() => row('calculator_completed', { campaign: 'kcamp', video: 'kcamp_v1' })),
    row('email_submitted', { campaign: 'kcamp', video: 'kcamp_v1', metadata: { band: 'sales_priority' } }),
    row('email_submitted', { campaign: 'kcamp', video: 'kcamp_v1', metadata: { band: 'nurture' } }),
    row('account_created', { campaign: 'kcamp', video: 'kcamp_v1', metadata: { subAvatar: 'rnb_empire_builder' } }),
    row('setup_completed', { campaign: 'kcamp', video: 'kcamp_v1' }),
    row('stripe_connected', { campaign: 'kcamp', video: 'kcamp_v1' }),
    row('first_paid_conversion', { campaign: 'kcamp', video: 'kcamp_v1' }),
    // vault_v3: more completions, no artist ever got paid.
    ...Array(80).fill(0).map(() => row('page_viewed', { campaign: 'vault', video: 'vault_v3' })),
    ...Array(60).fill(0).map(() => row('calculator_completed', { campaign: 'vault', video: 'vault_v3' })),
    row('call_requested', { campaign: 'vault', video: 'vault_v3' }),
  ];

  it('ranks by artists who got PAID, not by views or completions', () => {
    const sc = campaignScorecard(rows, 'video');
    expect(sc[0].key).toBe('kcamp_v1');
    expect(sc[0].stages.first_paid_conversion).toBe(1);
    expect(sc[1].key).toBe('vault_v3');
    expect(sc[1].stages.calculator_completed).toBe(60); // more completions, still second
  });

  it('separates lead VOLUME from ICP quality using the server-scored band', () => {
    const kcamp = campaignScorecard(rows, 'video')[0];
    expect(kcamp.stages.email_submitted).toBe(2);
    expect(kcamp.salesPriority).toBe(1);
  });

  it('counts hand-raisers and reports the sub-avatar the content actually pulled', () => {
    const sc = campaignScorecard(rows, 'video');
    expect(sc.find((r) => r.key === 'vault_v3')!.callsRequested).toBe(1);
    expect(sc[0].topSubAvatar).toBe('rnb_empire_builder');
  });

  it('walks the whole spine, not just the top of the funnel', () => {
    const kcamp = campaignScorecard(rows, 'video')[0];
    expect(kcamp.stages.setup_completed).toBe(1);
    expect(kcamp.stages.stripe_connected).toBe(1);
    expect(kcamp.paidRate).toBe(1); // 1 paid / 1 account
    expect(kcamp.completionRate).toBeCloseTo(0.4);
  });

  it('names the biggest drop per row', () => {
    const kcamp = campaignScorecard(rows, 'video')[0];
    expect(kcamp.biggestDrop).toMatchObject({ from: 'page_viewed', to: 'calculator_started', lost: 100 });
  });

  it('groups every untagged row under one "unknown" bucket instead of dropping it', () => {
    const sc = campaignScorecard([row('page_viewed'), row('calculator_completed')], 'campaign');
    expect(sc).toHaveLength(1);
    expect(sc[0].key).toBe('unknown');
    expect(sc[0].stages.page_viewed).toBe(1);
  });

  it('ignores stages outside the spine rather than miscounting them', () => {
    const sc = campaignScorecard([row('assumptions_changed', { campaign: 'c1' })], 'campaign');
    expect(Object.values(sc[0].stages).every((n) => n === 0)).toBe(true);
  });

  it('returns nothing for no rows', () => {
    expect(campaignScorecard([], 'campaign')).toEqual([]);
  });
});
