import { describe, it, expect } from 'vitest';
import {
  canContinue,
  defaultDownsell,
  defaultTierId,
  hasCheaperPaidTier,
  priceCentsOf,
  resumeIndex,
  suggestPromise,
  visibleSteps,
  workloadFor,
  type OfferState,
} from './offerSteps';

const FREE = { id: 'free', name: 'Bronze', price: 0, description: null };
const SILVER = { id: 'silver', name: 'Silver', price: 1000, description: null };
const GOLD = { id: 'gold', name: 'Gold', price: 2500, description: 'Vote on the songs before anyone hears them' };

function state(over: Partial<OfferState> = {}): OfferState {
  return {
    tiers: [FREE, GOLD],
    selectedTierId: 'gold',
    tierPreselected: true,
    creating: null,
    pillar: null,
    benefits: [],
    promise: '',
    wantsDownsell: null,
    downsell: { name: 'Silver', priceDollars: '10' },
    canAddPaidTier: true,
    ...over,
  };
}

describe('visibleSteps', () => {
  it('asks for the tier only when two or more paid tiers exist and nothing chose one', () => {
    expect(visibleSteps(state()).map((s) => s.key)).not.toContain('tier');
    const two = state({ tiers: [FREE, SILVER, GOLD], tierPreselected: false, selectedTierId: null });
    expect(visibleSteps(two)[0].key).toBe('tier');
    const pointed = state({ tiers: [FREE, SILVER, GOLD], tierPreselected: true });
    expect(visibleSteps(pointed).map((s) => s.key)).not.toContain('tier');
  });

  it('creates a paid tier first when none exists', () => {
    const none = state({ tiers: [FREE], selectedTierId: null, tierPreselected: false });
    expect(visibleSteps(none)[0].key).toBe('create');
  });

  it('never forces four tiers: the downsell is optional and only offered when no cheaper paid tier exists', () => {
    const keys = visibleSteps(state()).map((s) => s.key);
    expect(keys).toContain('downsell');
    expect(visibleSteps(state()).find((s) => s.key === 'downsell')?.requirement).toBe('optional');
    const hasSilver = state({ tiers: [FREE, SILVER, GOLD] });
    expect(visibleSteps(hasSilver).map((s) => s.key)).not.toContain('downsell');
    const capped = state({ canAddPaidTier: false });
    expect(visibleSteps(capped).map((s) => s.key)).not.toContain('downsell');
    expect(visibleSteps(state({ wantsDownsell: true })).map((s) => s.key)).toContain('downsell-price');
    expect(visibleSteps(state({ wantsDownsell: false })).map((s) => s.key)).not.toContain('downsell-price');
  });

  it('asks "can you keep this up" only when the chosen benefits cost recurring or manual work', () => {
    expect(visibleSteps(state()).map((s) => s.key)).not.toContain('workload');
    const scheduled = state({ benefits: [{ benefit_type: 'exclusive_posts', config: { frequency: 'monthly' }, sort_order: 0 }] });
    expect(visibleSteps(scheduled).map((s) => s.key)).toContain('workload');
    const manual = state({ benefits: [{ benefit_type: 'one_on_one_call', config: {}, sort_order: 0 }] });
    expect(visibleSteps(manual).map((s) => s.key)).toContain('workload');
    const passive = state({ benefits: [{ benefit_type: 'exclusive_tracks', config: {}, sort_order: 0 }] });
    expect(visibleSteps(passive).map((s) => s.key)).not.toContain('workload');
  });

  it('ends on review and reads as decisions, never internals', () => {
    const steps = visibleSteps(state());
    expect(steps[steps.length - 1].key).toBe('review');
    for (const s of steps) {
      expect(s.title).not.toMatch(/tier_benefits|entitlement|allow list|benefit_type/i);
    }
  });
});

describe('canContinue', () => {
  it('requires at least one non-retired benefit', () => {
    expect(canContinue('benefits', state())).toBe(false);
    expect(canContinue('benefits', state({ benefits: [{ benefit_type: 'monthly_merch', config: {}, sort_order: 0 }] }))).toBe(false);
    expect(canContinue('benefits', state({ benefits: [{ benefit_type: 'exclusive_tracks', config: {}, sort_order: 0 }] }))).toBe(true);
  });

  it('requires the downsell to be strictly cheaper than the main offer', () => {
    expect(canContinue('downsell-price', state({ downsell: { name: 'Silver', priceDollars: '10' } }))).toBe(true);
    expect(canContinue('downsell-price', state({ downsell: { name: 'Silver', priceDollars: '25' } }))).toBe(false);
    expect(canContinue('downsell-price', state({ downsell: { name: 'Silver', priceDollars: '30' } }))).toBe(false);
    expect(canContinue('downsell-price', state({ downsell: { name: '', priceDollars: '10' } }))).toBe(false);
  });

  it('requires a real price when creating the first paid tier', () => {
    expect(canContinue('create', state({ creating: { name: 'Gold', priceDollars: '0' } }))).toBe(false);
    expect(canContinue('create', state({ creating: { name: 'Gold', priceDollars: '9.99' } }))).toBe(true);
    expect(priceCentsOf('9.99')).toBe(999);
  });
});

describe('resume derives from the tier itself', () => {
  it('a tier with no benefits resumes at the first decision, one with benefits but no promise at the promise, a whole one at review', () => {
    const empty = state();
    expect(visibleSteps(empty)[resumeIndex(visibleSteps(empty), empty)].key).toBe('pillar');
    const withBenefits = state({ benefits: [{ benefit_type: 'exclusive_tracks', config: {}, sort_order: 0 }] });
    expect(visibleSteps(withBenefits)[resumeIndex(visibleSteps(withBenefits), withBenefits)].key).toBe('promise');
    const done = state({ benefits: [{ benefit_type: 'exclusive_tracks', config: {}, sort_order: 0 }], promise: 'Hear it first' });
    expect(visibleSteps(done)[resumeIndex(visibleSteps(done), done)].key).toBe('review');
  });

  it('an unanswered tier or create question always comes first', () => {
    const none = state({ tiers: [FREE], selectedTierId: null, tierPreselected: false, benefits: [{ benefit_type: 'exclusive_tracks', config: {}, sort_order: 0 }], promise: 'x' });
    expect(resumeIndex(visibleSteps(none), none)).toBe(0);
  });
});

describe('prefill', () => {
  it('the tier follows the pointer, then the ladder derivation, and is never the free rung', () => {
    expect(defaultTierId([FREE, SILVER, GOLD], 'silver')).toBe('silver');
    expect(defaultTierId([FREE, SILVER, GOLD], 'free')).toBe('gold');
    expect(defaultTierId([FREE, SILVER, GOLD], 'foreign')).toBe('gold');
    expect(defaultTierId([FREE, SILVER, GOLD], null)).toBe('gold');
    expect(defaultTierId([FREE], null)).toBeNull();
  });

  it('the promise starts from the tier description, then the first benefit, then the pillar', () => {
    expect(suggestPromise(state())).toBe('Vote on the songs before anyone hears them');
    const noDesc = state({ tiers: [FREE, { ...GOLD, description: null }], benefits: [{ benefit_type: 'exclusive_tracks', config: {}, sort_order: 0 }] });
    expect(suggestPromise(noDesc)).toContain('Songs, demos');
    expect(suggestPromise(state({ tiers: [FREE, { ...GOLD, description: null }], pillar: 'influence' }))).toContain('shape');
    expect(suggestPromise(state({ tiers: [FREE, { ...GOLD, description: null }] }))).toBe('');
  });

  it('the downsell default is the recommended Silver priced strictly below the main offer, never GB prices', () => {
    expect(defaultDownsell(state())).toEqual({ name: 'Silver', priceDollars: '10' });
    const cheapPrimary = state({ tiers: [FREE, { ...GOLD, price: 800 }] });
    expect(defaultDownsell(cheapPrimary)).toEqual({ name: 'Silver', priceDollars: '4' });
    const silverTaken = state({ tiers: [FREE, { ...SILVER, price: 3000 }, GOLD], selectedTierId: 'silver' });
    expect(defaultDownsell(silverTaken).name).toBe('Starter');
    expect(hasCheaperPaidTier(state({ tiers: [FREE, SILVER, GOLD] }))).toBe(true);
  });

  it('workload counts only scheduled promises and artist-delivered ones', () => {
    const w = workloadFor([
      { benefit_type: 'exclusive_posts', config: { frequency: 'weekly' }, sort_order: 0 },
      { benefit_type: 'one_on_one_call', config: {}, sort_order: 1 },
      { benefit_type: 'exclusive_tracks', config: {}, sort_order: 2 },
    ]);
    expect(w.recurring).toEqual([{ label: 'Go behind the scenes', cadence: 'weekly' }]);
    expect(w.manual.length).toBe(1);
    expect(w.minutes).toBeGreaterThan(0);
    expect(workloadFor([]).minutes).toBe(0);
  });
});
