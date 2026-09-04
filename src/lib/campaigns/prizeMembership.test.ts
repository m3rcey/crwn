import { describe, it, expect } from 'vitest';

/**
 * The prize-membership rule, expressed against the SAME derivation the Constraint Engine
 * assembler uses: a prize subscription is a member and not a payer.
 *
 * These pin the arithmetic rather than the database call, because the arithmetic is where
 * the fiction would live: MRR came from the TIER'S price, so a comped Platinum would have
 * reported $50/month nobody pays.
 */

type Sub = { tier_id: string | null; status: string | null; prize_campaign_id?: string | null };
const PRICES = new Map([['bronze', 0], ['silver', 1000], ['gold', 2500], ['platinum', 5000]]);

/** Mirrors assembler.ts. */
function derive(subs: Sub[]) {
  const priceOf = (s: Sub) => (s.tier_id ? PRICES.get(s.tier_id) ?? 0 : 0);
  const isPrize = (s: Sub) => !!s.prize_campaign_id;
  const active = subs.filter((s) => s.status === 'active');
  const paid = active.filter((s) => priceOf(s) > 0 && !isPrize(s));
  return {
    members: active.length,
    freeMembers: active.filter((s) => priceOf(s) === 0).length,
    paidMembers: paid.length,
    mrrCents: paid.reduce((sum, s) => sum + priceOf(s), 0),
  };
}

describe('a prize member is a member, not a payer', () => {
  it('a prize Platinum adds a member and ZERO mrr', () => {
    const d = derive([{ tier_id: 'platinum', status: 'active', prize_campaign_id: 'camp-1' }]);
    expect(d.members).toBe(1);
    expect(d.paidMembers).toBe(0);
    expect(d.mrrCents).toBe(0);
  });

  it('a real Platinum still adds $50 of mrr', () => {
    const d = derive([{ tier_id: 'platinum', status: 'active', prize_campaign_id: null }]);
    expect(d.paidMembers).toBe(1);
    expect(d.mrrCents).toBe(5000);
  });

  it('mixed roster: only the payers count toward money', () => {
    const d = derive([
      { tier_id: 'platinum', status: 'active', prize_campaign_id: 'camp-1' }, // the winner
      { tier_id: 'gold', status: 'active' },
      { tier_id: 'silver', status: 'active' },
      { tier_id: 'bronze', status: 'active' },
    ]);
    expect(d.members).toBe(4);
    expect(d.freeMembers).toBe(1);
    expect(d.paidMembers).toBe(2);
    expect(d.mrrCents).toBe(3500); // 2500 + 1000, NOT 8500
  });

  it('an artist whose only paid-tier member is a prize winner has ZERO mrr', () => {
    // The case that matters: without this, CRWN would tell GB he had $50/month and the
    // Constraint Engine would move him off the road to a first paying member.
    const d = derive([
      { tier_id: 'bronze', status: 'active' },
      { tier_id: 'platinum', status: 'active', prize_campaign_id: 'camp-1' },
    ]);
    expect(d.paidMembers).toBe(0);
    expect(d.mrrCents).toBe(0);
  });

  it('a cancelled prize contributes nothing at all', () => {
    const d = derive([{ tier_id: 'platinum', status: 'canceled', prize_campaign_id: 'camp-1' }]);
    expect(d).toEqual({ members: 0, freeMembers: 0, paidMembers: 0, mrrCents: 0 });
  });

  it('PRE-MIGRATION: rows with no prize column behave exactly as today', () => {
    const before = derive([{ tier_id: 'platinum', status: 'active' }]);
    expect(before.paidMembers).toBe(1);
    expect(before.mrrCents).toBe(5000);
  });
});
