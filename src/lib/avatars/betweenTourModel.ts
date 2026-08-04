// The Between-Tour Revenue model: what the months between shows are worth when VIP buyers and
// concert fans become recurring members instead of one-night transactions.
//
// Pure and deterministic. Versioned so stored results can be told apart from any future retune.
//
// HONESTY RULES:
//  - No fan is counted twice. Annual attendance is deflated to UNIQUE attendees (repeat visits
//    assumption, stated), VIP buyers are subtracted out of the attendee pool before attendee
//    conversion is applied, and the paid-livestream line sells only to reachable fans who did NOT
//    become members. Every person is a member or a non-member, never both.
//  - Membership totals are capped by the same maxConversion ceiling the unified model uses, so no
//    stack of assumptions can run away.
//  - The recurring number is annualized as x12 and nothing longer.
//
// VIP_CONVERSION is the one rate with no repo precedent: the share of proven VIP buyers who take
// a recurring VIP membership when personally offered one. It is a documented judgement call,
// deliberately far below 100% of people who already paid a VIP price once, and it is surfaced in
// the artist-facing assumptions block and moved by the scenario band.

import { RECOMMENDED_LADDER } from '../tierTemplate';

export const BETWEEN_TOUR_MODEL_VERSION = 'betweenTour@1';

export interface BetweenTourAssumptions {
  /** Share of annual attendance that is repeat visits by the same fans. */
  repeatAttendance: number;
  /** Share of proven VIP buyers who join a recurring VIP membership when offered. */
  vipConversion: number;
  /** Share of unique NON-VIP attendees who join. */
  attendeeConversion: number;
  /** Share of a following that ever actually sees a post. leadCalculator conservative preset. */
  reachRate: number;
  /** Hard ceiling on total conversion of the reachable audience. Unified model parity. */
  maxConversion: number;
  /** Monthly price of the recurring VIP access tier. Gold on the canonical ladder. Cents. */
  vipTierCents: number;
  /** One-off livestream ticket for non-members, between tours. Live Experience parity. Cents. */
  streamTicketCents: number;
  /** Share of reachable NON-members who buy that ticket. Live Experience parity. */
  streamTicketRate: number;
}

export function getBetweenTourAssumptions(): BetweenTourAssumptions {
  return {
    repeatAttendance: 0.3,
    vipConversion: 0.25,
    attendeeConversion: 0.005,
    reachRate: 0.15,
    maxConversion: 0.1,
    vipTierCents: RECOMMENDED_LADDER[2].priceCents,
    streamTicketCents: 1500,
    streamTicketRate: 0.005,
  };
}

export interface BetweenTourInputs {
  /** Shows or tour dates per year. */
  showsPerYear: number;
  /** Average attendance per show. */
  avgAttendance: number;
  /** VIP / meet-and-greet buyers per show. */
  vipBuyersPerShow: number;
  /** Average VIP or premium ticket spend. Cents. Context + proof, not multiplied into recurring. */
  avgVipPriceCents: number;
  /** Audience (largest platform figure, never a sum). */
  audience: number;
  /** Months per year with no touring income. Defaults to 8 when absent. */
  offMonths: number;
}

export interface BetweenTourResult {
  modelVersion: string;
  assumptions: BetweenTourAssumptions;
  showsPerYear: number;
  offMonths: number;
  /** Unique people through the door in a year, repeat visits removed. */
  uniqueAttendees: number;
  /** Unique VIP buyers in a year (same repeat deflation). */
  uniqueVipBuyers: number;
  /** VIP buyers who become recurring members. */
  vipMembers: number;
  /** Non-VIP attendees who become recurring members. */
  attendeeMembers: number;
  /** Total recurring members after the conversion ceiling. */
  members: number;
  /** Monthly recurring membership revenue. Cents. */
  recurringMonthlyCents: number;
  recurringAnnualCents: number;
  /** One paid livestream per off-tour month, sold only to reachable non-members. Cents/stream. */
  streamRevenuePerEventCents: number;
  /** Those streams averaged across the year. Cents/month. */
  streamMonthlyAvgCents: number;
  /** Recurring + averaged stream revenue. Cents/month. */
  totalMonthlyCents: number;
  totalAnnualCents: number;
  /** Context: what one year of shows currently grosses in VIP alone. Cents. */
  currentVipAnnualCents: number;
}

const clampCount = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const clampCents = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

export function computeBetweenTour(
  raw: Partial<BetweenTourInputs>,
  a: BetweenTourAssumptions = getBetweenTourAssumptions(),
): BetweenTourResult {
  const shows = clampCount(raw.showsPerYear);
  const attendance = clampCount(raw.avgAttendance);
  const vipPerShow = clampCount(raw.vipBuyersPerShow);
  const vipPrice = clampCents(raw.avgVipPriceCents);
  const audience = clampCount(raw.audience);
  const offMonths = Math.min(12, Math.max(0, clampCount(raw.offMonths) || 8));

  // Unique people, not turnstile counts. VIP buyers deflate by the same repeat factor, and they
  // are a SUBSET of attendees, so they are subtracted before attendee conversion runs.
  const uniqueFactor = 1 - a.repeatAttendance;
  const uniqueAttendees = Math.round(shows * attendance * uniqueFactor);
  const uniqueVipBuyers = Math.min(Math.round(shows * vipPerShow * uniqueFactor), uniqueAttendees);
  const nonVipAttendees = uniqueAttendees - uniqueVipBuyers;

  const vipMembers = Math.round(uniqueVipBuyers * a.vipConversion);
  const attendeeMembers = Math.round(nonVipAttendees * a.attendeeConversion);

  // Ceiling: members can never exceed maxConversion of the larger of (reachable audience,
  // unique attendees). Attendees are real proven reach even for an artist with no social pull.
  const reachable = Math.max(Math.round(audience * a.reachRate), uniqueAttendees);
  const memberCap = Math.round(reachable * a.maxConversion);
  const members = Math.min(vipMembers + attendeeMembers, memberCap);

  const recurringMonthlyCents = members * a.vipTierCents;

  // One paid livestream per off-tour month, sold ONLY to reachable fans who are not members.
  const nonMemberReachable = Math.max(0, reachable - members);
  const streamBuyers = Math.round(nonMemberReachable * a.streamTicketRate);
  const streamRevenuePerEventCents = streamBuyers * a.streamTicketCents;
  const streamMonthlyAvgCents = Math.round((streamRevenuePerEventCents * offMonths) / 12);

  const totalMonthlyCents = recurringMonthlyCents + streamMonthlyAvgCents;

  return {
    modelVersion: BETWEEN_TOUR_MODEL_VERSION,
    assumptions: a,
    showsPerYear: shows,
    offMonths,
    uniqueAttendees,
    uniqueVipBuyers,
    vipMembers,
    attendeeMembers,
    members,
    recurringMonthlyCents,
    recurringAnnualCents: recurringMonthlyCents * 12,
    streamRevenuePerEventCents,
    streamMonthlyAvgCents,
    totalMonthlyCents,
    totalAnnualCents: totalMonthlyCents * 12,
    currentVipAnnualCents: shows * vipPerShow * vipPrice,
  };
}

/** Conservative / expected / high band, varying only the VIP conversion rate. */
export function betweenTourScenarios(raw: Partial<BetweenTourInputs>): {
  conservative: BetweenTourResult;
  expected: BetweenTourResult;
  high: BetweenTourResult;
} {
  const base = getBetweenTourAssumptions();
  return {
    conservative: computeBetweenTour(raw, { ...base, vipConversion: 0.15 }),
    expected: computeBetweenTour(raw, base),
    high: computeBetweenTour(raw, { ...base, vipConversion: 0.4 }),
  };
}
