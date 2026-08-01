// The recommended ladder is Bronze / Silver / Gold / Platinum at 0 / $10 / $25 / $100.
//
// WHY THIS TEST EXISTS: the ladder was previously protected only by a paragraph in
// CLAUDE.md, and strategy documents keep proposing their own tier names (First
// Listen, Inner Circle, Executive, Vault, ...). Those names describe a fan's ROLE
// in a membership strategy; they are not the ladder. Implementing a strategy doc
// must MAP onto these four rungs, never rename them. An assertion fails loudly;
// a paragraph does not.
//
// Artists may rename their own tiers freely. This pins the DEFAULT only.

import { describe, expect, it } from 'vitest';
import { RECOMMENDED_LADDER, normalizeTierName, tierNameAliases } from './tierTemplate';

describe('RECOMMENDED_LADDER', () => {
  it('is exactly Bronze / Silver / Gold / Platinum at 0 / 1000 / 2500 / 10000 cents', () => {
    expect(RECOMMENDED_LADDER.map((t) => t.name)).toEqual(['Bronze', 'Silver', 'Gold', 'Platinum']);
    expect(RECOMMENDED_LADDER.map((t) => t.priceCents)).toEqual([0, 1000, 2500, 10000]);
  });

  it('keeps the internal keys unchanged (they are referenced across calculators and drafts)', () => {
    expect(RECOMMENDED_LADDER.map((t) => t.key)).toEqual(['wave', 'inner_circle', 'vault', 'throne']);
  });

  it('never drops a legacy name, or an artist who applied the old ladder gets a duplicate rung', () => {
    const legacy = RECOMMENDED_LADDER.flatMap((t) => t.legacyNames);
    for (const name of ['The Wave', 'Inner Circle', 'The Vault', 'Throne']) {
      expect(legacy).toContain(name);
    }
  });

  it('has exactly one free front door, and it is the first rung', () => {
    const free = RECOMMENDED_LADDER.filter((t) => t.priceCents === 0);
    expect(free).toHaveLength(1);
    expect(RECOMMENDED_LADDER[0].priceCents).toBe(0);
  });

  it('prices ascend, so the ladder reads as a ladder', () => {
    const prices = RECOMMENDED_LADDER.map((t) => t.priceCents);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it('matches a rung the artist named with a leading "The"', () => {
    // Production carries both "Inner Circle" and "The Inner Circle", and both
    // "Throne" and "The Throne" (verified 2026-08-01). Exact matching offered
    // those artists a duplicate rung they already had.
    const silver = RECOMMENDED_LADDER.find((t) => t.key === 'inner_circle')!;
    const platinum = RECOMMENDED_LADDER.find((t) => t.key === 'throne')!;
    expect(tierNameAliases(silver)).toContain(normalizeTierName('The Inner Circle'));
    expect(tierNameAliases(platinum)).toContain(normalizeTierName('The Throne'));
    expect(tierNameAliases(RECOMMENDED_LADDER[0])).toContain(normalizeTierName('The Wave'));
  });

  it('normalizes case, padding, inner whitespace, and a leading "the"', () => {
    expect(normalizeTierName('  The   Inner Circle ')).toBe('inner circle');
    expect(normalizeTierName('THRONE')).toBe('throne');
    // "the" only strips as a leading word, never inside a name.
    expect(normalizeTierName('All The Access')).toBe('all the access');
  });

  it('uses no em dashes in fan-facing copy', () => {
    for (const tier of RECOMMENDED_LADDER) {
      expect(tier.description).not.toContain('—');
      for (const b of tier.benefits) expect(b.label).not.toContain('—');
    }
  });
});
