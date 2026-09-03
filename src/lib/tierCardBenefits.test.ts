import { describe, it, expect } from 'vitest';
import { tierCardBenefitLines, cardLinesModeOf } from './tierCardBenefits';

describe('tierCardBenefitLines', () => {
  it('prints structured rows above the artist prose', () => {
    const lines = tierCardBenefitLines(
      [{ benefit_type: 'shop_discount', config: { discount_percent: 20 } }],
      ['Everything in Silver', 'The Vault'],
    );
    expect(lines[0]).toContain('20% shop discount');
    expect(lines.slice(1)).toEqual(['Everything in Silver', 'The Vault']);
  });

  // This is the shape GB is in now, and the shape the cleanup was for.
  it('is exactly the prose when a tier carries no structured rows', () => {
    expect(tierCardBenefitLines([], ['Day One recognition'])).toEqual(['Day One recognition']);
    expect(tierCardBenefitLines(null, ['Day One recognition'])).toEqual(['Day One recognition']);
  });

  it('survives a tier with neither', () => {
    expect(tierCardBenefitLines(null, null)).toEqual([]);
    expect(tierCardBenefitLines([], undefined)).toEqual([]);
  });

  it('drops non-string prose rather than rendering [object Object]', () => {
    expect(tierCardBenefitLines([], ['real', 42, null, { a: 1 }])).toEqual(['real']);
  });

  // The Promise to Delivery panel needs structured rows on GB's tiers; his card must not
  // grow a second copy of every promise above the approved prose. prose_only is that switch.
  it('prints only the prose when the tier says prose_only and prose exists', () => {
    const structured = [{ benefit_type: 'stems', config: {} }, { benefit_type: 'exclusive_tracks', config: {} }];
    expect(tierCardBenefitLines(structured, ['Stems', 'Alternate versions'], 'prose_only')).toEqual(['Stems', 'Alternate versions']);
    // With no prose to print, prose_only falls back to the structured lines rather than a blank card.
    expect(tierCardBenefitLines(structured, [], 'prose_only')).toHaveLength(2);
    expect(cardLinesModeOf({ benefits: [], card_lines: 'prose_only' })).toBe('prose_only');
    expect(cardLinesModeOf({ benefits: [] })).toBeUndefined();
    expect(cardLinesModeOf(null)).toBeUndefined();
    expect(cardLinesModeOf({ card_lines: 'anything_else' })).toBeUndefined();
  });

  it('renders an unknown benefit type with the fallback tick', () => {
    const lines = tierCardBenefitLines([{ benefit_type: 'not_a_real_benefit', config: {} }], []);
    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith('✓')).toBe(true);
  });
});
