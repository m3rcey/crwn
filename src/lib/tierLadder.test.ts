import { describe, it, expect } from 'vitest';
import { ladderOrder, expandFromTier, rungFromAllowList, describeTierAccess } from './tierLadder';

// GB's real ladder, including the renamed free rung, so the tests exercise the case that
// makes name-based ordering wrong.
const GB = [
  { id: 'gold', name: 'Gold', price: 2500 },
  { id: 'economy', name: 'Economy', price: 0 },
  { id: 'platinum', name: 'Platinum', price: 5000 },
  { id: 'silver', name: 'Silver', price: 1000 },
];

describe('ladderOrder', () => {
  it('orders by PRICE, not by name or input order', () => {
    expect(ladderOrder(GB).map((t) => t.id)).toEqual(['economy', 'silver', 'gold', 'platinum']);
  });
  it('is stable when two rungs share a price', () => {
    const tied = [{ id: 'b', name: 'B', price: 1000 }, { id: 'a', name: 'A', price: 1000 }];
    expect(ladderOrder(tied).map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('expandFromTier — the cumulative rule', () => {
  it('Silver means Silver, Gold and Platinum', () => {
    expect(expandFromTier(GB, 'silver').sort()).toEqual(['gold', 'platinum', 'silver']);
  });
  it('Gold means Gold and Platinum', () => {
    expect(expandFromTier(GB, 'gold').sort()).toEqual(['gold', 'platinum']);
  });
  it('the top rung means only itself', () => {
    expect(expandFromTier(GB, 'platinum')).toEqual(['platinum']);
  });
  it('the free rung means everyone with a membership', () => {
    expect(expandFromTier(GB, 'economy').sort()).toEqual(['economy', 'gold', 'platinum', 'silver']);
  });
  it('an unknown or missing id admits NOBODY, never everybody', () => {
    expect(expandFromTier(GB, 'deleted-tier')).toEqual([]);
    expect(expandFromTier(GB, null)).toEqual([]);
    expect(expandFromTier(GB, '')).toEqual([]);
  });
  it('the paying fan is never left out of a cheaper rung (the whole point)', () => {
    for (const rung of ['economy', 'silver', 'gold']) {
      expect(expandFromTier(GB, rung)).toContain('platinum');
    }
  });
});

describe('rungFromAllowList', () => {
  it('reads a cumulative list back as its lowest rung', () => {
    expect(rungFromAllowList(GB, ['silver', 'gold', 'platinum'])).toBe('silver');
    expect(rungFromAllowList(GB, ['platinum'])).toBe('platinum');
  });
  it('refuses to tidy a hand-picked set, so the editor shows the truth', () => {
    expect(rungFromAllowList(GB, ['silver', 'platinum'])).toBeNull();
    expect(rungFromAllowList(GB, ['silver', 'gold'])).toBeNull();
  });
  it('empty and malformed read as no rung', () => {
    expect(rungFromAllowList(GB, [])).toBeNull();
    expect(rungFromAllowList(GB, null)).toBeNull();
    expect(rungFromAllowList(GB, 'silver')).toBeNull();
  });
});

describe('describeTierAccess', () => {
  it('names what a selection actually admits', () => {
    expect(describeTierAccess(GB, [], true)).toBe('Everyone');
    expect(describeTierAccess(GB, ['silver', 'gold', 'platinum'], false)).toBe('Silver and above');
    expect(describeTierAccess(GB, ['platinum'], false)).toBe('Platinum only');
    expect(describeTierAccess(GB, [], false)).toBe('Nobody yet');
  });
  it('lists a hand-picked set rather than pretending it is a rung', () => {
    expect(describeTierAccess(GB, ['silver', 'platinum'], false)).toBe('Silver, Platinum');
  });
});
