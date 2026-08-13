// TS-MONEY-006: over-commitment is refused. The exact cases from the ratified D4 decision.
import { describe, it, expect } from 'vitest';
import {
  BINDING_STATUSES,
  MAX_COMMITTED_PERCENT_OF_NET,
  claimAsPercentOfNet,
  commitmentErrorMessage,
  resolveScope,
  scopesOverlap,
  validateCommitment,
  type CommitmentDeal,
} from './commitment';

const LAUNCH_FEE = 12;

const deal = (over: Partial<CommitmentDeal> & { id: string }): CommitmentDeal => ({
  status: 'active',
  percentage: 50,
  payout_basis: 'net_artist_revenue',
  scope: { kind: 'source', src: 'product', id: 'P1' },
  ...over,
});

const check = (candidate: CommitmentDeal, existing: CommitmentDeal[]) =>
  validateCommitment({ candidate, existing, platformFeePercent: LAUNCH_FEE });

describe('scope resolution mirrors the accrual fences', () => {
  it('fenced sources resolve to (type, id)', () => {
    expect(resolveScope('product', 'P1')).toEqual({ kind: 'source', src: 'product', id: 'P1' });
    expect(resolveScope('tier', 'T1')).toEqual({ kind: 'source', src: 'tier', id: 'T1' });
  });

  it('custom, none, and a fence with no id commit nothing', () => {
    expect(resolveScope('custom', 'X').kind).toBe('unfenced');
    expect(resolveScope('none', 'X').kind).toBe('unfenced');
    expect(resolveScope('product', null).kind).toBe('unfenced');
  });

  it('a road campaign collapses to its linked source, and is unfenced when unresolvable', () => {
    expect(resolveScope('road_campaign', 'C1', { src: 'tier', id: 'T9' })).toEqual({
      kind: 'source', src: 'tier', id: 'T9',
    });
    expect(resolveScope('road_campaign', 'C1', null).kind).toBe('unfenced');
  });
});

describe('overlap is per-scope, not per-artist', () => {
  const p1 = { kind: 'source', src: 'product', id: 'P1' } as const;
  const p2 = { kind: 'source', src: 'product', id: 'P2' } as const;
  const t1 = { kind: 'source', src: 'tier', id: 'P1' } as const; // same id, different type

  it('same source overlaps', () => expect(scopesOverlap(p1, p1)).toBe(true));
  it('different sources do not', () => expect(scopesOverlap(p1, p2)).toBe(false));
  it('same id under a different type does not', () => expect(scopesOverlap(p1, t1)).toBe(false));
  it('all_earnings overlaps everything fenceable', () => {
    expect(scopesOverlap({ kind: 'all_earnings' }, p1)).toBe(true);
    expect(scopesOverlap(p2, { kind: 'all_earnings' })).toBe(true);
    expect(scopesOverlap({ kind: 'all_earnings' }, { kind: 'all_earnings' })).toBe(true);
  });
  it('unfenced overlaps nothing, including all_earnings', () => {
    expect(scopesOverlap({ kind: 'unfenced' }, { kind: 'all_earnings' })).toBe(false);
    expect(scopesOverlap({ kind: 'unfenced' }, p1)).toBe(false);
  });
});

describe('TS-MONEY-006 — the ratified acceptance cases', () => {
  // MUTATION: change the comparison to >= or drop the overlap test. These fail.
  it('same product 60 + 50 is REJECTED', () => {
    const r = check(deal({ id: 'new', percentage: 60 }), [deal({ id: 'a', percentage: 50 })]);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('over_committed');
    expect(r.totalPercentOfNet).toBe(110);
  });

  it('different products 60 + 50 is ALLOWED', () => {
    const r = check(
      deal({ id: 'new', percentage: 60, scope: { kind: 'source', src: 'product', id: 'P1' } }),
      [deal({ id: 'a', percentage: 50, scope: { kind: 'source', src: 'product', id: 'P2' } })],
    );
    expect(r.ok).toBe(true);
    expect(r.conflicts).toEqual([]);
  });

  it('all_earnings 60 + product 50 is REJECTED for that overlap', () => {
    const r = check(
      deal({ id: 'new', percentage: 60, scope: { kind: 'all_earnings' } }),
      [deal({ id: 'a', percentage: 50, scope: { kind: 'source', src: 'product', id: 'P1' } })],
    );
    expect(r.ok).toBe(false);
    expect(r.totalPercentOfNet).toBe(110);
  });

  it('same source 50 + 50 is ALLOWED (exactly 100 is payable)', () => {
    const r = check(deal({ id: 'new', percentage: 50 }), [deal({ id: 'a', percentage: 50 })]);
    expect(r.ok).toBe(true);
    expect(r.totalPercentOfNet).toBe(100);
  });

  it('50 + 50 + 1 is REJECTED', () => {
    const r = check(deal({ id: 'new', percentage: 1 }), [
      deal({ id: 'a', percentage: 50 }),
      deal({ id: 'b', percentage: 50 }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.totalPercentOfNet).toBe(101);
    expect(r.conflicts).toHaveLength(2);
  });

  it('a CAP does not excuse an over-commitment', () => {
    // The candidate carries no cap field at all: D4 is a contract rule about percentages, and cap
    // headroom is optimistic timing that cannot be relied on at acceptance.
    const r = check(deal({ id: 'new', percentage: 60 }), [deal({ id: 'a', percentage: 50 })]);
    expect(r.ok).toBe(false);
  });

  it('only BINDING statuses count: a draft or a rejected invite blocks nothing', () => {
    for (const status of ['draft', 'sent', 'viewed', 'changes_requested', 'cancelled', 'terminated', 'expired']) {
      const r = check(deal({ id: 'new', percentage: 60 }), [deal({ id: 'a', percentage: 50, status })]);
      expect(r.ok, `status ${status} must not block`).toBe(true);
    }
    for (const status of BINDING_STATUSES) {
      const r = check(deal({ id: 'new', percentage: 60 }), [deal({ id: 'a', percentage: 50, status })]);
      expect(r.ok, `status ${status} must block`).toBe(false);
    }
  });

  it('an unfenced candidate commits nothing and is always allowed', () => {
    const r = check(deal({ id: 'new', percentage: 90, scope: { kind: 'unfenced' } }), [
      deal({ id: 'a', percentage: 90, scope: { kind: 'all_earnings' } }),
    ]);
    expect(r.ok).toBe(true);
    expect(r.totalPercentOfNet).toBe(0);
  });

  it('re-evaluating the SAME deal does not count it twice', () => {
    const existing = deal({ id: 'same', percentage: 60 });
    const r = check(existing, [existing]);
    expect(r.ok).toBe(true);
    expect(r.totalPercentOfNet).toBe(60);
  });
});

describe('a gross-basis percentage is a BIGGER claim than the same number on net', () => {
  it('88% of gross is 100% of net at the Launch fee', () => {
    const claim = claimAsPercentOfNet(
      deal({ id: 'g', percentage: 88, payout_basis: 'gross_revenue' }),
      LAUNCH_FEE,
    );
    expect(Math.round(claim)).toBe(100);
  });

  it('89% of gross is therefore REJECTED on its own', () => {
    const r = check(deal({ id: 'new', percentage: 89, payout_basis: 'gross_revenue' }), []);
    expect(r.ok).toBe(false);
  });

  it('the conversion tracks the plan fee: a Scale artist keeps more, so the same claim is smaller', () => {
    const launch = claimAsPercentOfNet(deal({ id: 'g', percentage: 50, payout_basis: 'gross_revenue' }), 12);
    const scale = claimAsPercentOfNet(deal({ id: 'g', percentage: 50, payout_basis: 'gross_revenue' }), 5);
    expect(launch).toBeGreaterThan(scale);
    expect(scale).toBeGreaterThan(50);
  });

  it('a net-basis claim is unchanged by the plan fee', () => {
    expect(claimAsPercentOfNet(deal({ id: 'n', percentage: 50 }), 12)).toBe(50);
    expect(claimAsPercentOfNet(deal({ id: 'n', percentage: 50 }), 5)).toBe(50);
  });
});

describe('the refusal is explainable and leaks nothing', () => {
  const r = check(deal({ id: 'new', percentage: 60 }), [deal({ id: 'a', percentage: 50 })]);
  const msg = commitmentErrorMessage(r);

  it('says what is wrong in money terms', () => {
    expect(msg).toContain('110%');
    expect(msg.toLowerCase()).toContain('overlaps');
  });

  it('names no table, column, Stripe object or deal id', () => {
    for (const leak of ['team_split', 'stripe', 'sql', 'postgres', 'uuid', 'null', 'P1', 'application_fee']) {
      expect(msg.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });

  it('never suggests CRWN silently reduced the percentage', () => {
    expect(msg.toLowerCase()).not.toContain('adjusted');
    expect(msg.toLowerCase()).not.toContain('reduced it');
  });

  it('writes no em dash (CLAUDE.md copy rule)', () => {
    expect(msg).not.toContain('—');
    expect(msg).not.toContain('–');
  });
});

describe('the ceiling is exactly 100 percent of net', () => {
  it('is not quietly widened', () => {
    expect(MAX_COMMITTED_PERCENT_OF_NET).toBe(100);
  });
});
