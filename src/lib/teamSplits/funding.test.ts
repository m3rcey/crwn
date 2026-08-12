// Team Split FUNDING test matrix (audit F-3, section 10 of the remediation brief).
//
// The single property every case must satisfy:
//
//   CRWN revenue + referral/clipper commission + collaborator funding
//   + artist proceeds  ===  what the fan actually paid
//
// No phantom money, in either direction. A failure here means CRWN is either
// subsidising a collaborator out of its own fee (the original F-3 defect) or
// short-changing an artist.
//
// All amounts are INTEGER CENTS.
import { describe, it, expect } from 'vitest';
import {
  computeFunding,
  reconciles,
  crwnRevenueCents,
  reserveClawback,
  FUNDING_OPEN_QUESTIONS,
  type FundingDeal,
} from './funding';

const LAUNCH = 12, PRO = 8, SCALE = 5;

function deal(over: Partial<FundingDeal> = {}): FundingDeal {
  return {
    id: over.id ?? 'd1',
    percentage: over.percentage ?? 50,
    payout_basis: over.payout_basis ?? 'net_artist_revenue',
    cap_amount: over.cap_amount ?? null,
    already_accrued: over.already_accrued ?? 0,
  };
}

/** Every case runs through this, so conservation is asserted everywhere. */
function expectConserved(b: ReturnType<typeof computeFunding>) {
  expect(reconciles(b), `conservation failed: ${JSON.stringify(b)}`).toBe(true);
  expect(
    b.platformFeeCents + b.attributedCutCents + b.collaboratorReserveCents + b.artistProceedsCents,
  ).toBe(b.grossCents);
}

describe('Team Split funding — conservation matrix', () => {
  it('$100 sale, Launch fee, no Team Split', () => {
    const b = computeFunding({ grossCents: 10000, platformFeePercent: LAUNCH, attributedCutPercent: 0 }, []);
    expect(b.platformFeeCents).toBe(1200);
    expect(b.artistNetCents).toBe(8800);
    expect(b.collaboratorReserveCents).toBe(0);
    expect(b.artistProceedsCents).toBe(8800);
    expect(b.applicationFeePercent).toBe(12); // unchanged from today
    expectConserved(b);
  });

  it('$100 sale, Launch, 50% Team Split: the artist funds it, not CRWN', () => {
    const b = computeFunding({ grossCents: 10000, platformFeePercent: LAUNCH, attributedCutPercent: 0 }, [deal()]);
    expect(b.platformFeeCents).toBe(1200);          // CRWN revenue unchanged
    expect(b.collaboratorReserveCents).toBe(4400);  // 50% of the artist's 8800
    expect(b.artistProceedsCents).toBe(4400);
    // This is the whole fix: 12 + 44 = 56% withheld, so the $44 is in CRWN's
    // balance to pay the collaborator. Before, only 12% was withheld and the $44
    // came out of CRWN's pocket.
    expect(b.applicationFeePercent).toBe(56);
    expect(crwnRevenueCents(b)).toBe(1200);
    expectConserved(b);
  });

  it('Pro fee + Team Split', () => {
    const b = computeFunding({ grossCents: 10000, platformFeePercent: PRO, attributedCutPercent: 0 }, [deal()]);
    expect(b.platformFeeCents).toBe(800);
    expect(b.artistNetCents).toBe(9200);
    expect(b.collaboratorReserveCents).toBe(4600);
    expectConserved(b);
  });

  it('Scale fee + Team Split', () => {
    const b = computeFunding({ grossCents: 10000, platformFeePercent: SCALE, attributedCutPercent: 0 }, [deal()]);
    expect(b.platformFeeCents).toBe(500);
    expect(b.collaboratorReserveCents).toBe(4750);
    expectConserved(b);
  });

  it('referral + Team Split: the split sits AFTER the referral, so it cannot double-spend', () => {
    const b = computeFunding({ grossCents: 10000, platformFeePercent: LAUNCH, attributedCutPercent: 10 }, [deal()]);
    expect(b.platformFeeCents).toBe(1200);
    expect(b.attributedCutCents).toBe(1000);
    expect(b.artistNetCents).toBe(7800);            // referral already removed
    expect(b.collaboratorReserveCents).toBe(3900);  // 50% of what the artist kept
    expect(b.artistProceedsCents).toBe(3900);
    expectConserved(b);
  });

  it('clipper + Team Split behaves identically (same attributed-cut mechanism)', () => {
    const b = computeFunding({ grossCents: 10000, platformFeePercent: LAUNCH, attributedCutPercent: 20 }, [deal()]);
    expect(b.attributedCutCents).toBe(2000);
    expect(b.artistNetCents).toBe(6800);
    expect(b.collaboratorReserveCents).toBe(3400);
    expectConserved(b);
  });

  it('discounted sale: the reserve follows the amount actually charged', () => {
    // SEC-006's lesson: never reserve against sticker price.
    const b = computeFunding({ grossCents: 5000, platformFeePercent: LAUNCH, attributedCutPercent: 0 }, [deal()]);
    expect(b.artistNetCents).toBe(4400);
    expect(b.collaboratorReserveCents).toBe(2200);
    expectConserved(b);
  });

  it('100% off: a real $0 charge reserves nothing and invents nothing', () => {
    const b = computeFunding({ grossCents: 0, platformFeePercent: LAUNCH, attributedCutPercent: 0 }, [deal()]);
    expect(b.collaboratorReserveCents).toBe(0);
    expect(b.artistProceedsCents).toBe(0);
    expect(b.applicationFeePercent).toBe(12);
    expectConserved(b);
  });

  it('capped deal: reserves only the remaining headroom', () => {
    const b = computeFunding({ grossCents: 10000, platformFeePercent: LAUNCH, attributedCutPercent: 0 },
      [deal({ cap_amount: 5000, already_accrued: 3000 })]);
    expect(b.collaboratorReserveCents).toBe(2000); // headroom, not the full 4400
    expect(b.artistProceedsCents).toBe(6800);
    expectConserved(b);
  });

  it('cap already reached: reserves nothing, artist keeps everything', () => {
    const b = computeFunding({ grossCents: 10000, platformFeePercent: LAUNCH, attributedCutPercent: 0 },
      [deal({ cap_amount: 5000, already_accrued: 5000 })]);
    expect(b.collaboratorReserveCents).toBe(0);
    expect(b.artistProceedsCents).toBe(8800);
    expectConserved(b);
  });

  it('multiple concurrent deals allocate in order without over-allocating', () => {
    const b = computeFunding({ grossCents: 10000, platformFeePercent: LAUNCH, attributedCutPercent: 0 },
      [deal({ id: 'a', percentage: 30 }), deal({ id: 'b', percentage: 20 })]);
    expect(b.perDeal).toEqual([
      { dealId: 'a', reserveCents: 2640 }, // 30% of 8800
      { dealId: 'b', reserveCents: 1760 }, // 20% of 8800
    ]);
    expect(b.collaboratorReserveCents).toBe(4400);
    expect(b.artistProceedsCents).toBe(4400);
    expectConserved(b);
  });

  it('total attempted allocation EXCEEDING artist net is clamped, never negative', () => {
    // Criterion I. Three 50% deals want 150% of the artist's net.
    const b = computeFunding({ grossCents: 10000, platformFeePercent: LAUNCH, attributedCutPercent: 0 },
      [deal({ id: 'a' }), deal({ id: 'b' }), deal({ id: 'c' })]);
    expect(b.collaboratorReserveCents).toBe(8800);   // exactly the artist's net, no more
    expect(b.artistProceedsCents).toBe(0);           // never negative
    expect(b.perDeal.map(d => d.reserveCents)).toEqual([4400, 4400, 0]);
    expect(crwnRevenueCents(b)).toBe(1200);          // CRWN's fee is untouched
    expectConserved(b);
  });

  it('gross_revenue basis deals still cannot exceed the artist net', () => {
    const b = computeFunding({ grossCents: 10000, platformFeePercent: LAUNCH, attributedCutPercent: 0 },
      [deal({ percentage: 95, payout_basis: 'gross_revenue' })]);
    expect(b.collaboratorReserveCents).toBe(8800);   // wanted 9500, clamped to net
    expect(b.artistProceedsCents).toBe(0);
    expectConserved(b);
  });

  it('CRWN revenue is the platform fee in every configuration (the ratified rule)', () => {
    const cases = [
      computeFunding({ grossCents: 10000, platformFeePercent: LAUNCH, attributedCutPercent: 0 }, []),
      computeFunding({ grossCents: 10000, platformFeePercent: LAUNCH, attributedCutPercent: 0 }, [deal()]),
      computeFunding({ grossCents: 10000, platformFeePercent: PRO, attributedCutPercent: 15 }, [deal({ percentage: 80 })]),
      computeFunding({ grossCents: 3337, platformFeePercent: SCALE, attributedCutPercent: 7 }, [deal({ percentage: 33 })]),
    ];
    for (const b of cases) {
      expect(crwnRevenueCents(b)).toBe(b.platformFeeCents);
      expectConserved(b);
    }
  });

  it('odd amounts stay exact in integer cents (no float drift)', () => {
    for (const gross of [1, 7, 99, 333, 1667, 9999, 123457]) {
      const b = computeFunding({ grossCents: gross, platformFeePercent: LAUNCH, attributedCutPercent: 3 }, [deal({ percentage: 37 })]);
      expectConserved(b);
      expect(Number.isInteger(b.collaboratorReserveCents)).toBe(true);
      expect(Number.isInteger(b.artistProceedsCents)).toBe(true);
    }
  });

  it('refund unwinds the reserve proportionally, so a refunded sale funds nobody', () => {
    const b = computeFunding({ grossCents: 10000, platformFeePercent: LAUNCH, attributedCutPercent: 0 }, [deal()]);
    expect(reserveClawback(b, 10000)).toEqual([{ dealId: 'd1', clawbackCents: 4400 }]); // full refund
    expect(reserveClawback(b, 5000)).toEqual([{ dealId: 'd1', clawbackCents: 2200 }]);  // partial
    expect(reserveClawback(b, 0)).toEqual([{ dealId: 'd1', clawbackCents: 0 }]);
    // A clawback can never exceed what was reserved.
    expect(reserveClawback(b, 999999)[0].clawbackCents).toBeLessThanOrEqual(4400);
  });

  it('the founder decisions are recorded and non-empty (they gate re-enabling cashout)', () => {
    expect(FUNDING_OPEN_QUESTIONS.length).toBe(3);
    for (const q of FUNDING_OPEN_QUESTIONS) expect(q.length).toBeGreaterThan(20);
  });
});

describe('Team Split funding — the rail stays closed until funded', () => {
  it('cashout route still fails closed', async () => {
    const { readStripped } = await import('../architecture/sourceScan');
    const src = readStripped('src/app/api/stripe/team-split-cashout/route.ts');
    expect(src.length, 'positive control: cashout route is readable').toBeGreaterThan(200);
    // Until the reserve is wired into checkout, paying a collaborator draws on
    // CRWN's balance. The 503 is what prevents that.
    expect(src).toContain('cashoutFundingReady');
    expect(src).toContain('TEAM_SPLIT_FUNDING_PENDING');
  });
});
