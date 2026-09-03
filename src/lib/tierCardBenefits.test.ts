import { describe, it, expect } from 'vitest';
import { tierCardBenefitLines } from './tierCardBenefits';

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

  it('renders an unknown benefit type with the fallback tick', () => {
    const lines = tierCardBenefitLines([{ benefit_type: 'not_a_real_benefit', config: {} }], []);
    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith('✓')).toBe(true);
  });
});
