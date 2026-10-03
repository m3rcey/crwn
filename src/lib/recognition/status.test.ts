import { describe, it, expect } from 'vitest';
import { deriveRecognition, primaryLabel, allLabels, EMPTY_RECOGNITION } from './status';

const active = (over = {}) => deriveRecognition({
  isFounder: false, subscriptionStatus: 'active', tierName: 'Platinum', isTopTier: true, ...over,
});

describe('deriveRecognition — Day One is earned and permanent', () => {
  it('shows Day One for a founder', () => {
    expect(active({ isFounder: true }).dayOne).toBe(true);
  });

  it('KEEPS Day One after cancellation — being early does not stop being true', () => {
    const r = deriveRecognition({
      isFounder: true, subscriptionStatus: 'canceled', tierName: 'Platinum', isTopTier: true,
    });
    expect(r.dayOne).toBe(true);
    expect(r.tierLabel).toBeNull();
    expect(r.isEmpty).toBe(false);
  });

  it('never invents Day One for a non-founder', () => {
    expect(active({ isFounder: false }).dayOne).toBe(false);
  });
});

describe('deriveRecognition — tier status is current and conditional', () => {
  it('shows the artist\'s own rung name while the membership is live', () => {
    expect(active().tierLabel).toBe('Platinum');
    expect(deriveRecognition({
      isFounder: false, subscriptionStatus: 'active', tierName: 'Economy', isTopTier: false,
    }).tierLabel).toBe('Economy');
  });

  it('a CANCELLED member no longer shows current status', () => {
    const r = deriveRecognition({
      isFounder: false, subscriptionStatus: 'canceled', tierName: 'Platinum', isTopTier: true,
    });
    expect(r.tierLabel).toBeNull();
    expect(r.isTopTier).toBe(false);
    expect(r.isEmpty).toBe(true);
  });

  it('someone who never subscribed shows nothing', () => {
    const r = deriveRecognition({
      isFounder: false, subscriptionStatus: 'never', tierName: null, isTopTier: false,
    });
    expect(r).toEqual({ dayOne: false, supporterNumber: null, tierLabel: null, isTopTier: false, isEmpty: true });
  });

  it('the number rides beside the rung, and the rung can change under it', () => {
    // Stamped once at the first paid checkout, so it is tenure, not tier. The same fan moving
    // UP or DOWN keeps it, which is the whole reason it is safe to show beside a rung.
    const up = deriveRecognition({ isFounder: false, subscriptionStatus: 'active', tierName: 'Platinum', isTopTier: true, supporterNumber: 3 });
    expect(primaryLabel(up)).toBe('Platinum #3');
    const down = deriveRecognition({ isFounder: false, subscriptionStatus: 'active', tierName: 'Silver', isTopTier: false, supporterNumber: 3 });
    expect(primaryLabel(down)).toBe('Silver #3');
  });

  it('the number is earned and permanent: it outlives the membership', () => {
    const lapsed = deriveRecognition({ isFounder: false, subscriptionStatus: 'canceled', tierName: 'Platinum', isTopTier: true, supporterNumber: 12 });
    expect(lapsed.tierLabel).toBeNull();      // the rung is a CURRENT fact and ends
    expect(primaryLabel(lapsed)).toBe('#12'); // being twelfth does not stop being true
    expect(lapsed.isEmpty).toBe(false);
  });

  it('a member with no number reads exactly as before', () => {
    const r = deriveRecognition({ isFounder: false, subscriptionStatus: 'active', tierName: 'Gold', isTopTier: false });
    expect(r.supporterNumber).toBeNull();
    expect(primaryLabel(r)).toBe('Gold');
  });

  it('a nonsense number is treated as absent, never printed', () => {
    for (const bad of [0, -4, 1.5, NaN]) {
      const r = deriveRecognition({ isFounder: false, subscriptionStatus: 'active', tierName: 'Gold', isTopTier: false, supporterNumber: bad });
      expect(r.supporterNumber, String(bad)).toBeNull();
      expect(primaryLabel(r)).toBe('Gold');
    }
  });

  it('Day One is not repeated when it is already the primary label', () => {
    const onlyDayOne = deriveRecognition({ isFounder: true, subscriptionStatus: 'canceled', tierName: 'Gold', isTopTier: false });
    expect(allLabels(onlyDayOne)).toEqual(['Day One']);
    const both = deriveRecognition({ isFounder: true, subscriptionStatus: 'active', tierName: 'Gold', isTopTier: false, supporterNumber: 5 });
    expect(allLabels(both)).toEqual(['Gold #5', 'Day One']);
  });

  it('top-tier is only true on a live membership', () => {
    expect(active({ isTopTier: true }).isTopTier).toBe(true);
    expect(deriveRecognition({
      isFounder: false, subscriptionStatus: 'canceled', tierName: 'Platinum', isTopTier: true,
    }).isTopTier).toBe(false);
  });
});

describe('labels', () => {
  it('the live rung outranks Day One when there is room for one', () => {
    expect(primaryLabel(active({ isFounder: true }))).toBe('Platinum');
  });

  it('a lapsed founder still reads as Day One', () => {
    const r = deriveRecognition({
      isFounder: true, subscriptionStatus: 'canceled', tierName: 'Gold', isTopTier: false,
    });
    expect(primaryLabel(r)).toBe('Day One');
    expect(allLabels(r)).toEqual(['Day One']);
  });

  it('both show where there is room, rung first', () => {
    expect(allLabels(active({ isFounder: true }))).toEqual(['Platinum', 'Day One']);
  });

  it('nothing to show returns null and an empty list', () => {
    expect(primaryLabel(EMPTY_RECOGNITION)).toBeNull();
    expect(allLabels(EMPTY_RECOGNITION)).toEqual([]);
  });

  it('labels are the artist\'s own tier names, never an industry role', () => {
    // The label can never become "producer", "writer" or a credit: it is whatever the
    // artist named their rung, passed straight through.
    expect(active({ tierName: 'Backstage' }).tierLabel).toBe('Backstage');
  });
});
