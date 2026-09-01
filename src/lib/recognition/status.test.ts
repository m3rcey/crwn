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
    expect(r).toEqual({ dayOne: false, tierLabel: null, isTopTier: false, isEmpty: true });
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
