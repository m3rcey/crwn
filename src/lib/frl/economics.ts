// First Revenue Launch economics: the ONE deterministic financial-calculation
// layer for the Money Model measurement system (2026-08-06).
//
// Every formula for per-engagement CRWN revenue, direct cost, and contribution
// margin lives HERE, pure and tested. Routes fetch rows and call in; components
// render what comes out. No formula may be restated in a component or route.
//
// Honesty rules (house constitution, FEEDBACK_LOOPS + doc 20):
//  - Money is INTEGER CENTS. Every metric is a MoneyMetric that carries its own
//    completeness state; a missing input is NAMED, never substituted with zero.
//  - `null` means unknown. 0 means a verified zero.
//  - Revenue sources are never double-counted: artist GMV (earnings.gross) and
//    CRWN platform-fee revenue (earnings.platform_fee) are different slices of
//    the same rows and are never summed together; implementation fees live only
//    on the engagement row; platform-plan subscription revenue is MODELED
//    (there is no invoice table) and always labeled as modeled.
//  - Refunds/disputes are already negative rows in `earnings`; sums over the
//    ledger are therefore refund-netted BY the ledger. Nothing here subtracts
//    refunds a second time.
//
// Time windows (explicit, UTC):
//  - The SERVICE window is 30 days from the engagement's `started_on` date
//    (doc 20's 30-Day First Revenue Sprint runs from engagement start).
//    Window = [started_on 00:00 UTC, started_on + N days 00:00 UTC).
//  - The GUARANTEE window is 30 days from `guarantee_eligible_on` (all required
//    conditions met). It is a DIFFERENT clock and is never conflated with the
//    service/profitability window.

export type MetricState = 'complete' | 'modeled' | 'missing';

export interface MoneyMetric {
  /** Integer cents, or null when the metric cannot be computed. */
  cents: number | null;
  state: MetricState;
  /** Named inputs that are missing when state === 'missing'. */
  missing: string[];
  /** How the number was produced, when it is not a plain ledger sum. */
  note?: string;
}

const complete = (cents: number, note?: string): MoneyMetric => ({
  cents, state: 'complete', missing: [], ...(note ? { note } : {}),
});
const modeled = (cents: number, note: string): MoneyMetric => ({
  cents, state: 'modeled', missing: [], note,
});
const missing = (inputs: string[], note?: string): MoneyMetric => ({
  cents: null, state: 'missing', missing: inputs, ...(note ? { note } : {}),
});

export interface EarningRow {
  type: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  /** ISO timestamp (earnings.created_at). */
  occurredAt: string;
}

export type FrlWorkCategory =
  | 'sales' | 'audit' | 'migration' | 'offer_design' | 'page_setup'
  | 'campaign_creation' | 'launch_support' | 'fulfillment_support'
  | 'general_support' | 'case_study';

export const FRL_WORK_CATEGORIES: FrlWorkCategory[] = [
  'sales', 'audit', 'migration', 'offer_design', 'page_setup',
  'campaign_creation', 'launch_support', 'fulfillment_support',
  'general_support', 'case_study',
];

export interface FrlWorkEntry {
  category: FrlWorkCategory;
  /** YYYY-MM-DD */
  workOn: string;
  minutes: number;
  externalCostCents: number | null;
}

export interface FrlCostAssumptions {
  /** From admin_settings.frl_cost_assumptions. null = the founder has not set
   *  one; labor cost is then reported missing, never defaulted. */
  founderHourlyCents: number | null;
}

export interface EngagementEconomicsInput {
  /** YYYY-MM-DD or null. Anchors the service window. */
  startedOn: string | null;
  guaranteeEligibleOn: string | null;
  /** null = not recorded. 0 = a real $0 (founding cohort allows it). */
  feeAgreedCents: number | null;
  feeCollectedCents: number | null;
  acquisitionCostCents: number | null;
  /** Current platform plan (artist_profiles). Used ONLY to model subscription
   *  revenue; there is no platform invoice table. */
  platformTier: string | null;
  platformSubscriptionStatus: string | null;
  /** Cents per month for the artist's paid plan (from TIER_PRICING, resolved by
   *  the caller so this module stays free of pricing imports in tests). */
  planMonthlyCents: number | null;
  earnings: EarningRow[];
  work: FrlWorkEntry[];
  assumptions: FrlCostAssumptions;
  /** ISO timestamp of the first paid conversion (funnel_events, fallback:
   *  earliest positive earning). null = has not happened / unknown. */
  firstPaidAt: string | null;
  /** Active paid-tier member count, or null when not fetched. */
  paidMemberCount: number | null;
  /** Guarantee outcome from the launch-partner checklist, or null pre-compute. */
  guaranteeAchieved: boolean | null;
  /** ISO timestamp for "now", injected for determinism. */
  nowIso: string;
}

export interface WindowBounds {
  startIso: string;
  endIso: string;
  /** True once the window has fully elapsed at `now`. */
  elapsed: boolean;
}

const DAY_MS = 86_400_000;

/** [anchor 00:00Z, anchor+days 00:00Z). Null when the anchor date is absent/invalid. */
export function windowFromDate(anchor: string | null, days: number, nowIso: string): WindowBounds | null {
  if (!anchor) return null;
  const start = Date.parse(`${anchor}T00:00:00Z`);
  if (!Number.isFinite(start)) return null;
  const end = start + days * DAY_MS;
  const now = Date.parse(nowIso);
  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
    elapsed: Number.isFinite(now) ? now >= end : false,
  };
}

function inWindow(iso: string, w: WindowBounds): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= Date.parse(w.startIso) && t < Date.parse(w.endIso);
}

function sumEarnings(rows: EarningRow[], w: WindowBounds | null, pick: (r: EarningRow) => number): number {
  const inRange = w ? rows.filter((r) => inWindow(r.occurredAt, w)) : rows;
  return inRange.reduce((acc, r) => acc + (Number.isFinite(pick(r)) ? pick(r) : 0), 0);
}

/** Paid plan = a non-starter tier with an active-ish subscription status. */
export function hasActivePaidPlan(tier: string | null, status: string | null): boolean {
  if (!tier || tier === 'starter') return false;
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

export interface EngagementEconomics {
  serviceWindow30: WindowBounds | null;
  guaranteeWindow: WindowBounds | null;
  /** Derived, never stored: guarantee_eligible_on + 30 days. */
  guaranteeDeadlineOn: string | null;
  artist: {
    gmv7: MoneyMetric;
    gmv30: MoneyMetric;
    gmvLifetime: MoneyMetric;
    net30: MoneyMetric;
    firstPaidAt: string | null;
    daysToFirstPaid: number | null;
    paidMemberCount: number | null;
  };
  crwn: {
    implementationCollected: MoneyMetric;
    platformFees7: MoneyMetric;
    platformFees30: MoneyMetric;
    platformFeesLifetime: MoneyMetric;
    planSubscription30: MoneyMetric;
    revenue7: MoneyMetric;
    revenue30: MoneyMetric;
    revenueLifetime: MoneyMetric;
  };
  costs: {
    recordedLabor30: MoneyMetric;
    recordedLaborLifetime: MoneyMetric;
    laborMinutesLifetime: number;
    laborMinutes30: number;
    externalCosts30: MoneyMetric;
    externalCostsLifetime: MoneyMetric;
    acquisition: MoneyMetric;
    directCost30: MoneyMetric;
    directCostLifetime: MoneyMetric;
  };
  margin: {
    contribution30: MoneyMetric;
    contributionPct30: number | null;
    contributionLifetime: MoneyMetric;
    revenuePerFulfillmentHourCents: number | null;
    cacPaybackStatus: 'paid_back' | 'not_yet' | 'unknown';
    cacPaybackDays: number | null;
  };
  diagnostic: MoneyModelDiagnostic;
}

export interface MoneyModelDiagnostic {
  /** What one artist like this one cost to acquire and serve, lifetime. */
  replicationCostCents: number | null;
  canFundOneMore: boolean | null;
  canFundTwoMore: boolean | null;
  missingInputs: string[];
  topRevenueSource: { key: string; label: string; cents: number } | null;
  topCostSource: { key: string; label: string; cents: number } | null;
}

function sumMetrics(parts: MoneyMetric[], note?: string): MoneyMetric {
  const allMissing = parts.flatMap((p) => p.missing);
  if (parts.some((p) => p.cents === null)) {
    return { cents: null, state: 'missing', missing: [...new Set(allMissing)], ...(note ? { note } : {}) };
  }
  const cents = parts.reduce((acc, p) => acc + (p.cents as number), 0);
  const state: MetricState = parts.some((p) => p.state === 'modeled') ? 'modeled' : 'complete';
  return { cents, state, missing: [], ...(note ? { note } : {}) };
}

function workInWindow(work: FrlWorkEntry[], w: WindowBounds | null): FrlWorkEntry[] {
  if (!w) return [];
  return work.filter((e) => {
    const t = Date.parse(`${e.workOn}T00:00:00Z`);
    return Number.isFinite(t) && t >= Date.parse(w.startIso) && t < Date.parse(w.endIso);
  });
}

function laborMetric(entries: FrlWorkEntry[], hourlyCents: number | null): MoneyMetric {
  const minutes = entries.reduce((acc, e) => acc + Math.max(0, e.minutes || 0), 0);
  if (minutes === 0) {
    return complete(0, 'no work entries recorded in this window');
  }
  if (hourlyCents === null) {
    return missing(
      ['founder hourly cost assumption (Settings, frl_cost_assumptions)'],
      `${minutes} minutes recorded but no hourly cost is set`,
    );
  }
  return complete(Math.round((minutes / 60) * hourlyCents));
}

function externalMetric(entries: FrlWorkEntry[]): MoneyMetric {
  const cents = entries.reduce((acc, e) => acc + Math.max(0, e.externalCostCents ?? 0), 0);
  return complete(cents);
}

export function computeEngagementEconomics(input: EngagementEconomicsInput): EngagementEconomics {
  const w7 = windowFromDate(input.startedOn, 7, input.nowIso);
  const w30 = windowFromDate(input.startedOn, 30, input.nowIso);
  const guaranteeWindow = windowFromDate(input.guaranteeEligibleOn, 30, input.nowIso);
  const guaranteeDeadlineOn = guaranteeWindow ? guaranteeWindow.endIso.slice(0, 10) : null;

  const noWindow = missing(['engagement start date'], 'set started_on to open the measurement window');

  // ---- Artist performance --------------------------------------------------
  const gmv7 = w7 ? complete(sumEarnings(input.earnings, w7, (r) => r.grossCents)) : noWindow;
  const gmv30 = w30 ? complete(sumEarnings(input.earnings, w30, (r) => r.grossCents)) : noWindow;
  const gmvLifetime = complete(sumEarnings(input.earnings, null, (r) => r.grossCents));
  const net30 = w30 ? complete(sumEarnings(input.earnings, w30, (r) => r.netCents)) : noWindow;

  let daysToFirstPaid: number | null = null;
  if (input.firstPaidAt && input.startedOn) {
    const start = Date.parse(`${input.startedOn}T00:00:00Z`);
    const paid = Date.parse(input.firstPaidAt);
    if (Number.isFinite(start) && Number.isFinite(paid) && paid >= start) {
      daysToFirstPaid = Math.floor((paid - start) / DAY_MS);
    }
  }

  // ---- CRWN revenue, by source (never summed with artist GMV) --------------
  const implementationCollected =
    input.feeCollectedCents === null
      ? missing(['implementation fee collected (engagement record)'],
          'record what the manual Stripe invoice actually collected, 0 is valid')
      : complete(input.feeCollectedCents, 'manual Stripe invoice; payment dates are not tracked');

  const fees7 = w7 ? complete(sumEarnings(input.earnings, w7, (r) => r.feeCents)) : noWindow;
  const fees30 = w30 ? complete(sumEarnings(input.earnings, w30, (r) => r.feeCents)) : noWindow;
  const feesLifetime = complete(sumEarnings(input.earnings, null, (r) => r.feeCents));

  const paidPlan = hasActivePaidPlan(input.platformTier, input.platformSubscriptionStatus);
  const planSubscription30: MoneyMetric = !paidPlan
    ? complete(0, 'no active paid platform plan')
    : input.planMonthlyCents === null
      ? missing(['plan monthly price'], 'active paid plan but no price was resolved')
      : modeled(input.planMonthlyCents,
          'modeled: one month of the current plan price; CRWN has no platform invoice records');

  // 7-day CRWN revenue deliberately excludes plan subscription (a monthly price
  // cannot honestly be prorated to a week without invoice data).
  const revenue7 = sumMetrics([implementationCollected, fees7],
    'implementation + platform fees; plan subscription excluded at 7-day grain');
  const revenue30 = sumMetrics([implementationCollected, fees30, planSubscription30]);
  const monthsSinceStart = w30 && input.startedOn
    ? Math.max(1, Math.ceil((Date.parse(input.nowIso) - Date.parse(w30.startIso)) / (30 * DAY_MS)))
    : 1;
  const planLifetime: MoneyMetric = !paidPlan
    ? complete(0, 'no active paid platform plan')
    : input.planMonthlyCents === null
      ? missing(['plan monthly price'])
      : modeled(input.planMonthlyCents * monthsSinceStart,
          `modeled: ${monthsSinceStart} month(s) of the current plan price since engagement start`);
  const revenueLifetime = sumMetrics([implementationCollected, feesLifetime, planLifetime]);

  // ---- Costs ---------------------------------------------------------------
  const work30 = workInWindow(input.work, w30);
  const laborMinutes30 = work30.reduce((a, e) => a + Math.max(0, e.minutes || 0), 0);
  const laborMinutesLifetime = input.work.reduce((a, e) => a + Math.max(0, e.minutes || 0), 0);
  const recordedLabor30 = w30 ? laborMetric(work30, input.assumptions.founderHourlyCents) : noWindow;
  const recordedLaborLifetime = laborMetric(input.work, input.assumptions.founderHourlyCents);
  const externalCosts30 = w30 ? externalMetric(work30) : noWindow;
  const externalCostsLifetime = externalMetric(input.work);

  const acquisition =
    input.acquisitionCostCents === null
      ? missing(['allocated acquisition cost (engagement record)'],
          'enter what acquiring this artist cost, 0 is valid for organic')
      : complete(input.acquisitionCostCents);

  const directCost30 = sumMetrics([recordedLabor30, externalCosts30, acquisition]);
  const directCostLifetime = sumMetrics([recordedLaborLifetime, externalCostsLifetime, acquisition]);

  // ---- Margin --------------------------------------------------------------
  const contribution30: MoneyMetric =
    revenue30.cents === null || directCost30.cents === null
      ? { cents: null, state: 'missing',
          missing: [...new Set([...revenue30.missing, ...directCost30.missing])] }
      : { cents: revenue30.cents - directCost30.cents,
          state: revenue30.state === 'modeled' ? 'modeled' : 'complete', missing: [] };

  const contributionPct30 =
    contribution30.cents !== null && revenue30.cents !== null && revenue30.cents > 0
      ? Math.round((contribution30.cents / revenue30.cents) * 100)
      : null;

  const contributionLifetime: MoneyMetric =
    revenueLifetime.cents === null || directCostLifetime.cents === null
      ? { cents: null, state: 'missing',
          missing: [...new Set([...revenueLifetime.missing, ...directCostLifetime.missing])] }
      : { cents: revenueLifetime.cents - directCostLifetime.cents,
          state: revenueLifetime.state === 'modeled' ? 'modeled' : 'complete', missing: [] };

  const revenuePerFulfillmentHourCents =
    laborMinutesLifetime > 0 && revenueLifetime.cents !== null
      ? Math.round(revenueLifetime.cents / (laborMinutesLifetime / 60))
      : null;

  // ---- CAC payback ---------------------------------------------------------
  // Cumulative dated CRWN revenue (implementation counts at day 0 because the
  // invoice is collected at/near engagement start; platform fees at their
  // ledger dates; the modeled plan line is excluded because it has no date).
  let cacPaybackStatus: 'paid_back' | 'not_yet' | 'unknown' = 'unknown';
  let cacPaybackDays: number | null = null;
  if (input.acquisitionCostCents !== null && input.startedOn && implementationCollected.cents !== null) {
    const start = Date.parse(`${input.startedOn}T00:00:00Z`);
    const dated = input.earnings
      .filter((r) => Number.isFinite(Date.parse(r.occurredAt)) && Date.parse(r.occurredAt) >= start)
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    let cumulative = implementationCollected.cents;
    if (cumulative >= input.acquisitionCostCents) {
      cacPaybackStatus = 'paid_back';
      cacPaybackDays = 0;
    } else {
      for (const r of dated) {
        cumulative += r.feeCents;
        if (cumulative >= input.acquisitionCostCents) {
          cacPaybackStatus = 'paid_back';
          cacPaybackDays = Math.floor((Date.parse(r.occurredAt) - start) / DAY_MS);
          break;
        }
      }
      if (cacPaybackStatus !== 'paid_back') cacPaybackStatus = 'not_yet';
    }
  }

  // ---- Money Model diagnostic ---------------------------------------------
  const diagnostic = buildDiagnostic({
    contribution30,
    implementationCollected,
    fees30,
    planSubscription30,
    recordedLaborLifetime,
    externalCostsLifetime,
    acquisition,
  });

  return {
    serviceWindow30: w30,
    guaranteeWindow,
    guaranteeDeadlineOn,
    artist: {
      gmv7, gmv30, gmvLifetime, net30,
      firstPaidAt: input.firstPaidAt,
      daysToFirstPaid,
      paidMemberCount: input.paidMemberCount,
    },
    crwn: {
      implementationCollected,
      platformFees7: fees7,
      platformFees30: fees30,
      platformFeesLifetime: feesLifetime,
      planSubscription30,
      revenue7,
      revenue30,
      revenueLifetime,
    },
    costs: {
      recordedLabor30,
      recordedLaborLifetime,
      laborMinutes30,
      laborMinutesLifetime,
      externalCosts30,
      externalCostsLifetime,
      acquisition,
      directCost30,
      directCostLifetime,
    },
    margin: {
      contribution30,
      contributionPct30,
      contributionLifetime,
      revenuePerFulfillmentHourCents,
      cacPaybackStatus,
      cacPaybackDays,
    },
    diagnostic,
  };
}

function buildDiagnostic(parts: {
  contribution30: MoneyMetric;
  implementationCollected: MoneyMetric;
  fees30: MoneyMetric;
  planSubscription30: MoneyMetric;
  recordedLaborLifetime: MoneyMetric;
  externalCostsLifetime: MoneyMetric;
  acquisition: MoneyMetric;
}): MoneyModelDiagnostic {
  const {
    contribution30, implementationCollected, fees30, planSubscription30,
    recordedLaborLifetime, externalCostsLifetime, acquisition,
  } = parts;

  // The replication cost: acquiring + serving one more artist like this one.
  const replicationParts = [acquisition, recordedLaborLifetime, externalCostsLifetime];
  const replicationCostCents = replicationParts.some((p) => p.cents === null)
    ? null
    : replicationParts.reduce((a, p) => a + (p.cents as number), 0);

  const missingInputs = [...new Set([
    ...contribution30.missing,
    ...replicationParts.flatMap((p) => p.missing),
  ])];

  let canFundOneMore: boolean | null = null;
  let canFundTwoMore: boolean | null = null;
  if (contribution30.cents !== null && replicationCostCents !== null) {
    if (replicationCostCents === 0) {
      // Zero recorded cost cannot honestly prove replication capacity.
      canFundOneMore = null;
      canFundTwoMore = null;
      missingInputs.push('a non-zero acquisition or service cost (nothing recorded to replicate against)');
    } else {
      canFundOneMore = contribution30.cents >= replicationCostCents;
      canFundTwoMore = contribution30.cents >= replicationCostCents * 2;
    }
  }

  const revenueSources: Array<{ key: string; label: string; metric: MoneyMetric }> = [
    { key: 'implementation', label: 'Implementation fee', metric: implementationCollected },
    { key: 'platform_fees', label: 'Platform fees (30d)', metric: fees30 },
    { key: 'plan_subscription', label: 'Plan subscription (30d, modeled)', metric: planSubscription30 },
  ];
  const knownRevenue = revenueSources.filter((s) => s.metric.cents !== null && (s.metric.cents as number) > 0);
  const topRevenueSource = knownRevenue.length
    ? knownRevenue.reduce((best, s) => ((s.metric.cents as number) > (best.metric.cents as number) ? s : best))
    : null;

  const costSources: Array<{ key: string; label: string; metric: MoneyMetric }> = [
    { key: 'labor', label: 'Recorded labor', metric: recordedLaborLifetime },
    { key: 'external', label: 'External fulfillment costs', metric: externalCostsLifetime },
    { key: 'acquisition', label: 'Allocated acquisition cost', metric: acquisition },
  ];
  const knownCosts = costSources.filter((s) => s.metric.cents !== null && (s.metric.cents as number) > 0);
  const topCostSource = knownCosts.length
    ? knownCosts.reduce((best, s) => ((s.metric.cents as number) > (best.metric.cents as number) ? s : best))
    : null;

  return {
    replicationCostCents,
    canFundOneMore,
    canFundTwoMore,
    missingInputs: [...new Set(missingInputs)],
    topRevenueSource: topRevenueSource
      ? { key: topRevenueSource.key, label: topRevenueSource.label, cents: topRevenueSource.metric.cents as number }
      : null,
    topCostSource: topCostSource
      ? { key: topCostSource.key, label: topCostSource.label, cents: topCostSource.metric.cents as number }
      : null,
  };
}

// ---- Cohort aggregation -----------------------------------------------------

export interface CohortRowInput {
  /** Values may be null = unknown; nulls are EXCLUDED from aggregates and the
   *  per-metric sample size says how many rows actually carried a value. */
  daysToFirstPaid: number | null;
  laborMinutes: number | null;
  implementationCollectedCents: number | null;
  contribution30Cents: number | null;
  guaranteeStatus: 'pending' | 'eligible' | 'achieved' | null;
  onPaidPlan: boolean | null;
  inputsComplete: boolean;
}

export interface CohortStat {
  mean: number | null;
  median: number | null;
  /** How many of the cohort's rows had a known value for this metric. */
  sampleSize: number;
  cohortSize: number;
}

export interface CohortAggregates {
  cohortSize: number;
  daysToFirstPaid: CohortStat;
  laborMinutes: CohortStat;
  implementationCollectedCents: CohortStat;
  contribution30Cents: CohortStat;
  guaranteeAchievedRate: { achieved: number; known: number };
  paidPlanRate: { onPaid: number; known: number };
  completeInputsCount: number;
}

function stat(values: Array<number | null>, cohortSize: number): CohortStat {
  const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (known.length === 0) return { mean: null, median: null, sampleSize: 0, cohortSize };
  const sorted = [...known].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  const mean = Math.round(known.reduce((a, v) => a + v, 0) / known.length);
  return { mean, median, sampleSize: known.length, cohortSize };
}

export function cohortAggregates(rows: CohortRowInput[]): CohortAggregates {
  const n = rows.length;
  const guaranteeKnown = rows.filter((r) => r.guaranteeStatus !== null);
  const planKnown = rows.filter((r) => r.onPaidPlan !== null);
  return {
    cohortSize: n,
    daysToFirstPaid: stat(rows.map((r) => r.daysToFirstPaid), n),
    laborMinutes: stat(rows.map((r) => r.laborMinutes), n),
    implementationCollectedCents: stat(rows.map((r) => r.implementationCollectedCents), n),
    contribution30Cents: stat(rows.map((r) => r.contribution30Cents), n),
    guaranteeAchievedRate: {
      achieved: guaranteeKnown.filter((r) => r.guaranteeStatus === 'achieved').length,
      known: guaranteeKnown.length,
    },
    paidPlanRate: {
      onPaid: planKnown.filter((r) => r.onPaidPlan === true).length,
      known: planKnown.length,
    },
    completeInputsCount: rows.filter((r) => r.inputsComplete).length,
  };
}
