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

  it('only the two uploaded real projects are presented as REAL; placeholder slots stay examples', () => {
    const real = OFFERS.flatMap(([, o]) => o.previews).filter((p) => p.truth === 'real').map((p) => p.title).sort();
    expect(real).toEqual(['Blood Brothaz, today', 'Shotta In Da Jungle, today']);
  });

  it('the community card survives the write contract with its thread', () => {
    const c = normalizeOfferExperience(DRE_PLATINUM_OFFER, 'Platinum')!;
    const card = c.previews.find((p) => p.kind === 'status')!;
    expect(card.thread?.length).toBe(3);
    expect(card.thread?.find((t) => t.you)?.badge).toBe('Platinum');
  });

  it('a thread never rides a REAL preview (its names are illustrative)', () => {
    const forged = { ...DRE_PLATINUM_OFFER, previews: DRE_PLATINUM_OFFER.previews.map((p) => (p.kind === 'status' ? { ...p, truth: 'real' as const } : p)) };
    const c = normalizeOfferExperience(forged, 'Platinum')!;
    expect(c.previews.find((p) => p.kind === 'status')?.thread).toBeUndefined();
  });

  it('the hero art and the mock-video covers survive the write contract', () => {
    for (const [name, o] of [['Platinum', DRE_PLATINUM_OFFER], ['Gold', DRE_GOLD_OFFER]] as const) {
      const c = normalizeOfferExperience(o, name)!;
      expect(c.heroImageUrl).toMatch(/\/object\/public\/album-art\/.+\.webp$/);
    }
    const posters = OFFERS.flatMap(([n, o]) => normalizeOfferExperience(o, n)!.previews).filter((p) => p.posterUrl);
    expect(posters.map((p) => p.kind).sort()).toEqual(['session', 'video']);
  });

  it('a signed (private) image is never accepted as hero art', () => {
    const c = normalizeOfferExperience({ ...DRE_GOLD_OFFER, heroImageUrl: 'https://x.supabase.co/storage/v1/object/sign/audio/a.webp?token=abc' }, 'Gold')!;
    expect(c.heroImageUrl).toBeUndefined();
  });

  it('fan-facing headings never assume the fan knows a rung name', () => {
    for (const [, o] of OFFERS) expect(o.inherited?.heading).toBe('Also included');
  });

  it('promises no merch, no scarcity, no priority, no cadence, no rights', () => {
    for (const banned of ['merch', 'limited', 'priority', 'weekly', 'monthly', 'every month', 'royalt', 'ownership', 'guarantee']) {
      expect(lower.includes(banned), `banned term present: ${banned}`).toBe(false);
    }
  });

  it('no video plays until Dre records one: Platinum and Gold show only its cover', () => {
    // Founder direction 2026-09-28: he has not shot his video, so the slot is a cover still
    // (renderer: drawn play mark, "coming soon", nothing clickable). Silver has no slot.
    for (const o of [DRE_PLATINUM_OFFER, DRE_GOLD_OFFER]) {
      expect(o.vsl!.url).toBeNull();
      expect(o.vsl!.posterUrl).toMatch(/photo-vsl-thumb\.webp$/);
      const c = normalizeOfferExperience(o, 'Gold')!;
      expect(c.vsl?.posterUrl).toBe(o.vsl!.posterUrl);
    }
    expect(DRE_SILVER_OFFER.vsl!.url).toBeNull();
  });

  it('no em or en dashes, and no Join-tier buttons', () => {
    expect(/[—–]/.test(everything)).toBe(false);
    expect(/Join (Platinum|Gold|Silver|Bronze)/.test(everything)).toBe(false);
  });
});
