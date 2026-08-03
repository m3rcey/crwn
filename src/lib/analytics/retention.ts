// retention.ts — the ONE definition of monthly churn and the platform benchmark.
//
// This arithmetic was inline in /api/analytics, which was fine while that route was its only
// consumer. The Constraint Engine now needs the same two numbers to decide whether retention
// is an artist's blocking problem, and a second copy of a churn formula is exactly the shape
// of bug this codebase has paid for before (a duplicated price map once fed a 5x commission
// overpay). So the math moved here, unchanged, and /api/analytics imports it.
//
// Pure: no database, no clock of its own. Callers pass the rows and the month boundary.

export interface ChurnSubscription {
  status: string | null;
  created_at: string;
  canceled_at?: string | null;
}

export interface ChurnResult {
  /** Monthly churn as a PERCENTAGE (0-100), matching what /api/analytics has always returned. */
  churnRatePct: number;
  canceledThisMonth: number;
  /** Members who existed at the start of the month: the denominator. */
  totalAtMonthStart: number;
}

/**
 * Monthly churn for a set of subscriptions.
 *
 * The denominator is everyone who was a member when the month began: still active, or
 * cancelled at some point during the month. Someone who joined AND left inside the month is
 * deliberately not in the denominator, because they were never part of the opening balance.
 */
export function computeChurn(subs: ChurnSubscription[], monthStartIso: string): ChurnResult {
  const canceledThisMonth = subs.filter(
    (s) => s.status === 'canceled' && s.canceled_at && s.canceled_at >= monthStartIso,
  ).length;

  const totalAtMonthStart = subs.filter(
    (s) =>
      s.created_at < monthStartIso &&
      (s.status === 'active' || (s.canceled_at && s.canceled_at >= monthStartIso)),
  ).length;

  return {
    churnRatePct: totalAtMonthStart > 0 ? (canceledThisMonth / totalAtMonthStart) * 100 : 0,
    canceledThisMonth,
    totalAtMonthStart,
  };
}

export type ChurnRating = 'excellent' | 'good' | 'average' | 'below_average' | 'needs_work';

/**
 * Band an artist's churn against the platform's. Lower is better, so the bands read as
 * multiples of the platform rate: under half is excellent, over 1.5x needs work.
 */
export function rateChurnAgainstBenchmark(artistChurnPct: number, platformChurnPct: number): ChurnRating {
  if (artistChurnPct === 0) return 'excellent';
  if (artistChurnPct < platformChurnPct * 0.5) return 'excellent';
  if (artistChurnPct < platformChurnPct * 0.8) return 'good';
  if (artistChurnPct <= platformChurnPct * 1.2) return 'average';
  if (artistChurnPct <= platformChurnPct * 1.5) return 'below_average';
  return 'needs_work';
}

/**
 * Expected lifespan in months implied by a monthly churn rate. 24 is the documented cap used
 * when churn is zero, which is a small sample artifact rather than immortality.
 */
export function lifespanMonthsFromChurn(churnPct: number): number {
  return churnPct > 0 ? Number((100 / churnPct).toFixed(1)) : 24;
}
