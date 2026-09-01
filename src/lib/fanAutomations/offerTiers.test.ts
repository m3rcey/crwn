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

// ── resolveFunnelOffers: the generic engine semantics ────────────────────────────
import { resolveFunnelOffers } from './offerTiers';

describe('resolveFunnelOffers — primary paid offer + optional downsell', () => {
  const bronze = { id: 'b', name: 'Economy', price: 0 };
  const silver = { id: 's', name: 'Inner Circle', price: 1000 };
  const gold = { id: 'g', name: 'The Vault', price: 2500 };
  const platinum = { id: 'p', name: 'Day One A&R', price: 5000 };
  const ladder = [bronze, silver, gold, platinum];

  it("GB's configuration: Platinum primary, Gold downsell, from pointers alone", () => {
    const r = resolveFunnelOffers(ladder, { gold_tier_id: 'p', silver_tier_id: 'g' });
    expect(r.primary?.id).toBe('p');
    expect(r.downsell?.id).toBe('g');
  });

  it('any artist-owned paid tier works as primary; nothing special-cases a rung', () => {
    const r = resolveFunnelOffers(ladder, { gold_tier_id: 's', silver_tier_id: null });
    expect(r.primary?.id).toBe('s');
  });

  it('no pointers falls back to derivation (alias or price order)', () => {
    const r = resolveFunnelOffers(ladder, { gold_tier_id: null, silver_tier_id: null });
    expect(r.primary?.id).toBe('g'); // "The Vault" alias-matches the gold rung
    expect(r.downsell?.id).toBe('s');
  });

  it('a CROSS-ARTIST or stale pointer resolves to null and falls back, never leaks', () => {
    const r = resolveFunnelOffers(ladder, { gold_tier_id: 'someone-elses-tier', silver_tier_id: null });
    expect(r.primary?.id).toBe('g'); // fell back to derivation within THIS ladder
  });

  it('the FREE tier is refused as a paid offer', () => {
    const r = resolveFunnelOffers(ladder, { gold_tier_id: 'b', silver_tier_id: null });
    expect(r.primary?.id).toBe('g'); // pointer refused (price 0), derivation fills
  });

  it('the downsell is optional', () => {
    const one = [bronze, platinum];
    const r = resolveFunnelOffers(one, { gold_tier_id: 'p', silver_tier_id: null });
    expect(r.primary?.id).toBe('p');
    expect(r.downsell).toBeNull();
  });

  it('a downsell at or above the primary price is dropped: the ladder never inverts', () => {
    const r = resolveFunnelOffers(ladder, { gold_tier_id: 'g', silver_tier_id: 'p' });
    expect(r.primary?.id).toBe('g');
    expect(r.downsell).toBeNull();
  });

  it('no paid tiers at all: no offers, and no crash', () => {
    const r = resolveFunnelOffers([bronze], { gold_tier_id: null, silver_tier_id: null });
    expect(r.primary).toBeNull();
    expect(r.downsell).toBeNull();
  });
});
