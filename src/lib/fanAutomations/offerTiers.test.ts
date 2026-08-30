import { describe, it, expect } from 'vitest';
import { deriveOfferTiers, resolveTierPointer, type OfferTierRow } from './offerTiers';

const LADDER: OfferTierRow[] = [
  { id: 'free', name: 'Bronze', price: 0 },
  { id: 'silver', name: 'Silver', price: 1000 },
  { id: 'gold', name: 'Gold', price: 2500 },
  { id: 'plat', name: 'Platinum', price: 10000 },
];

describe('deriveOfferTiers', () => {
  it('a standard ladder maps Gold -> gold, Silver -> silver (never Platinum by price)', () => {
    const { gold, silver } = deriveOfferTiers(LADDER);
    expect(gold?.id).toBe('gold');
    expect(silver?.id).toBe('silver');
  });

  it('legacy names still alias-match (The Vault = Gold, Inner Circle = Silver)', () => {
    const { gold, silver } = deriveOfferTiers([
      { id: 'free', name: 'The Wave', price: 0 },
      { id: 'ic', name: 'Inner Circle', price: 1000 },
      { id: 'vault', name: 'The Vault', price: 2500 },
      { id: 'throne', name: 'Throne', price: 10000 },
    ]);
    expect(gold?.id).toBe('vault');
    expect(silver?.id).toBe('ic');
  });

  it('a fully renamed ladder falls back to price order: highest paid is Gold, next below is Silver', () => {
    const { gold, silver } = deriveOfferTiers([
      { id: 'a', name: 'Day Ones', price: 500 },
      { id: 'b', name: 'Family', price: 2000 },
      { id: 'c', name: 'Inner Sanctum', price: 5000 },
    ]);
    expect(gold?.id).toBe('c');
    expect(silver?.id).toBe('b');
  });

  it('the free rung is never an offer', () => {
    const { gold, silver } = deriveOfferTiers([
      { id: 'free', name: 'Bronze', price: 0 },
      { id: 'only', name: 'Members', price: 1500 },
    ]);
    expect(gold?.id).toBe('only');
    expect(silver).toBeNull();
  });

  it('no paid tiers means no offers, never an invented rung', () => {
    expect(deriveOfferTiers([{ id: 'free', name: 'Bronze', price: 0 }])).toEqual({ gold: null, silver: null });
  });

  it('inactive tiers do not participate', () => {
    const { gold } = deriveOfferTiers([
      { id: 'dead', name: 'Gold', price: 9900, is_active: false },
      { id: 'live', name: 'Family', price: 2000, is_active: true },
    ]);
    expect(gold?.id).toBe('live');
  });

  it('a Silver alias priced ABOVE the Gold pick is refused; the ladder never inverts', () => {
    const { gold, silver } = deriveOfferTiers([
      { id: 's', name: 'Silver', price: 5000 },
      { id: 'g', name: 'Gold', price: 2500 },
      { id: 'x', name: 'Backstage', price: 1000 },
    ]);
    expect(gold?.id).toBe('g');
    expect(silver?.id).toBe('x');
  });
});

describe('resolveTierPointer', () => {
  it('resolves a live paid tier and refuses stale, free, or foreign ids', () => {
    expect(resolveTierPointer(LADDER, 'gold')?.id).toBe('gold');
    expect(resolveTierPointer(LADDER, 'free')).toBeNull();
    expect(resolveTierPointer(LADDER, 'someone-elses-tier')).toBeNull();
    expect(resolveTierPointer(LADDER, null)).toBeNull();
  });
});
