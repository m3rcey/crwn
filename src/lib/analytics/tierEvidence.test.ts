import { describe, it, expect } from 'vitest';
import { computeTierRates, assembleTierEvidence } from './tierEvidence';

const FROM = '2026-07-01T00:00:00.000Z';
const TO = '2026-08-01T00:00:00.000Z';

const LADDER = [
  { id: 'bronze', name: 'Bronze', price: 0 },
  { id: 'silver', name: 'Silver', price: 1000 },
  { id: 'gold', name: 'Gold', price: 2500 },
  { id: 'platinum', name: 'Platinum', price: 10000 },
];

describe('computeTierRates: a zero denominator is null, never zero', () => {
  it('computes all three rates when the data supports them', () => {
    const r = computeTierRates({
      views: 200,
      checkoutStarts: 20,
      joins: 10,
      activeMembers: 10,
      canceledMembers: 0,
    });
    expect(r.viewToCheckout).toBeCloseTo(0.1);
    expect(r.checkoutToPaid).toBeCloseTo(0.5);
    expect(r.viewToPaid).toBeCloseTo(0.05);
  });

  it('returns null (not 0) when nobody viewed, so "no data" cannot read as "nobody converted"', () => {
    const r = computeTierRates({ views: 0, checkoutStarts: 0, joins: 0, activeMembers: 0, canceledMembers: 0 });
    expect(r.viewToCheckout).toBeNull();
    expect(r.viewToPaid).toBeNull();
    expect(r.checkoutToPaid).toBeNull();
  });

  it('returns a real 0 when there WERE views and nobody converted', () => {
    const r = computeTierRates({ views: 300, checkoutStarts: 0, joins: 0, activeMembers: 0, canceledMembers: 0 });
    expect(r.viewToCheckout).toBe(0);
    expect(r.viewToPaid).toBe(0);
    // Still null: nobody started checkout, so there is no denominator for this one.
    expect(r.checkoutToPaid).toBeNull();
  });
});

describe('assembleTierEvidence: counts by tier', () => {
  it('counts views and checkout starts per tier', () => {
    const ev = assembleTierEvidence({
      tiers: LADDER,
      events: [
        { tier_id: 'silver', event_type: 'tier_card_viewed' },
        { tier_id: 'silver', event_type: 'tier_card_viewed' },
        { tier_id: 'silver', event_type: 'tier_checkout_started' },
        { tier_id: 'gold', event_type: 'tier_card_viewed' },
      ],
      subscriptions: [],
      from: FROM,
      to: TO,
      interactionDataAvailable: true,
    });
    const silver = ev.tiers.find((t) => t.tierId === 'silver')!;
    expect(silver.views).toBe(2);
    expect(silver.checkoutStarts).toBe(1);
    const gold = ev.tiers.find((t) => t.tierId === 'gold')!;
    expect(gold.views).toBe(1);
    expect(gold.checkoutStarts).toBe(0);
  });

  it('ranks the ladder by price ascending regardless of the artist\'s names', () => {
    const ev = assembleTierEvidence({
      tiers: [
        { id: 'top', name: 'Zebra', price: 10000 },
        { id: 'free', name: 'Alpha', price: 0 },
        { id: 'mid', name: 'Middle', price: 2500 },
      ],
      events: [],
      subscriptions: [],
      from: FROM,
      to: TO,
    });
    expect(ev.tiers.map((t) => t.tierId)).toEqual(['free', 'mid', 'top']);
    expect(ev.tiers.map((t) => t.rank)).toEqual([0, 1, 2]);
    expect(ev.tiers[0].isFree).toBe(true);
    expect(ev.tiers[2].isFree).toBe(false);
  });

  it('counts joins only inside the range, but active members at this instant', () => {
    const ev = assembleTierEvidence({
      tiers: LADDER,
      events: [],
      subscriptions: [
        { tier_id: 'silver', status: 'active', created_at: '2026-07-15T00:00:00.000Z' }, // in range
        { tier_id: 'silver', status: 'active', created_at: '2026-05-01T00:00:00.000Z' }, // before range
        { tier_id: 'silver', status: 'canceled', created_at: '2026-07-20T00:00:00.000Z', canceled_at: '2026-07-25T00:00:00.000Z' },
      ],
      from: FROM,
      to: TO,
      interactionDataAvailable: true,
    });
    const silver = ev.tiers.find((t) => t.tierId === 'silver')!;
    expect(silver.joins).toBe(2); // both created in range, regardless of later status
    expect(silver.activeMembers).toBe(2); // point-in-time, both actives incl. the older one
    expect(silver.canceledMembers).toBe(1);
  });

  it('excludes a cancellation that happened outside the range', () => {
    const ev = assembleTierEvidence({
      tiers: LADDER,
      events: [],
      subscriptions: [
        { tier_id: 'gold', status: 'canceled', created_at: '2026-01-01T00:00:00.000Z', canceled_at: '2026-02-01T00:00:00.000Z' },
      ],
      from: FROM,
      to: TO,
    });
    expect(ev.tiers.find((t) => t.tierId === 'gold')!.canceledMembers).toBe(0);
  });

  it('totals across the ladder and computes ladder-level rates', () => {
    const ev = assembleTierEvidence({
      tiers: LADDER,
      events: [
        { tier_id: 'silver', event_type: 'tier_card_viewed' },
        { tier_id: 'gold', event_type: 'tier_card_viewed' },
        { tier_id: 'silver', event_type: 'tier_checkout_started' },
      ],
      subscriptions: [{ tier_id: 'silver', status: 'active', created_at: '2026-07-10T00:00:00.000Z' }],
      from: FROM,
      to: TO,
      interactionDataAvailable: true,
    });
    expect(ev.totals.views).toBe(2);
    expect(ev.totals.checkoutStarts).toBe(1);
    expect(ev.totals.joins).toBe(1);
    expect(ev.totals.viewToCheckout).toBeCloseTo(0.5);
  });

  it('ignores events and subscriptions with no tier id rather than mis-attributing them', () => {
    const ev = assembleTierEvidence({
      tiers: LADDER,
      events: [{ tier_id: null, event_type: 'tier_card_viewed' }],
      subscriptions: [{ tier_id: null, status: 'active', created_at: '2026-07-10T00:00:00.000Z' }],
      from: FROM,
      to: TO,
      interactionDataAvailable: true,
    });
    expect(ev.totals.views).toBe(0);
    expect(ev.totals.joins).toBe(0);
  });

  it('handles an artist with no tiers at all', () => {
    const ev = assembleTierEvidence({ tiers: [], events: [], subscriptions: [], from: FROM, to: TO });
    expect(ev.tiers).toEqual([]);
    expect(ev.totals.views).toBe(0);
    expect(ev.totals.viewToPaid).toBeNull();
  });
});

describe('assembleTierEvidence: stated limitations', () => {
  it('always reports upgrade history as unavailable, because the schema overwrites tier_id', () => {
    const ev = assembleTierEvidence({ tiers: LADDER, events: [], subscriptions: [], from: FROM, to: TO });
    expect(ev.limitations.upgradeHistoryAvailable).toBe(false);
    expect(ev.limitations.notes.some((n) => n.includes('overwrites tier_id'))).toBe(true);
  });

  it('flags missing interaction data instead of reporting a confident zero', () => {
    const ev = assembleTierEvidence({
      tiers: LADDER,
      events: [],
      subscriptions: [],
      from: FROM,
      to: TO,
      interactionDataAvailable: false,
    });
    expect(ev.limitations.interactionDataAvailable).toBe(false);
    expect(ev.limitations.notes.some((n) => n.includes('Tier interaction events are unavailable'))).toBe(true);
    // The rates are null, not 0, so nothing downstream can read this as "nobody looked".
    expect(ev.tiers.every((t) => t.viewToPaid === null)).toBe(true);
  });

  it('does not add the missing-data note when interactions are available', () => {
    const ev = assembleTierEvidence({
      tiers: LADDER,
      events: [],
      subscriptions: [],
      from: FROM,
      to: TO,
      interactionDataAvailable: true,
    });
    expect(ev.limitations.notes.some((n) => n.includes('Tier interaction events are unavailable'))).toBe(false);
  });
});

describe('assembleTierEvidence: cross-artist isolation is the caller\'s filter, and the shape proves it', () => {
  it('only ever reports tiers it was handed', () => {
    // The reader filters every query by artist_id. If a foreign tier's events leaked into the
    // events array, they would be dropped here too, because there is no row to attach them to.
    const ev = assembleTierEvidence({
      tiers: [{ id: 'mine', name: 'Silver', price: 1000 }],
      events: [
        { tier_id: 'mine', event_type: 'tier_card_viewed' },
        { tier_id: 'someone-elses-tier', event_type: 'tier_card_viewed' },
      ],
      subscriptions: [],
      from: FROM,
      to: TO,
      interactionDataAvailable: true,
    });
    expect(ev.tiers).toHaveLength(1);
    expect(ev.tiers[0].views).toBe(1);
    expect(ev.totals.views).toBe(1);
  });
});
