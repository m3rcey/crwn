// TS-MONEY-005 / TS-MONEY-019: what a collaborator may withdraw, and what may never count.
import { describe, it, expect } from 'vitest';
import { availableCashoutCents, cashoutRailReady } from './cashoutBalance';

const base = {
  fundedReleasedCents: 10000, paidCents: 0, clawbackCents: 0,
  negativeCarryCents: 0, frozenCents: 0,
};

describe('availability counts only funded, released, unfrozen money', () => {
  it('the simple case', () => expect(availableCashoutCents(base)).toBe(10000));

  it('pending and completed payouts both reduce it, or two requests double-spend', () => {
    expect(availableCashoutCents({ ...base, paidCents: 4000 })).toBe(6000);
  });

  it('clawbacks always count', () => {
    expect(availableCashoutCents({ ...base, clawbackCents: 2500 })).toBe(7500);
  });

  it('negative carry must be cleared before anything is withdrawable', () => {
    expect(availableCashoutCents({ ...base, negativeCarryCents: 10000 })).toBe(0);
  });

  it('a disputed source has ZERO availability (TS-MONEY-017)', () => {
    expect(availableCashoutCents({ ...base, frozenCents: 10000 })).toBe(0);
  });

  it('never returns a negative number: a collaborator in the red withdraws zero', () => {
    expect(availableCashoutCents({ ...base, clawbackCents: 999999 })).toBe(0);
  });

  it('deductions compose rather than override each other', () => {
    expect(availableCashoutCents({
      fundedReleasedCents: 10000, paidCents: 1000, clawbackCents: 1000,
      negativeCarryCents: 1000, frozenCents: 1000,
    })).toBe(6000);
  });

  it('integer cents only, never a float', () => {
    const v = availableCashoutCents({ ...base, fundedReleasedCents: 1000.7, paidCents: 0.4 });
    expect(Number.isInteger(v)).toBe(true);
  });
});

describe('the rail gate needs every control, not a majority', () => {
  it('is closed unless all three hold', () => {
    expect(cashoutRailReady({ reservationLedgerApplied: true, allRailsFunded: true, canaryPassed: true })).toBe(true);
    for (const missing of ['reservationLedgerApplied', 'allRailsFunded', 'canaryPassed'] as const) {
      const r = { reservationLedgerApplied: true, allRailsFunded: true, canaryPassed: true };
      r[missing] = false;
      expect(cashoutRailReady(r), `${missing} must block the rail`).toBe(false);
    }
  });
});
