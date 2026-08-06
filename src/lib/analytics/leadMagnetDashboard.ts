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
  /** The extra campaign tags (platform, angle, keyword, variant) and the ICP band / sub-avatar. */
  metadata?: Record<string, unknown> | null;
}

export type Dimension = 'calculator' | 'campaign' | 'referrer' | 'video';

/**
 * Everything a campaign scorecard can be grouped by. The four column dimensions plus the tags that
 * ride in metadata, so "which angle converts" is one call rather than a second table.
 */
export type ScorecardDimension = Dimension | 'platform' | 'angle' | 'keyword' | 'variant';

const METADATA_DIMENSIONS = new Set<string>(['platform', 'angle', 'keyword', 'variant']);

/** The grouping key for one row on one dimension. `unknown` groups untagged rows. */
export function dimensionKey(row: FunnelRow, dim: ScorecardDimension): string {
  if (METADATA_DIMENSIONS.has(dim)) {
    const v = (row.metadata ?? {})[dim];
    return typeof v === 'string' && v ? v : 'unknown';
  }
  return (row[dim as Dimension] as string | null) || 'unknown';
}

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

// ---------------------------------------------------------------------------
// Campaign scorecard: one campaign/video/angle, all the way down to money.
// ---------------------------------------------------------------------------
//
// The rankings above answer "which source converts a view into a completed calculator". That was
// enough while the funnel stopped at the builder. It is not enough to decide which VIDEO to make
// more of, because a video can produce a flood of completions and no artists, and another can
// produce forty leads of which four are the actual ICP. This walks one dimension through the whole
// spine, so lead VOLUME and lead QUALITY are visible side by side and the largest drop is named.

/** The scorecard's stage spine, in funnel order. Every column is a real, deduped stage. */
export const SCORECARD_STAGES = [
  'page_viewed',
  'calculator_started',
  'calculator_completed',
  'email_submitted',
  'account_created',
  'setup_completed',
  'stripe_connected',
  'fans_imported',
  'first_paid_conversion',
] as const;

export type ScorecardStage = (typeof SCORECARD_STAGES)[number];

/** The band the canonical server-side scorer assigns to a sales-priority lead. */
export const SALES_PRIORITY_BAND = 'sales_priority';

export interface CampaignScorecardRow {
  key: string;
  /** Stage counts, in SCORECARD_STAGES order. Always every key, zero-filled. */
  stages: Record<ScorecardStage, number>;
  /** Leads the CANONICAL server-side scorer put in the sales-priority band. Quality, not volume. */
  salesPriority: number;
  /** Hand-raisers: an explicit request for a call. The strongest intent signal in the funnel. */
  callsRequested: number;
  /** How many distinct sub-avatars this content pulled, and which one it pulled most. */
  topSubAvatar: string | null;
  /** completions / views. The old headline rate, kept so nothing regresses. */
  completionRate: number;
  /** first_paid_conversion / account_created. What the content is actually worth. */
  paidRate: number;
  /** Where this campaign loses the most people, by absolute count. Null when nothing entered. */
  biggestDrop: { from: ScorecardStage; to: ScorecardStage; lost: number; lossRate: number } | null;
}

function emptyStages(): Record<ScorecardStage, number> {
  return Object.fromEntries(SCORECARD_STAGES.map((s) => [s, 0])) as Record<ScorecardStage, number>;
}

/**
 * The consecutive stage transition that loses the most people, by absolute count. Absolute rather
 * than rate on purpose: at the bottom of a young funnel every rate is ~100% loss, and "you lost
 * 400 people between viewing and starting" is the sentence that changes what gets made next.
 */
export function biggestDropOf(
  stages: Record<ScorecardStage, number>,
): CampaignScorecardRow['biggestDrop'] {
  let worst: CampaignScorecardRow['biggestDrop'] = null;
  for (let i = 0; i < SCORECARD_STAGES.length - 1; i++) {
    const from = SCORECARD_STAGES[i];
    const to = SCORECARD_STAGES[i + 1];
    const prev = stages[from];
    if (prev <= 0) continue;
    const lost = Math.max(0, prev - stages[to]);
    const lossRate = lost / prev;
    if (!worst || lost > worst.lost || (lost === worst.lost && lossRate > worst.lossRate)) {
      worst = { from, to, lost, lossRate };
    }
  }
  return worst;
}

/**
 * Walk one dimension (campaign, video, angle, ...) through the whole funnel spine.
 * Sorted by first paid conversions, then accounts, then completions: the ordering a founder
 * deciding what to publish next actually needs, rather than raw view count.
 */
export function campaignScorecard(rows: FunnelRow[], dim: ScorecardDimension): CampaignScorecardRow[] {
  interface Acc {
    stages: Record<ScorecardStage, number>;
    salesPriority: number;
    callsRequested: number;
    avatars: Map<string, number>;
  }
  const byKey = new Map<string, Acc>();
  const stageSet = new Set<string>(SCORECARD_STAGES);

  for (const row of rows) {
    const key = dimensionKey(row, dim);
    const acc =
      byKey.get(key) ??
      byKey.set(key, { stages: emptyStages(), salesPriority: 0, callsRequested: 0, avatars: new Map() }).get(key)!;

    if (stageSet.has(row.stage)) acc.stages[row.stage as ScorecardStage] += 1;
    if (row.stage === 'call_requested') acc.callsRequested += 1;

    const meta = row.metadata ?? {};
    // The band is written by the server-side scorer at capture; it is never client-supplied.
    if (meta.band === SALES_PRIORITY_BAND) acc.salesPriority += 1;
    if (typeof meta.subAvatar === 'string' && meta.subAvatar) {
      acc.avatars.set(meta.subAvatar, (acc.avatars.get(meta.subAvatar) || 0) + 1);
    }
  }

  const out: CampaignScorecardRow[] = [];
  for (const [key, acc] of byKey) {
    let topSubAvatar: string | null = null;
    let topCount = 0;
    for (const [id, n] of acc.avatars) {
      if (n > topCount) {
        topCount = n;
        topSubAvatar = id;
      }
    }
    out.push({
      key,
      stages: acc.stages,
      salesPriority: acc.salesPriority,
      callsRequested: acc.callsRequested,
      topSubAvatar,
      completionRate: rate(acc.stages.calculator_completed, acc.stages.page_viewed),
      paidRate: rate(acc.stages.first_paid_conversion, acc.stages.account_created),
      biggestDrop: biggestDropOf(acc.stages),
    });
  }

  out.sort(
    (a, b) =>
      b.stages.first_paid_conversion - a.stages.first_paid_conversion ||
      b.stages.account_created - a.stages.account_created ||
      b.stages.calculator_completed - a.stages.calculator_completed ||
      a.key.localeCompare(b.key),
  );
  return out;
}
