import { describe, it, expect } from 'vitest';
import { goalReached, convertedSequenceIds } from './conversionGoal';

// GB-shaped ladder, but the names are noise on purpose: rank is price.
const BRONZE = { id: 'b', name: 'Economy', price: 0 };
const SILVER = { id: 's', name: 'Inner Circle', price: 1000 };
const GOLD = { id: 'g', name: 'The Vault', price: 2500 };
const PLATINUM = { id: 'p', name: 'Day One A&R', price: 5000 };
const LADDER = [PLATINUM, BRONZE, GOLD, SILVER]; // deliberately unsorted

const check = (goal: string | null, fan: string | null) =>
  goalReached({ goalTierId: goal, artistTiers: LADDER, fanTierId: fan });

describe('goalReached — the GB ordering, by rank not by name', () => {
  it('Bronze fan stays in a Gold-goal nurture', () => {
    expect(check(GOLD.id, BRONZE.id)).toBe(false);
  });
  it('Silver fan stays in a Gold-goal nurture', () => {
    expect(check(GOLD.id, SILVER.id)).toBe(false);
  });
  it('Gold fan has converted out of a Gold-goal nurture', () => {
    expect(check(GOLD.id, GOLD.id)).toBe(true);
  });
  it('Platinum fan has converted out of a Gold-goal nurture (higher qualifying outcome)', () => {
    expect(check(GOLD.id, PLATINUM.id)).toBe(true);
  });
  it('Gold fan stays in a Platinum-goal ascension', () => {
    expect(check(PLATINUM.id, GOLD.id)).toBe(false);
  });
  it('Platinum fan has converted out of a Platinum-goal ascension', () => {
    expect(check(PLATINUM.id, PLATINUM.id)).toBe(true);
  });
});

describe('goalReached — legacy and edge behavior', () => {
  it('a sequence with NO goal never converts anyone (legacy sequences unchanged)', () => {
    expect(check(null, PLATINUM.id)).toBe(false);
  });
  it('a fan with no membership never satisfies a goal', () => {
    expect(check(GOLD.id, null)).toBe(false);
  });
  it('a STALE goal tier id matches nobody, never everybody', () => {
    expect(check('deleted-tier', PLATINUM.id)).toBe(false);
  });
  it('a fan tier from ANOTHER artist ladder does not count', () => {
    // Another artist's tier id is simply not in this ladder, so rank cannot place it.
    expect(check(GOLD.id, 'other-artists-tier')).toBe(false);
  });
  it('names decide nothing: a renamed ladder answers identically', () => {
    const renamed = LADDER.map((t) => ({ ...t, name: `Totally ${t.name} 2` }));
    expect(goalReached({ goalTierId: GOLD.id, artistTiers: renamed, fanTierId: PLATINUM.id })).toBe(true);
  });
});

describe('convertedSequenceIds', () => {
  const seqs = [
    { id: 'seq-gold-goal', goal_tier_id: GOLD.id },
    { id: 'seq-plat-goal', goal_tier_id: PLATINUM.id },
    { id: 'seq-legacy', goal_tier_id: null },
  ];
  it('a new Gold member exits the Gold-goal sequence only', () => {
    expect(convertedSequenceIds(seqs, LADDER, GOLD.id)).toEqual(['seq-gold-goal']);
  });
  it('a new Platinum member exits both goal sequences, never the legacy one', () => {
    expect(convertedSequenceIds(seqs, LADDER, PLATINUM.id)).toEqual(['seq-gold-goal', 'seq-plat-goal']);
  });
  it('a free join exits nothing', () => {
    expect(convertedSequenceIds(seqs, LADDER, BRONZE.id)).toEqual([]);
    expect(convertedSequenceIds(seqs, LADDER, null)).toEqual([]);
  });
});
