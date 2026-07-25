// Lead-magnet performance dashboard: the pure aggregation over the analytics tables.
//
// It reduces raw funnel_events rows into the dashboard's headline metrics and the "highest
// converting X" rankings. Pure (no I/O) so every number is testable; the admin route feeds it the
// filtered rows and adds the opportunity-ledger revenue totals.
//
// "Converting" here means the COMPLETION RATE for a dimension: of the views attributed to a source
// / video / campaign, how many went on to complete a calculator. Completion is used (not account
// creation) because account_created is not tagged with the source dimension, whereas page_viewed
// and calculator_completed both carry it end to end. A minimum-views floor keeps a lone
// 1-view/1-completion row from topping the chart at 100%.

export interface FunnelRow {
  stage: string;
  calculator: string | null;
  campaign: string | null;
  referrer: string | null;
  video: string | null;
}

export type Dimension = 'calculator' | 'campaign' | 'referrer' | 'video';

export function stageCounts(rows: FunnelRow[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const r of rows) c[r.stage] = (c[r.stage] || 0) + 1;
  return c;
}

function rate(numer: number, denom: number): number {
  return denom > 0 ? numer / denom : 0;
}

export interface DashboardMetrics {
  views: number;
  completions: number;
  emails: number;
  accounts: number;
  builderOpened: number;
  builderPublished: number;
  missions: number;
  /** accounts / completions: of those who completed a calculator, how many made an account. */
  activationRate: number;
  /** builderPublished / builderOpened: of those who opened a builder, how many published. */
  builderCompletion: number;
}

export function computeMetrics(rows: FunnelRow[]): DashboardMetrics {
  const c = stageCounts(rows);
  const views = c.page_viewed || 0;
  const completions = c.calculator_completed || 0;
  const emails = c.email_submitted || 0;
  const accounts = c.account_created || 0;
  const builderOpened = c.builder_opened || 0;
  const builderPublished = c.builder_published || 0;
  const missions = c.mission_completed || 0;
  return {
    views,
    completions,
    emails,
    accounts,
    builderOpened,
    builderPublished,
    missions,
    activationRate: rate(accounts, completions),
    builderCompletion: rate(builderPublished, builderOpened),
  };
}

export interface ConversionRank {
  key: string;
  views: number;
  completions: number;
  rate: number;
}

/**
 * Rank a dimension's values by completion rate (completions / views), highest first, with an
 * optional minimum-views floor. Ties break on completion volume. `unknown` groups untagged rows.
 */
export function conversionByDimension(
  rows: FunnelRow[],
  dim: Dimension,
  opts?: { minViews?: number },
): ConversionRank[] {
  const views = new Map<string, number>();
  const completions = new Map<string, number>();
  for (const r of rows) {
    const key = (r[dim] as string | null) || 'unknown';
    if (r.stage === 'page_viewed') views.set(key, (views.get(key) || 0) + 1);
    else if (r.stage === 'calculator_completed') completions.set(key, (completions.get(key) || 0) + 1);
  }
  const min = opts?.minViews ?? 1;
  const out: ConversionRank[] = [];
  for (const [key, v] of views) {
    if (v < min) continue;
    const c = completions.get(key) || 0;
    out.push({ key, views: v, completions: c, rate: rate(c, v) });
  }
  out.sort((a, b) => b.rate - a.rate || b.completions - a.completions);
  return out;
}

export interface CalculatorPerformance {
  calculator: string;
  views: number;
  completions: number;
  emails: number;
  accounts: number;
}

/** Per-calculator volumes, sorted by completions desc. Top row = "Top Performing Calculator". */
export function calculatorPerformance(rows: FunnelRow[]): CalculatorPerformance[] {
  const byCalc = new Map<string, CalculatorPerformance>();
  const get = (k: string) =>
    byCalc.get(k) ?? byCalc.set(k, { calculator: k, views: 0, completions: 0, emails: 0, accounts: 0 }).get(k)!;
  for (const r of rows) {
    if (!r.calculator) continue;
    const p = get(r.calculator);
    if (r.stage === 'page_viewed') p.views += 1;
    else if (r.stage === 'calculator_completed') p.completions += 1;
    else if (r.stage === 'email_submitted') p.emails += 1;
    else if (r.stage === 'account_created') p.accounts += 1;
  }
  return [...byCalc.values()].sort((a, b) => b.completions - a.completions || b.views - a.views);
}

/** The single best of each ranking, or null if empty. Convenience for the headline tiles. */
export function topOf<T>(ranked: T[]): T | null {
  return ranked.length ? ranked[0] : null;
}
