import { describe, it, expect } from 'vitest';
import {
  GB_APPROVED_BENEFITS,
  GB_FORBIDDEN_BENEFIT_PHRASES,
  GB_TIER_PRICES_CENTS,
  GB_TIER_PROMISES,
} from './gbBenefits';
import { GB_PLATINUM_OFFER, GB_GOLD_OFFER, GB_SILVER_OFFER } from './gb';
import { tierCardBenefitLines } from '@/lib/tierCardBenefits';

const RUNGS = ['Bronze', 'Silver', 'Gold', 'Platinum'] as const;

describe('GB approved tier offer', () => {
  it('is all four rungs at the approved prices', () => {
    expect(Object.keys(GB_APPROVED_BENEFITS).sort()).toEqual([...RUNGS].sort());
    expect(GB_TIER_PRICES_CENTS).toEqual({ Bronze: 0, Silver: 1000, Gold: 2500, Platinum: 5000 });
    for (const rung of RUNGS) expect(GB_TIER_PROMISES[rung]).toBeTruthy();
  });

  // The screenshots that started this: generic ladder defaults printed above GB's offer.
  it('makes none of the removed promises', () => {
    for (const rung of RUNGS) {
      for (const line of GB_APPROVED_BENEFITS[rung]) {
        for (const banned of GB_FORBIDDEN_BENEFIT_PHRASES) {
          expect(line.toLowerCase(), `${rung}: "${line}"`).not.toContain(banned.toLowerCase());
        }
      }
    }
  });

  it('promises early access without a fixed day count', () => {
    const silver = GB_APPROVED_BENEFITS.Silver.join(' ');
    expect(silver).toContain('Finished songs before they go public');
    expect(silver).not.toMatch(/\d+\s*[- ]?day/i);
  });

  it('keeps each rung on its own job', () => {
    // Silver is ACCESS, not influence: no voting language below Gold.
    expect(GB_APPROVED_BENEFITS.Bronze.join(' ').toLowerCase()).not.toContain('vote');
    expect(GB_APPROVED_BENEFITS.Silver.join(' ').toLowerCase()).not.toContain('vote');
    expect(GB_APPROVED_BENEFITS.Gold.join(' ')).toContain('Vote on the songs before anyone hears them');
    // Platinum contributes; Gold does not.
    expect(GB_APPROVED_BENEFITS.Gold.join(' ').toLowerCase()).not.toContain('send beats');
    expect(GB_APPROVED_BENEFITS.Platinum.join(' ')).toContain('Send beats for consideration');
    // Each paid rung inherits rather than restating.
    expect(GB_APPROVED_BENEFITS.Silver[0]).toBe('Everything in Bronze');
    expect(GB_APPROVED_BENEFITS.Gold[0]).toBe('Everything in Silver');
    expect(GB_APPROVED_BENEFITS.Platinum[0]).toBe('Everything in Gold');
  });

  it('keeps Platinum recognition as prose, not a generic badge row', () => {
    expect(GB_APPROVED_BENEFITS.Platinum).toContain('Platinum recognition');
    expect(GB_APPROVED_BENEFITS.Platinum.join(' ')).not.toContain('community badge');
  });

  // With no structured rows left, the public card IS the approved offer, in order.
  it('renders as exactly the approved offer once the default rows are gone', () => {
    for (const rung of RUNGS) {
      expect(tierCardBenefitLines([], GB_APPROVED_BENEFITS[rung])).toEqual(GB_APPROVED_BENEFITS[rung]);
    }
  });

  it('leaves the Tier Offer Experience CTAs alone', () => {
    expect(GB_PLATINUM_OFFER.cta).toBe('Put My Ideas in the Room');
    expect(GB_GOLD_OFFER.cta).toBe('Help Shape What Comes Next');
    expect(GB_SILVER_OFFER.cta).toBe('Take Me Backstage');
  });
});
