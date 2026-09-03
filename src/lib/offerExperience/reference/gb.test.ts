import { describe, it, expect } from 'vitest';
import { GB_PLATINUM_OFFER, GB_GOLD_OFFER, GB_SILVER_OFFER } from './gb';
import { normalizeOfferExperience } from '../normalize';

// The reference configs must survive their own write contract: what the seed script
// writes is exactly what the read path will accept, or GB's page silently renders the
// compact fallback and nobody notices until a fan does.

describe('GB reference configs pass the write contract', () => {
  it('Platinum normalizes losslessly enough to render every preview', () => {
    const c = normalizeOfferExperience(GB_PLATINUM_OFFER, 'Platinum');
    expect(c).not.toBeNull();
    expect(c!.previews.length).toBe(GB_PLATINUM_OFFER.previews.length);
    expect(c!.cta).toBe('Put My Ideas in the Room');
  });
  it('Gold normalizes with its CTA intact', () => {
    const c = normalizeOfferExperience(GB_GOLD_OFFER, 'Gold');
    expect(c).not.toBeNull();
    expect(c!.cta).toBe('Help Shape What Comes Next');
    expect(c!.previews.length).toBe(GB_GOLD_OFFER.previews.length);
  });
  it('Silver normalizes with its CTA intact', () => {
    const c = normalizeOfferExperience(GB_SILVER_OFFER, 'Silver');
    expect(c!.cta).toBe('Take Me Backstage');
  });
});

describe('truth discipline in the reference content', () => {
  const all = [...GB_PLATINUM_OFFER.previews, ...GB_GOLD_OFFER.previews, ...GB_SILVER_OFFER.previews];

  it('every preview declares its truth state', () => {
    expect(all.every((p) => p.truth === 'real' || p.truth === 'example')).toBe(true);
  });

  it('the only REAL claims are ones production actually supports', () => {
    const real = all.filter((p) => p.truth === 'real').map((p) => p.title);
    // Platinum status is a real CRWN treatment (recognition labels ship); members-only
    // music is real because Go Bad is gated to members in production. Everything else
    // is an example until GB runs it.
    expect(real.sort()).toEqual(['Members-only music', 'Platinum status'].sort());
  });

  it('no preview or FAQ promises rights, credits, royalties, guarantees or a cadence', () => {
    const text = JSON.stringify([GB_PLATINUM_OFFER, GB_GOLD_OFFER, GB_SILVER_OFFER]).toLowerCase();
    for (const banned of ['royalt', 'publishing', 'ownership', 'credit you', 'weekly', 'monthly q', 'every month', 'guaranteed']) {
      expect(text.includes(banned), `banned term present: ${banned}`).toBe(false);
    }
    // "guarantee" appears exactly once, and only as a DENIAL in the FAQ.
    expect(text.match(/guarantee/g)?.length).toBe(1);
    expect(text).toContain('no guarantee');
    // Submissions are for consideration, stated in the fan-facing words.
    expect(text).toContain('for consideration');
  });

  it('no em dashes anywhere in fan-facing copy', () => {
    expect(JSON.stringify([GB_PLATINUM_OFFER, GB_GOLD_OFFER, GB_SILVER_OFFER]).includes('—')).toBe(false);
  });

  it('the interim VSL is DISCLOSED as a placeholder, never implied to be GB', () => {
    // Founder direction 2026-09-02: the CRWN founder video stands in until GB records
    // his own. isPlaceholder is what renders the Example video chip, so it must be set
    // wherever a stand-in url is; Silver has no video and correctly ships null.
    for (const offer of [GB_PLATINUM_OFFER, GB_GOLD_OFFER]) {
      expect(offer.vsl!.url).toMatch(/^https:\/\//);
      expect(offer.vsl!.isPlaceholder).toBe(true);
    }
    expect(GB_SILVER_OFFER.vsl!.url).toBeNull();
  });

  it('no generic Join-tier button anywhere in the configs', () => {
    const text = JSON.stringify([GB_PLATINUM_OFFER, GB_GOLD_OFFER, GB_SILVER_OFFER]);
    expect(/Join (Platinum|Gold|Silver|Bronze)/.test(text)).toBe(false);
  });
});
