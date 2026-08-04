import { describe, it, expect } from 'vitest';
import {
  computeBetweenTour,
  betweenTourScenarios,
  getBetweenTourAssumptions,
  BETWEEN_TOUR_MODEL_VERSION,
} from './betweenTourModel';
import { RECOMMENDED_LADDER } from '../tierTemplate';

const BASE = {
  showsPerYear: 40,
  avgAttendance: 300,
  vipBuyersPerShow: 10,
  avgVipPriceCents: 7500,
  audience: 200000,
  offMonths: 8,
};

describe('between-tour model', () => {
  it('is versioned and prices the VIP tier off the canonical ladder', () => {
    expect(BETWEEN_TOUR_MODEL_VERSION).toBe('betweenTour@1');
    expect(getBetweenTourAssumptions().vipTierCents).toBe(RECOMMENDED_LADDER[2].priceCents);
  });

  it('deflates attendance to unique fans before any conversion runs', () => {
    const r = computeBetweenTour(BASE);
    const a = getBetweenTourAssumptions();
    expect(r.uniqueAttendees).toBe(Math.round(BASE.showsPerYear * BASE.avgAttendance * (1 - a.repeatAttendance)));
    expect(r.uniqueAttendees).toBeLessThan(BASE.showsPerYear * BASE.avgAttendance);
  });

  it('VIP buyers are a subset of attendees, and non-VIP conversion excludes them (no double count)', () => {
    const r = computeBetweenTour(BASE);
    expect(r.uniqueVipBuyers).toBeLessThanOrEqual(r.uniqueAttendees);
    const a = getBetweenTourAssumptions();
    expect(r.attendeeMembers).toBe(Math.round((r.uniqueAttendees - r.uniqueVipBuyers) * a.attendeeConversion));
  });

  it('members are capped by the conversion ceiling', () => {
    const r = computeBetweenTour({ ...BASE, audience: 0, showsPerYear: 100, avgAttendance: 50, vipBuyersPerShow: 50 });
    const a = getBetweenTourAssumptions();
    const reachable = Math.max(Math.round(0 * a.reachRate), r.uniqueAttendees);
    expect(r.members).toBeLessThanOrEqual(Math.round(reachable * a.maxConversion));
  });

  it('stream tickets are sold ONLY to non-members: disjoint populations', () => {
    const r = computeBetweenTour(BASE);
    const a = getBetweenTourAssumptions();
    const reachable = Math.max(Math.round(BASE.audience * a.reachRate), r.uniqueAttendees);
    const nonMembers = reachable - r.members;
    expect(r.streamRevenuePerEventCents).toBe(Math.round(nonMembers * a.streamTicketRate) * a.streamTicketCents);
  });

  it('VIP price is context only: it never multiplies into the recurring figure', () => {
    const cheap = computeBetweenTour({ ...BASE, avgVipPriceCents: 1000 });
    const dear = computeBetweenTour({ ...BASE, avgVipPriceCents: 50000 });
    expect(cheap.recurringMonthlyCents).toBe(dear.recurringMonthlyCents);
    expect(dear.currentVipAnnualCents).toBeGreaterThan(cheap.currentVipAnnualCents);
  });

  it('all zeros produce an honest zero', () => {
    const r = computeBetweenTour({});
    expect(r.totalMonthlyCents).toBe(0);
    expect(r.members).toBe(0);
    expect(r.uniqueAttendees).toBe(0);
  });

  it('off-months default to 8 and clamp to 0..12', () => {
    expect(computeBetweenTour(BASE).offMonths).toBe(8);
    expect(computeBetweenTour({ ...BASE, offMonths: 40 }).offMonths).toBe(12);
  });

  it('annual is exactly 12x monthly', () => {
    const r = computeBetweenTour(BASE);
    expect(r.totalAnnualCents).toBe(r.totalMonthlyCents * 12);
    expect(r.recurringAnnualCents).toBe(r.recurringMonthlyCents * 12);
  });

  it('scenario band is monotone in VIP conversion', () => {
    const s = betweenTourScenarios(BASE);
    expect(s.conservative.totalMonthlyCents).toBeLessThanOrEqual(s.expected.totalMonthlyCents);
    expect(s.expected.totalMonthlyCents).toBeLessThanOrEqual(s.high.totalMonthlyCents);
  });

  it('handles very large inputs without NaN or negatives', () => {
    const r = computeBetweenTour({ ...BASE, showsPerYear: 365, avgAttendance: 100000, audience: 100_000_000 });
    expect(Number.isFinite(r.totalMonthlyCents)).toBe(true);
    expect(r.totalMonthlyCents).toBeGreaterThanOrEqual(0);
  });
});
