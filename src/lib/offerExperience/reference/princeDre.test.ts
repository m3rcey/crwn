import { describe, it, expect } from 'vitest';
import {
  DRE_PLATINUM_OFFER, DRE_GOLD_OFFER, DRE_SILVER_OFFER, DRE_APPROVED_BENEFITS,
  DRE_BENEFIT_IDENTITIES, DRE_TIER_PRICES_CENTS, DRE_TIER_PROMISES, DRE_FUNNEL_PRIMARY_ITEM,
} from './princeDre';
import { normalizeOfferExperience } from '../normalize';
import { benefitDelivery } from '../../benefitRegistry';
import { RECOMMENDED_LADDER } from '../../tierTemplate';

const OFFERS = [
  ['Platinum', DRE_PLATINUM_OFFER],
  ['Gold', DRE_GOLD_OFFER],
  ['Silver', DRE_SILVER_OFFER],
] as const;

describe('Prince Dre reference configs pass the write contract', () => {
  for (const [name, offer] of OFFERS) {
    it(`${name} normalizes with every preview and its CTA intact`, () => {
      const c = normalizeOfferExperience(offer, name);
      expect(c).not.toBeNull();
      expect(c!.cta).toBe(offer.cta);
      expect(c!.previews.length).toBe(offer.previews.length);
    });
  }
});

describe('the ladder matches the recommended rungs', () => {
  it('names and prices are the four stock rungs at the recommended prices', () => {
    const ladder = Object.fromEntries(RECOMMENDED_LADDER.map((r) => [r.name, r.priceCents]));
    expect(DRE_TIER_PRICES_CENTS).toEqual({ Bronze: 0, Silver: 1000, Gold: 2500, Platinum: 10000 });
    for (const [name, cents] of Object.entries(DRE_TIER_PRICES_CENTS)) expect(ladder[name]).toBe(cents);
    expect(Object.keys(DRE_TIER_PROMISES).sort()).toEqual(Object.keys(DRE_TIER_PRICES_CENTS).sort());
  });

  it('every structured identity is a supported registry key standing for an approved line', () => {
    for (const [rung, items] of Object.entries(DRE_BENEFIT_IDENTITIES)) {
      for (const it of items) {
        const def = benefitDelivery(it.key);
        expect(def && (def.support === 'recommended' || def.support === 'additional'), it.key).toBe(true);
        expect(DRE_APPROVED_BENEFITS[rung]).toContain(it.line);
      }
    }
  });
});

describe('truth discipline', () => {
  const everything = JSON.stringify([
    DRE_PLATINUM_OFFER, DRE_GOLD_OFFER, DRE_SILVER_OFFER, DRE_APPROVED_BENEFITS,
    DRE_TIER_PROMISES, DRE_FUNNEL_PRIMARY_ITEM,
  ]);
  const lower = everything.toLowerCase();

  it('the only REAL preview is Platinum status: nothing else is uploaded yet', () => {
    const real = OFFERS.flatMap(([, o]) => o.previews).filter((p) => p.truth === 'real').map((p) => p.title);
    expect(real).toEqual(['Platinum status']);
  });

  it('promises no merch, no scarcity, no priority, no cadence, no rights', () => {
    for (const banned of ['merch', 'limited', 'priority', 'weekly', 'monthly', 'every month', 'royalt', 'ownership', 'guarantee']) {
      expect(lower.includes(banned), `banned term present: ${banned}`).toBe(false);
    }
  });

  it('no VSL slot renders until Dre records one', () => {
    for (const [, o] of OFFERS) expect(o.vsl!.url).toBeNull();
  });

  it('no em or en dashes, and no Join-tier buttons', () => {
    expect(/[—–]/.test(everything)).toBe(false);
    expect(/Join (Platinum|Gold|Silver|Bronze)/.test(everything)).toBe(false);
  });
});
