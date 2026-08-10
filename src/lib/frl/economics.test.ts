import { describe, expect, it } from 'vitest';
import {
  cohortAggregates,
  computeEngagementEconomics,
  hasActivePaidPlan,
  windowFromDate,
  type EarningRow,
  type EngagementEconomicsInput,
} from './economics';
import { assembleFrlChecklist, FRL_CHECKLIST, FRL_MANUAL_KEYS } from './checklist';

const NOW = '2026-08-06T12:00:00.000Z';

function earning(overrides: Partial<EarningRow>): EarningRow {
  return {
    type: 'subscription',
    grossCents: 1000,
    feeCents: 120,
    netCents: 880,
    occurredAt: '2026-07-10T10:00:00.000Z',
    ...overrides,
  };
}

function baseInput(overrides: Partial<EngagementEconomicsInput> = {}): EngagementEconomicsInput {
  return {
    startedOn: '2026-07-01',
    guaranteeEligibleOn: null,
    feeAgreedCents: 50000,
    feeCollectedCents: 50000,
    acquisitionCostCents: 10000,
    platformTier: 'pro',
    platformSubscriptionStatus: 'active',
    planMonthlyCents: 4900,
    earnings: [],
    work: [],
    assumptions: { founderHourlyCents: null },
    firstPaidAt: null,
    paidMemberCount: null,
    guaranteeAchieved: null,
    nowIso: NOW,
    ...overrides,
  };
}

describe('windowFromDate', () => {
  it('builds a UTC half-open window from a date', () => {
    const w = windowFromDate('2026-07-01', 30, NOW);
    expect(w?.startIso).toBe('2026-07-01T00:00:00.000Z');
    expect(w?.endIso).toBe('2026-07-31T00:00:00.000Z');
    expect(w?.elapsed).toBe(true);
  });

  it('returns null for a missing anchor rather than inventing a window', () => {
    expect(windowFromDate(null, 30, NOW)).toBeNull();
    expect(windowFromDate('not-a-date', 30, NOW)).toBeNull();
  });

  it('reports a still-open window as not elapsed', () => {
    const w = windowFromDate('2026-08-01', 30, NOW);
    expect(w?.elapsed).toBe(false);
  });
});

describe('window sums', () => {
  it('includes only rows inside the 30-day window, boundaries half-open', () => {
    const econ = computeEngagementEconomics(baseInput({
      earnings: [
        earning({ occurredAt: '2026-07-01T00:00:00.000Z', grossCents: 100, feeCents: 12 }),  // first instant: in
        earning({ occurredAt: '2026-07-30T23:59:59.000Z', grossCents: 200, feeCents: 24 }),  // last day: in
        earning({ occurredAt: '2026-07-31T00:00:00.000Z', grossCents: 400, feeCents: 48 }),  // end boundary: out
        earning({ occurredAt: '2026-06-30T23:59:59.000Z', grossCents: 800, feeCents: 96 }),  // before start: out
      ],
    }));
    expect(econ.artist.gmv30.cents).toBe(300);
    expect(econ.crwn.platformFees30.cents).toBe(36);
    expect(econ.artist.gmvLifetime.cents).toBe(1500);
  });

  it('computes the 7-day window separately', () => {
    const econ = computeEngagementEconomics(baseInput({
      earnings: [
        earning({ occurredAt: '2026-07-03T00:00:00.000Z', grossCents: 500, feeCents: 60 }),
        earning({ occurredAt: '2026-07-20T00:00:00.000Z', grossCents: 900, feeCents: 108 }),
      ],
    }));
    expect(econ.artist.gmv7.cents).toBe(500);
    expect(econ.artist.gmv30.cents).toBe(1400);
  });

  it('refund rows are negative and net out inside the ledger sum, never subtracted twice', () => {
    const econ = computeEngagementEconomics(baseInput({
      earnings: [
        earning({ occurredAt: '2026-07-05T00:00:00.000Z', grossCents: 1000, feeCents: 120, netCents: 880 }),
        earning({ type: 'refund', occurredAt: '2026-07-06T00:00:00.000Z', grossCents: -1000, feeCents: -120, netCents: -880 }),
      ],
    }));
    expect(econ.artist.gmv30.cents).toBe(0);
    expect(econ.crwn.platformFees30.cents).toBe(0);
    expect(econ.artist.net30.cents).toBe(0);
  });

  it('with no start date, windowed metrics are missing, not zero', () => {
    const econ = computeEngagementEconomics(baseInput({
      startedOn: null,
      earnings: [earning({})],
    }));
    expect(econ.artist.gmv30.cents).toBeNull();
    expect(econ.artist.gmv30.state).toBe('missing');
    expect(econ.artist.gmv30.missing).toContain('engagement start date');
    // Lifetime is still real: it needs no window.
    expect(econ.artist.gmvLifetime.cents).toBe(1000);
  });
});

describe('CRWN revenue separation', () => {
  it('keeps implementation, platform fees, and plan subscription as separate sources', () => {
    const econ = computeEngagementEconomics(baseInput({
      feeCollectedCents: 25000,
      earnings: [earning({ occurredAt: '2026-07-05T00:00:00.000Z', feeCents: 500 })],
    }));
    expect(econ.crwn.implementationCollected.cents).toBe(25000);
    expect(econ.crwn.platformFees30.cents).toBe(500);
    expect(econ.crwn.planSubscription30.cents).toBe(4900);
    expect(econ.crwn.planSubscription30.state).toBe('modeled');
    expect(econ.crwn.revenue30.cents).toBe(25000 + 500 + 4900);
    // The composite inherits the weakest state: modeled, because the plan line is modeled.
    expect(econ.crwn.revenue30.state).toBe('modeled');
  });

  it('never mixes artist GMV into CRWN revenue', () => {
    const econ = computeEngagementEconomics(baseInput({
      feeCollectedCents: 0,
      platformTier: 'starter',
      platformSubscriptionStatus: null,
      earnings: [earning({ occurredAt: '2026-07-05T00:00:00.000Z', grossCents: 100000, feeCents: 12000 })],
    }));
    expect(econ.crwn.revenue30.cents).toBe(12000); // fee only, never the 100000 gross
  });

  it('a free plan contributes a verified zero, not a missing value', () => {
    const econ = computeEngagementEconomics(baseInput({
      platformTier: 'starter', platformSubscriptionStatus: null,
    }));
    expect(econ.crwn.planSubscription30.cents).toBe(0);
    expect(econ.crwn.planSubscription30.state).toBe('complete');
  });

  it('unrecorded implementation fee makes total revenue missing, not zero', () => {
    const econ = computeEngagementEconomics(baseInput({ feeCollectedCents: null }));
    expect(econ.crwn.implementationCollected.cents).toBeNull();
    expect(econ.crwn.revenue30.cents).toBeNull();
    expect(econ.crwn.revenue30.missing.join(' ')).toContain('implementation fee collected');
  });

  it('a real $0 implementation fee (founding cohort) is a complete zero', () => {
    const econ = computeEngagementEconomics(baseInput({ feeCollectedCents: 0 }));
    expect(econ.crwn.implementationCollected.cents).toBe(0);
    expect(econ.crwn.implementationCollected.state).toBe('complete');
  });

  it('7-day CRWN revenue excludes the modeled plan line', () => {
    const econ = computeEngagementEconomics(baseInput({
      feeCollectedCents: 0,
      earnings: [earning({ occurredAt: '2026-07-02T00:00:00.000Z', feeCents: 700 })],
    }));
    expect(econ.crwn.revenue7.cents).toBe(700);
  });
});

describe('labor and cost', () => {
  it('labor cost is missing when minutes exist but no hourly assumption is set', () => {
    const econ = computeEngagementEconomics(baseInput({
      work: [{ category: 'migration', workOn: '2026-07-03', minutes: 120, externalCostCents: null }],
      assumptions: { founderHourlyCents: null },
    }));
    expect(econ.costs.recordedLabor30.cents).toBeNull();
    expect(econ.costs.recordedLabor30.state).toBe('missing');
    expect(econ.costs.recordedLabor30.missing.join(' ')).toContain('hourly cost assumption');
    expect(econ.costs.laborMinutes30).toBe(120);
  });

  it('labor cost = minutes x hourly, rounded to integer cents', () => {
    const econ = computeEngagementEconomics(baseInput({
      work: [
        { category: 'audit', workOn: '2026-07-03', minutes: 90, externalCostCents: null },
        { category: 'migration', workOn: '2026-07-04', minutes: 30, externalCostCents: null },
      ],
      assumptions: { founderHourlyCents: 10000 }, // $100/hr
    }));
    expect(econ.costs.recordedLabor30.cents).toBe(20000); // 2 hours
  });

  it('work outside the 30-day window counts lifetime but not windowed', () => {
    const econ = computeEngagementEconomics(baseInput({
      work: [
        { category: 'audit', workOn: '2026-07-03', minutes: 60, externalCostCents: null },
        { category: 'case_study', workOn: '2026-08-05', minutes: 60, externalCostCents: null }, // day 35
      ],
      assumptions: { founderHourlyCents: 6000 },
    }));
    expect(econ.costs.recordedLabor30.cents).toBe(6000);
    expect(econ.costs.recordedLaborLifetime.cents).toBe(12000);
  });

  it('zero work entries is a complete zero labeled as such (recorded labor)', () => {
    const econ = computeEngagementEconomics(baseInput({ assumptions: { founderHourlyCents: 10000 } }));
    expect(econ.costs.recordedLabor30.cents).toBe(0);
    expect(econ.costs.recordedLabor30.note).toContain('no work entries');
  });

  it('external costs sum from entries', () => {
    const econ = computeEngagementEconomics(baseInput({
      work: [
        { category: 'migration', workOn: '2026-07-03', minutes: 0, externalCostCents: 2500 },
        { category: 'page_setup', workOn: '2026-07-05', minutes: 0, externalCostCents: 1500 },
      ],
    }));
    expect(econ.costs.externalCosts30.cents).toBe(4000);
  });

  it('unknown acquisition cost is missing, never zero, and propagates to direct cost', () => {
    const econ = computeEngagementEconomics(baseInput({ acquisitionCostCents: null }));
    expect(econ.costs.acquisition.cents).toBeNull();
    expect(econ.costs.directCost30.cents).toBeNull();
    expect(econ.costs.directCost30.missing.join(' ')).toContain('acquisition cost');
  });
});

describe('contribution margin', () => {
  const fullInput = () => baseInput({
    feeCollectedCents: 50000,
    acquisitionCostCents: 10000,
    earnings: [earning({ occurredAt: '2026-07-05T00:00:00.000Z', feeCents: 2000 })],
    work: [{ category: 'launch_support', workOn: '2026-07-06', minutes: 300, externalCostCents: 1000 }],
    assumptions: { founderHourlyCents: 6000 }, // 5h x $60 = $300 = 30000c
  });

  it('computes 30-day contribution margin when all inputs exist', () => {
    const econ = computeEngagementEconomics(fullInput());
    // revenue30 = 50000 + 2000 + 4900 = 56900; cost30 = 30000 + 1000 + 10000 = 41000
    expect(econ.margin.contribution30.cents).toBe(15900);
    expect(econ.margin.contributionPct30).toBe(Math.round((15900 / 56900) * 100));
  });

  it('margin is missing (with named inputs) when any side is unknown', () => {
    const econ = computeEngagementEconomics({ ...fullInput(), acquisitionCostCents: null });
    expect(econ.margin.contribution30.cents).toBeNull();
    expect(econ.margin.contribution30.missing.join(' ')).toContain('acquisition cost');
  });

  it('revenue per fulfillment hour uses lifetime revenue over lifetime hours', () => {
    const econ = computeEngagementEconomics(fullInput());
    expect(econ.margin.revenuePerFulfillmentHourCents).toBe(
      Math.round((econ.crwn.revenueLifetime.cents as number) / 5),
    );
  });
});

describe('CAC payback', () => {
  it('unknown acquisition cost -> unknown status, null days', () => {
    const econ = computeEngagementEconomics(baseInput({ acquisitionCostCents: null }));
    expect(econ.margin.cacPaybackStatus).toBe('unknown');
    expect(econ.margin.cacPaybackDays).toBeNull();
  });

  it('implementation fee alone covering CAC pays back at day 0', () => {
    const econ = computeEngagementEconomics(baseInput({
      feeCollectedCents: 50000, acquisitionCostCents: 20000,
    }));
    expect(econ.margin.cacPaybackStatus).toBe('paid_back');
    expect(econ.margin.cacPaybackDays).toBe(0);
  });

  it('platform fees accumulate day by day until CAC is covered', () => {
    const econ = computeEngagementEconomics(baseInput({
      feeCollectedCents: 0,
      acquisitionCostCents: 300,
      earnings: [
        earning({ occurredAt: '2026-07-03T00:00:00.000Z', feeCents: 100 }),
        earning({ occurredAt: '2026-07-08T00:00:00.000Z', feeCents: 100 }),
        earning({ occurredAt: '2026-07-15T00:00:00.000Z', feeCents: 100 }),
      ],
    }));
    expect(econ.margin.cacPaybackStatus).toBe('paid_back');
    expect(econ.margin.cacPaybackDays).toBe(14); // 2026-07-15 is day 14 from 2026-07-01
  });

  it('not yet paid back when cumulative revenue stays below CAC', () => {
    const econ = computeEngagementEconomics(baseInput({
      feeCollectedCents: 0,
      acquisitionCostCents: 1_000_000,
      earnings: [earning({ occurredAt: '2026-07-03T00:00:00.000Z', feeCents: 100 })],
    }));
    expect(econ.margin.cacPaybackStatus).toBe('not_yet');
  });
});

describe('first paid member timing', () => {
  it('days from engagement start to first paid conversion', () => {
    const econ = computeEngagementEconomics(baseInput({
      firstPaidAt: '2026-07-09T15:00:00.000Z',
    }));
    expect(econ.artist.daysToFirstPaid).toBe(8);
  });

  it('no first paid conversion -> null, never 0', () => {
    const econ = computeEngagementEconomics(baseInput({ firstPaidAt: null }));
    expect(econ.artist.daysToFirstPaid).toBeNull();
  });

  it('a conversion that predates the engagement is not counted as day 0', () => {
    const econ = computeEngagementEconomics(baseInput({
      firstPaidAt: '2026-06-15T00:00:00.000Z',
    }));
    expect(econ.artist.daysToFirstPaid).toBeNull();
  });
});

describe('guarantee windows stay separate from the service window', () => {
  it('guarantee deadline derives from eligibility date, not engagement start', () => {
    const econ = computeEngagementEconomics(baseInput({
      startedOn: '2026-07-01',
      guaranteeEligibleOn: '2026-07-10',
    }));
    expect(econ.serviceWindow30?.startIso).toBe('2026-07-01T00:00:00.000Z');
    expect(econ.guaranteeWindow?.startIso).toBe('2026-07-10T00:00:00.000Z');
    expect(econ.guaranteeDeadlineOn).toBe('2026-08-09');
  });

  it('no eligibility date -> no guarantee window, no invented deadline', () => {
    const econ = computeEngagementEconomics(baseInput({ guaranteeEligibleOn: null }));
    expect(econ.guaranteeWindow).toBeNull();
    expect(econ.guaranteeDeadlineOn).toBeNull();
  });
});

describe('money model diagnostic', () => {
  it('answers can-fund-one/two from contribution vs replication cost', () => {
    const econ = computeEngagementEconomics(baseInput({
      feeCollectedCents: 50000,
      acquisitionCostCents: 5000,
      earnings: [earning({ occurredAt: '2026-07-05T00:00:00.000Z', feeCents: 2000 })],
      work: [{ category: 'migration', workOn: '2026-07-03', minutes: 60, externalCostCents: 0 }],
      assumptions: { founderHourlyCents: 6000 },
    }));
    // contribution30 = (50000+2000+4900) - (6000+0+5000) = 45900
    // replication = 5000 + 6000 + 0 = 11000
    expect(econ.diagnostic.replicationCostCents).toBe(11000);
    expect(econ.diagnostic.canFundOneMore).toBe(true);
    expect(econ.diagnostic.canFundTwoMore).toBe(true);
  });

  it('zero recorded cost cannot prove replication capacity', () => {
    const econ = computeEngagementEconomics(baseInput({
      feeCollectedCents: 50000,
      acquisitionCostCents: 0,
      work: [],
      assumptions: { founderHourlyCents: 6000 },
    }));
    expect(econ.diagnostic.canFundOneMore).toBeNull();
    expect(econ.diagnostic.missingInputs.join(' ')).toContain('non-zero');
  });

  it('names missing inputs instead of guessing', () => {
    const econ = computeEngagementEconomics(baseInput({
      acquisitionCostCents: null,
      feeCollectedCents: null,
    }));
    expect(econ.diagnostic.canFundOneMore).toBeNull();
    const missing = econ.diagnostic.missingInputs.join(' ');
    expect(missing).toContain('acquisition cost');
    expect(missing).toContain('implementation fee collected');
  });

  it('identifies the top revenue and cost sources', () => {
    const econ = computeEngagementEconomics(baseInput({
      feeCollectedCents: 50000,
      acquisitionCostCents: 20000,
      earnings: [earning({ occurredAt: '2026-07-05T00:00:00.000Z', feeCents: 2000 })],
      work: [{ category: 'migration', workOn: '2026-07-03', minutes: 60, externalCostCents: 500 }],
      assumptions: { founderHourlyCents: 6000 },
    }));
    expect(econ.diagnostic.topRevenueSource?.key).toBe('implementation');
    expect(econ.diagnostic.topCostSource?.key).toBe('acquisition');
  });
});

describe('hasActivePaidPlan', () => {
  it('starter or missing tier is never a paid plan', () => {
    expect(hasActivePaidPlan('starter', 'active')).toBe(false);
    expect(hasActivePaidPlan(null, 'active')).toBe(false);
  });
  it('pro/scale with live statuses count', () => {
    expect(hasActivePaidPlan('pro', 'active')).toBe(true);
    expect(hasActivePaidPlan('scale', 'trialing')).toBe(true);
    expect(hasActivePaidPlan('pro', null)).toBe(false);
    expect(hasActivePaidPlan('pro', 'canceled')).toBe(false);
  });
});

describe('cohort aggregates', () => {
  it('excludes nulls and reports per-metric sample size', () => {
    const agg = cohortAggregates([
      { daysToFirstPaid: 5, laborMinutes: 600, implementationCollectedCents: 50000, contribution30Cents: 10000, guaranteeStatus: 'achieved', onPaidPlan: true, inputsComplete: true },
      { daysToFirstPaid: 15, laborMinutes: null, implementationCollectedCents: 0, contribution30Cents: null, guaranteeStatus: 'eligible', onPaidPlan: true, inputsComplete: false },
      { daysToFirstPaid: null, laborMinutes: 1200, implementationCollectedCents: null, contribution30Cents: null, guaranteeStatus: null, onPaidPlan: null, inputsComplete: false },
    ]);
    expect(agg.cohortSize).toBe(3);
    expect(agg.daysToFirstPaid.median).toBe(10);
    expect(agg.daysToFirstPaid.sampleSize).toBe(2);
    expect(agg.laborMinutes.mean).toBe(900);
    expect(agg.laborMinutes.sampleSize).toBe(2);
    expect(agg.implementationCollectedCents.median).toBe(25000);
    expect(agg.contribution30Cents.sampleSize).toBe(1);
    expect(agg.guaranteeAchievedRate).toEqual({ achieved: 1, known: 2 });
    expect(agg.paidPlanRate).toEqual({ onPaid: 2, known: 2 });
    expect(agg.completeInputsCount).toBe(1);
  });

  it('an empty or all-null cohort yields null stats, not zeros', () => {
    const agg = cohortAggregates([
      { daysToFirstPaid: null, laborMinutes: null, implementationCollectedCents: null, contribution30Cents: null, guaranteeStatus: null, onPaidPlan: null, inputsComplete: false },
    ]);
    expect(agg.daysToFirstPaid.mean).toBeNull();
    expect(agg.daysToFirstPaid.median).toBeNull();
    expect(agg.daysToFirstPaid.sampleSize).toBe(0);
  });
});

describe('operator checklist assembly', () => {
  it('has exactly 20 items with unique keys', () => {
    expect(FRL_CHECKLIST).toHaveLength(20);
    expect(new Set(FRL_CHECKLIST.map((i) => i.key)).size).toBe(20);
  });

  it('derived items report verified / not_met / not_verifiable, never stored state', () => {
    const items = assembleFrlChecklist(
      {
        stripe_connected: { done: true, current: 1, target: 1 },
        paid_tier_purchasable: { done: false, current: 0, target: 1 },
        // contacts_imported deliberately absent -> evaluation failed
      },
      {
        // A manual write against a derived key must be ignored.
        stripe_connected: { status: 'not_applicable', completedOn: '2026-07-01', note: 'x', minutesSpent: 5 },
      } as never,
    );
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.stripe_connected.status).toBe('verified');
    expect(byKey.stripe_connected.note).toBeNull();
    expect(byKey.paid_tier_purchasable.status).toBe('not_met');
    expect(byKey.contacts_imported.status).toBe('not_verifiable');
  });

  it('manual items surface stored state and default to pending', () => {
    const items = assembleFrlChecklist({}, {
      revenue_audit: { status: 'done', completedOn: '2026-07-02', note: 'audit call ran', minutesSpent: 45 },
    });
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.revenue_audit.status).toBe('done');
    expect(byKey.revenue_audit.minutesSpent).toBe(45);
    expect(byKey.source_exports.status).toBe('pending');
  });

  it('the manual-key allowlist excludes every derived key', () => {
    for (const def of FRL_CHECKLIST) {
      expect(FRL_MANUAL_KEYS.has(def.key)).toBe(def.kind === 'manual');
    }
  });
});
