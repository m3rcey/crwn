// TS-MONEY-014 / TS-MONEY-015: the first-charge percentage may never UNDERFUND the collaborator.
import { describe, it, expect } from 'vitest';
import { centsWithheldByPercent, feePercentForExactCents, firstChargeFeePlan } from './feePercent';

const AMOUNTS = [100, 199, 250, 333, 999, 1000, 1234, 2500, 4999, 10000, 33333, 100000, 123457];

describe('the percentage never retains fewer cents than required', () => {
  // MUTATION: swap Math.ceil for Math.round in feePercentForExactCents. Cases below fail.
  it('holds across a wide sweep of amounts and required fractions', () => {
    for (const gross of AMOUNTS) {
      for (const num of [1, 7, 13, 29, 50, 71, 88, 97]) {
        const required = Math.max(1, Math.floor((gross * num) / 100));
        const plan = feePercentForExactCents(gross, required);
        expect(plan.safe, `gross=${gross} required=${required}`).toBe(true);
        expect(
          plan.withheldCents,
          `gross=${gross} required=${required} withheld=${plan.withheldCents}`,
        ).toBeGreaterThanOrEqual(required);
      }
    }
  });

  it('the overage is small, measurable and never negative', () => {
    for (const gross of AMOUNTS) {
      const required = Math.floor(gross * 0.4137);
      const plan = feePercentForExactCents(gross, required);
      expect(plan.overageCents).toBeGreaterThanOrEqual(0);
      expect(plan.overageCents).toBe(plan.withheldCents - required);
      // A 0.01% step on the gross bounds the overage.
      expect(plan.overageCents).toBeLessThanOrEqual(Math.ceil(gross / 10000) + 1);
    }
  });

  it('uses at most two decimal places, which is Stripe limit', () => {
    for (const gross of AMOUNTS) {
      const plan = feePercentForExactCents(gross, Math.floor(gross * 0.3333));
      expect(Math.round(plan.percent * 100)).toBe(plan.percent * 100);
    }
  });

  it('is exact when the fraction lands cleanly', () => {
    const plan = feePercentForExactCents(10000, 1200);
    expect(plan.percent).toBe(12);
    expect(plan.withheldCents).toBe(1200);
    expect(plan.overageCents).toBe(0);
  });

  it('a tiny charge still cannot underfund', () => {
    const plan = feePercentForExactCents(100, 13); // $1.00 charge, 13c required
    expect(plan.withheldCents).toBeGreaterThanOrEqual(13);
  });

  it('requiring more than the charge is UNSAFE and must fund nothing', () => {
    const plan = feePercentForExactCents(1000, 1001);
    expect(plan.safe).toBe(false);
  });

  it('zero required is safe and withholds nothing', () => {
    const plan = feePercentForExactCents(1000, 0);
    expect(plan.safe).toBe(true);
    expect(plan.percent).toBe(0);
  });
});

describe('the full first-charge plan sums the three retained parts', () => {
  it('covers fee + referral + granted reserve, never less', () => {
    const plan = firstChargeFeePlan({
      grossCents: 10000, platformFeeCents: 1200, attributedCutCents: 1000, grantedReserveCents: 3900,
    });
    expect(plan.requiredCents).toBe(6100);
    expect(plan.withheldCents).toBeGreaterThanOrEqual(6100);
    expect(plan.safe).toBe(true);
  });

  it('an awkward total still over-retains rather than under-retains', () => {
    const plan = firstChargeFeePlan({
      grossCents: 1237, platformFeeCents: 148, attributedCutCents: 0, grantedReserveCents: 327,
    });
    expect(plan.withheldCents).toBeGreaterThanOrEqual(475);
    expect(plan.overageCents).toBe(plan.withheldCents - 475);
  });

  it('models Stripe rounding explicitly rather than assuming it', () => {
    expect(centsWithheldByPercent(10000, 12)).toBe(1200);
    expect(centsWithheldByPercent(1237, 38.4)).toBe(Math.round((1237 * 38.4) / 100));
  });
});
