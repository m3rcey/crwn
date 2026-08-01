// The waterfall scheduler: additive-only by design, and the degenerate cases
// must collapse to today's all-at-once behaviour.

import { describe, expect, it } from 'vitest';
import { buildWaterfall, dueOpenings } from './waterfall';

const now = new Date('2026-08-01T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
const tiers = [{ id: 'platinum' }, { id: 'gold' }, { id: 'silver' }];

describe('buildWaterfall', () => {
  it('staggers a 30-day window per the spec: top now, mid at -14, entry at -7', () => {
    const w = buildWaterfall({ paidTiersByPriceDesc: tiers, windowDays: 30, now });
    expect(w.immediateTierIds).toEqual(['platinum']);
    expect(w.scheduled.map((s) => s.tier_id)).toEqual(['gold', 'silver']);
    const publicAt = new Date(w.publicReleaseDate).getTime();
    expect(publicAt).toBe(now.getTime() + 30 * day);
    expect(new Date(w.scheduled[0].opens_at).getTime()).toBe(publicAt - 14 * day);
    expect(new Date(w.scheduled[1].opens_at).getTime()).toBe(publicAt - 7 * day);
  });

  it('collapses to all-at-once when the window is short: nothing to schedule', () => {
    const w = buildWaterfall({ paidTiersByPriceDesc: tiers, windowDays: 7, now });
    expect(w.immediateTierIds).toEqual(['platinum', 'gold', 'silver']);
    expect(w.scheduled).toEqual([]);
  });

  it('every scheduled opening lands strictly before the public date', () => {
    for (const windowDays of [14, 21, 30]) {
      const w = buildWaterfall({ paidTiersByPriceDesc: tiers, windowDays, now });
      const publicAt = new Date(w.publicReleaseDate).getTime();
      for (const s of w.scheduled) {
        expect(new Date(s.opens_at).getTime()).toBeLessThan(publicAt);
        expect(new Date(s.opens_at).getTime()).toBeGreaterThan(now.getTime());
      }
    }
  });

  it('one paid tier means immediate only, no schedule', () => {
    const w = buildWaterfall({ paidTiersByPriceDesc: [{ id: 'only' }], windowDays: 30, now });
    expect(w.immediateTierIds).toEqual(['only']);
    expect(w.scheduled).toEqual([]);
  });

  it('extra rungs beyond the ladder reuse the entry head start', () => {
    const many = [...tiers, { id: 'extra' }];
    const w = buildWaterfall({ paidTiersByPriceDesc: many, windowDays: 30, now });
    const extra = w.scheduled.find((s) => s.tier_id === 'extra')!;
    expect(new Date(extra.opens_at).getTime()).toBe(new Date(w.publicReleaseDate).getTime() - 7 * day);
  });
});

describe('dueOpenings', () => {
  it('opens what is due, keeps the rest, soonest logic intact', () => {
    const entries = [
      { tier_id: 'gold', opens_at: new Date(now.getTime() - day).toISOString() },
      { tier_id: 'silver', opens_at: new Date(now.getTime() + day).toISOString() },
    ];
    const { openTierIds, remaining } = dueOpenings(entries, now);
    expect(openTierIds).toEqual(['gold']);
    expect(remaining.map((r) => r.tier_id)).toEqual(['silver']);
  });

  it('opens malformed entries instead of stranding a paying tier forever', () => {
    const { openTierIds, remaining } = dueOpenings([{ tier_id: 'gold', opens_at: 'not-a-date' }], now);
    expect(openTierIds).toEqual(['gold']);
    expect(remaining).toEqual([]);
  });

  it('tolerates garbage without throwing', () => {
    expect(dueOpenings(null, now)).toEqual({ openTierIds: [], remaining: [] });
    expect(dueOpenings('junk', now)).toEqual({ openTierIds: [], remaining: [] });
    expect(dueOpenings([{ nope: true }], now)).toEqual({ openTierIds: [], remaining: [] });
  });
});
