import { describe, it, expect } from 'vitest';
import { countsAsPaying, isPrizeActive, isPrizeScheduled } from './prizeState';

/**
 * The prize-membership accounting rule, tested through the SAME function every MRR reader
 * calls (constraint assembler, roadmap, analytics), not a mirror of it.
 *
 * Two fictions are guarded against here, in opposite directions:
 *   1. an ACTIVE prize Platinum reported as $50/month nobody pays (the original bug)
 *   2. a SCHEDULED prize erasing a paying Gold member's real $25 months before the prize
 *      begins (the bug the first fix would have introduced)
 */

type Sub = { tier_id: string | null; status: string | null; prize_campaign_id?: string | null; pending_change_date?: string | null };
const PRICES = new Map([['bronze', 0], ['silver', 1000], ['gold', 2500], ['platinum', 5000]]);
const NOW = new Date('2026-09-04T12:00:00Z');
const FUTURE = '2026-10-04T00:00:00Z';
const PAST = '2026-08-04T00:00:00Z';

function derive(subs: Sub[], now = NOW) {
  const priceOf = (s: Sub) => (s.tier_id ? PRICES.get(s.tier_id) ?? 0 : 0);
  const active = subs.filter((s) => s.status === 'active');
  const paid = active.filter((s) => countsAsPaying(s, priceOf(s), now));
  return {
    members: active.length,
    freeMembers: active.filter((s) => priceOf(s) === 0).length,
    paidMembers: paid.length,
    mrrCents: paid.reduce((sum, s) => sum + priceOf(s), 0),
  };
}

describe('an ACTIVE prize member is a member, not a payer', () => {
  it('an immediate prize Platinum (no boundary date) adds a member and ZERO mrr', () => {
    const d = derive([{ tier_id: 'platinum', status: 'active', prize_campaign_id: 'camp-1', pending_change_date: null }]);
    expect(d.members).toBe(1);
    expect(d.paidMembers).toBe(0);
    expect(d.mrrCents).toBe(0);
  });

  it('a scheduled prize whose boundary has PASSED is active, even before the webhook tidies the date', () => {
    const s = { tier_id: 'platinum', status: 'active', prize_campaign_id: 'camp-1', pending_change_date: PAST };
    expect(isPrizeActive(s, NOW)).toBe(true);
    expect(derive([s]).mrrCents).toBe(0);
  });

  it('a real Platinum still adds $50 of mrr', () => {
    const d = derive([{ tier_id: 'platinum', status: 'active', prize_campaign_id: null }]);
    expect(d.paidMembers).toBe(1);
    expect(d.mrrCents).toBe(5000);
  });

  it('an artist whose only paid-tier member is an active prize winner has ZERO mrr', () => {
    // The case that matters: without this, CRWN would tell GB he had $50/month and the
    // Constraint Engine would move him off the road to a first paying member.
    const d = derive([
      { tier_id: 'bronze', status: 'active' },
      { tier_id: 'platinum', status: 'active', prize_campaign_id: 'camp-1' },
    ]);
    expect(d.members).toBe(2);
    expect(d.paidMembers).toBe(0);
    expect(d.mrrCents).toBe(0);
  });
});

describe('a SCHEDULED prize does not erase the revenue the fan is still paying', () => {
  it('a Gold member with a prize scheduled at their next renewal still counts as paying $25', () => {
    const s = { tier_id: 'gold', status: 'active', prize_campaign_id: 'camp-1', pending_change_date: FUTURE };
    expect(isPrizeScheduled(s, NOW)).toBe(true);
    expect(isPrizeActive(s, NOW)).toBe(false);
    const d = derive([s]);
    expect(d.paidMembers).toBe(1);
    expect(d.mrrCents).toBe(2500);
  });

  it('an existing Platinum winner keeps contributing $50 until the boundary, then $0', () => {
    const s = { tier_id: 'platinum', status: 'active', prize_campaign_id: 'camp-1', pending_change_date: FUTURE };
    expect(derive([s], NOW).mrrCents).toBe(5000);
    expect(derive([s], new Date('2026-10-04T00:00:00Z')).mrrCents).toBe(0);
    expect(derive([s], new Date('2026-10-05T00:00:00Z')).mrrCents).toBe(0);
  });

  it('the boundary instant itself is the first moment the prize is active', () => {
    const s = { tier_id: 'gold', status: 'active', prize_campaign_id: 'camp-1', pending_change_date: FUTURE };
    expect(isPrizeActive(s, new Date('2026-10-03T23:59:59Z'))).toBe(false);
    expect(isPrizeActive(s, new Date('2026-10-04T00:00:00Z'))).toBe(true);
  });

  it('mixed roster: active prizes drop out of money, scheduled ones stay in', () => {
    const d = derive([
      { tier_id: 'platinum', status: 'active', prize_campaign_id: 'camp-1' }, // active prize
      { tier_id: 'gold', status: 'active', prize_campaign_id: 'camp-2', pending_change_date: FUTURE }, // scheduled
      { tier_id: 'silver', status: 'active' },
      { tier_id: 'bronze', status: 'active' },
    ]);
    expect(d.members).toBe(4);
    expect(d.freeMembers).toBe(1);
    expect(d.paidMembers).toBe(2);
    expect(d.mrrCents).toBe(3500); // 2500 (scheduled Gold, still paying) + 1000
  });
});

describe('edges the money rule must not guess on', () => {
  it('a canceled prize row is neither a member nor a payer', () => {
    const d = derive([{ tier_id: 'platinum', status: 'canceled', prize_campaign_id: 'camp-1' }]);
    expect(d.members).toBe(0);
    expect(d.paidMembers).toBe(0);
  });

  it('a prize row with an unparseable boundary is treated as ACTIVE (never as revenue)', () => {
    const s = { tier_id: 'platinum', status: 'active', prize_campaign_id: 'camp-1', pending_change_date: 'not a date' };
    expect(isPrizeActive(s, NOW)).toBe(true);
    expect(derive([s]).mrrCents).toBe(0);
  });

  it('a pending_change_date WITHOUT a prize is an ordinary scheduled downgrade and still pays', () => {
    const s = { tier_id: 'gold', status: 'active', prize_campaign_id: null, pending_change_date: FUTURE };
    expect(isPrizeActive(s, NOW)).toBe(false);
    expect(derive([s]).mrrCents).toBe(2500);
  });

  it('a free tier never counts as paying, prize or not', () => {
    expect(countsAsPaying({ status: 'active' }, 0, NOW)).toBe(false);
    expect(countsAsPaying({ status: 'active', prize_campaign_id: 'c' }, 0, NOW)).toBe(false);
  });
});
