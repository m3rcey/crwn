import { describe, it, expect } from 'vitest';
import { computeChurn, rateChurnAgainstBenchmark, lifespanMonthsFromChurn } from './retention';

const MONTH_START = '2026-08-01T00:00:00.000Z';

describe('computeChurn', () => {
  it('is a percentage of the opening balance', () => {
    const r = computeChurn(
      [
        { status: 'canceled', created_at: '2026-06-01T00:00:00.000Z', canceled_at: '2026-08-10T00:00:00.000Z' },
        { status: 'active', created_at: '2026-06-01T00:00:00.000Z' },
        { status: 'active', created_at: '2026-06-01T00:00:00.000Z' },
        { status: 'active', created_at: '2026-06-01T00:00:00.000Z' },
      ],
      MONTH_START,
    );
    expect(r.canceledThisMonth).toBe(1);
    expect(r.totalAtMonthStart).toBe(4);
    expect(r.churnRatePct).toBeCloseTo(25);
  });

  it('excludes someone who joined AND left inside the month from the denominator', () => {
    const r = computeChurn(
      [{ status: 'canceled', created_at: '2026-08-05T00:00:00.000Z', canceled_at: '2026-08-20T00:00:00.000Z' }],
      MONTH_START,
    );
    expect(r.totalAtMonthStart).toBe(0);
    expect(r.churnRatePct).toBe(0);
  });

  it('ignores a cancellation from a previous month', () => {
    const r = computeChurn(
      [{ status: 'canceled', created_at: '2026-05-01T00:00:00.000Z', canceled_at: '2026-06-15T00:00:00.000Z' }],
      MONTH_START,
    );
    expect(r.canceledThisMonth).toBe(0);
  });

  it('returns 0 rather than dividing by zero on an empty set', () => {
    const r = computeChurn([], MONTH_START);
    expect(r.churnRatePct).toBe(0);
    expect(r.totalAtMonthStart).toBe(0);
  });
});

describe('rateChurnAgainstBenchmark', () => {
  it('treats zero churn as excellent', () => {
    expect(rateChurnAgainstBenchmark(0, 5)).toBe('excellent');
  });

  it('bands against the platform rate, lower being better', () => {
    expect(rateChurnAgainstBenchmark(2, 5)).toBe('excellent'); // < 0.5x
    expect(rateChurnAgainstBenchmark(3.5, 5)).toBe('good'); // < 0.8x
    expect(rateChurnAgainstBenchmark(5, 5)).toBe('average'); // <= 1.2x
    expect(rateChurnAgainstBenchmark(7, 5)).toBe('below_average'); // <= 1.5x
    expect(rateChurnAgainstBenchmark(9, 5)).toBe('needs_work'); // > 1.5x
  });
});

describe('lifespanMonthsFromChurn', () => {
  it('inverts the monthly rate', () => {
    expect(lifespanMonthsFromChurn(10)).toBe(10);
    expect(lifespanMonthsFromChurn(5)).toBe(20);
  });

  it('caps at 24 months when churn is zero, rather than claiming immortality', () => {
    expect(lifespanMonthsFromChurn(0)).toBe(24);
  });
});
