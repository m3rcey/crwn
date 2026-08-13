// TS-MONEY-007 / TS-MONEY-010: a refund must not leave CRWN funding the artist's proceeds, and the
// recovery must be idempotent across redelivered webhooks and cumulative partial refunds.
import { describe, it, expect } from 'vitest';
import { proportionalCents, reversalStillOwed } from './refundRecovery';

// A $100 Launch sale: application fee $12, so Stripe transferred $100 and pulled $12 back.
const CHARGE = 10000;
const TRANSFER = 10000;

describe('proportional arithmetic is integer cents and never overshoots', () => {
  it('splits proportionally', () => {
    expect(proportionalCents(10000, 5000, 10000)).toBe(5000);
    expect(proportionalCents(8800, 3333, 10000)).toBe(2933);
  });
  it('never exceeds the total, whatever the inputs claim', () => {
    expect(proportionalCents(8800, 99999, 10000)).toBe(8800);
  });
  it('is zero for degenerate inputs rather than NaN or negative', () => {
    for (const args of [[0, 1, 1], [100, 0, 1], [100, 1, 0], [-5, 1, 1]] as const) {
      expect(proportionalCents(args[0], args[1], args[2])).toBe(0);
    }
  });
});

describe('TS-MONEY-007 — the artist share is recovered on a refund', () => {
  it('a full refund owes the whole transfer back', () => {
    expect(reversalStillOwed({
      transferAmount: TRANSFER, alreadyReversed: 0, chargeAmount: CHARGE, totalRefunded: CHARGE,
    })).toBe(10000);
  });

  it('a partial refund owes only its share', () => {
    expect(reversalStillOwed({
      transferAmount: TRANSFER, alreadyReversed: 0, chargeAmount: CHARGE, totalRefunded: 2500,
    })).toBe(2500);
  });
});

describe('TS-MONEY-010 — never double-reverse', () => {
  // MUTATION: drop `alreadyReversed` from the calculation. Every case below fails.
  it('a refund created WITH reverse_transfer leaves nothing owed', () => {
    expect(reversalStillOwed({
      transferAmount: TRANSFER, alreadyReversed: 10000, chargeAmount: CHARGE, totalRefunded: CHARGE,
    })).toBe(0);
  });

  it('a redelivered webhook for the same refund is a no-op', () => {
    const first = reversalStillOwed({
      transferAmount: TRANSFER, alreadyReversed: 0, chargeAmount: CHARGE, totalRefunded: 4000,
    });
    expect(first).toBe(4000);
    const redelivered = reversalStillOwed({
      transferAmount: TRANSFER, alreadyReversed: first, chargeAmount: CHARGE, totalRefunded: 4000,
    });
    expect(redelivered).toBe(0);
  });

  it('cumulative partial refunds converge without drift', () => {
    // Three partials that do not divide evenly. Each step reverses only the NEW slice, and the
    // total can never exceed the transfer.
    let reversed = 0;
    for (const cumulative of [3333, 6666, 10000]) {
      const owed = reversalStillOwed({
        transferAmount: TRANSFER, alreadyReversed: reversed, chargeAmount: CHARGE, totalRefunded: cumulative,
      });
      reversed += owed;
    }
    expect(reversed).toBe(10000);
  });

  it('cumulative reversal can never exceed the original transfer', () => {
    const owed = reversalStillOwed({
      transferAmount: TRANSFER, alreadyReversed: 9000, chargeAmount: CHARGE, totalRefunded: 99999,
    });
    expect(owed).toBe(1000);
    expect(9000 + owed).toBeLessThanOrEqual(TRANSFER);
  });

  it('an over-reversed transfer owes nothing rather than a negative amount', () => {
    expect(reversalStillOwed({
      transferAmount: TRANSFER, alreadyReversed: 12000, chargeAmount: CHARGE, totalRefunded: CHARGE,
    })).toBe(0);
  });
});

describe('non-destination and degenerate charges are left alone', () => {
  it('no transfer means nothing to recover', () => {
    expect(reversalStillOwed({
      transferAmount: 0, alreadyReversed: 0, chargeAmount: CHARGE, totalRefunded: CHARGE,
    })).toBe(0);
  });
  it('a charge with nothing refunded owes nothing', () => {
    expect(reversalStillOwed({
      transferAmount: TRANSFER, alreadyReversed: 0, chargeAmount: CHARGE, totalRefunded: 0,
    })).toBe(0);
  });
});

describe('the recovered amount matches what the artist actually received', () => {
  // The property that matters economically: after a full refund with recovery, the artist has been
  // debited exactly what they were credited, and CRWN is whole.
  it('artist net movement is zero across settle + full refund', () => {
    const applicationFee = 1200;
    const artistCredited = TRANSFER - applicationFee; // 8800 net after the fee returned to CRWN
    const reversed = reversalStillOwed({
      transferAmount: TRANSFER, alreadyReversed: 0, chargeAmount: CHARGE, totalRefunded: CHARGE,
    });
    // The reversal pulls the FULL transfer; the application fee refund returns CRWN's 1200, so the
    // artist's net debit is the 8800 they actually kept.
    expect(reversed - applicationFee).toBe(artistCredited);
  });
});
