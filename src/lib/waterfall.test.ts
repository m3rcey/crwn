// The waterfall scheduler: additive-only by design, and the degenerate cases
// must collapse to today's all-at-once behaviour.

import { describe, expect, it } from 'vitest';
import { buildWaterfall, dueOpenings, earlyAccessDaysByTier } from './waterfall';
import { getBenefitDisplayText } from './benefitCatalog';
import { RECOMMENDED_LADDER } from './tierTemplate';

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

describe('earlyAccessDaysByTier — the promised head start, read from the benefit rows', () => {
  it('reads days_early as a number', () => {
    expect(
      earlyAccessDaysByTier([{ tier_id: 'silver', benefit_type: 'early_access', config: { days_early: 7 } }]),
    ).toEqual({ silver: 7 });
  });

  it('reads days_early stored as a STRING, which production actually holds', () => {
    // A live row is {"days_early": "14"}. Coerced the same way getBenefitDisplayText
    // coerces it, or the fan is shown 14 and the scheduler silently uses the default.
    expect(
      earlyAccessDaysByTier([{ tier_id: 'gold', benefit_type: 'early_access', config: { days_early: '14' } }]),
    ).toEqual({ gold: 14 });
  });

  it('ignores other benefit types and unusable values instead of scheduling a 0-day head start', () => {
    expect(
      earlyAccessDaysByTier([
        { tier_id: 'a', benefit_type: 'shop_discount', config: { days_early: 7 } },
        { tier_id: 'b', benefit_type: 'early_access', config: { days_early: 0 } },
        { tier_id: 'c', benefit_type: 'early_access', config: { days_early: 'soon' } },
        { tier_id: 'd', benefit_type: 'early_access', config: null },
      ]),
    ).toEqual({});
    expect(earlyAccessDaysByTier(null)).toEqual({});
  });
});

describe('ONE source: what a tier displays is what it schedules', () => {
  // The regression this file exists to prevent: a tier advertising "7-day early
  // access" while the scheduler opens it on day 14 (or the reverse), because the
  // promise lived in tier_benefits.config.days_early and the schedule lived in a
  // positional LADDER_EARLY_DAYS constant.
  it('a customised tier opens on the day its own benefit promises, not its ladder position', () => {
    // Gold sits at ladder position 1 (default 14) but promises 3 days.
    const w = buildWaterfall({
      paidTiersByPriceDesc: [
        { id: 'platinum', daysEarly: 30 },
        { id: 'gold', daysEarly: 3 },
        { id: 'silver', daysEarly: 1 },
      ],
      windowDays: 30,
      now,
    });
    const publicAt = new Date(w.publicReleaseDate).getTime();
    const at = (id: string) => new Date(w.scheduled.find((s) => s.tier_id === id)!.opens_at).getTime();
    expect(w.immediateTierIds).toEqual(['platinum']);
    expect(at('gold')).toBe(publicAt - 3 * day);
    expect(at('silver')).toBe(publicAt - 1 * day);
  });

  it('displayed promise equals scheduled opening for every rung of the recommended ladder', () => {
    // Walk the real ladder: take each rung's early_access benefit config, render
    // the sentence the fan reads, schedule from the SAME config, and require the
    // number in the sentence to be the number of days the tier actually opens.
    const rungs = RECOMMENDED_LADDER
      .filter((r) => r.priceCents > 0)
      .map((r) => ({
        key: r.key,
        cfg: r.benefits.find((b) => b.structured?.benefit_type === 'early_access')?.structured?.config as
          | Record<string, unknown>
          | undefined,
      }))
      .filter((r) => r.cfg)
      .sort((a, b) => Number(b.cfg!.days_early) - Number(a.cfg!.days_early));

    expect(rungs.length).toBeGreaterThan(1); // the ladder must actually differentiate

    const w = buildWaterfall({
      paidTiersByPriceDesc: rungs.map((r) => ({ id: r.key, daysEarly: Number(r.cfg!.days_early) })),
      windowDays: 30,
      now,
    });
    const publicAt = new Date(w.publicReleaseDate).getTime();

    for (const rung of rungs) {
      const displayed = getBenefitDisplayText('early_access', rung.cfg!);
      const promisedDays = Number(/^(\d+)-day/.exec(displayed)?.[1]);
      expect(Number.isFinite(promisedDays), `${rung.key}: "${displayed}" has no leading day count`).toBe(true);

      const entry = w.scheduled.find((s) => s.tier_id === rung.key);
      const actualDaysEarly = entry
        ? Math.round((publicAt - new Date(entry.opens_at).getTime()) / day)
        : 30; // immediate == the whole window
      expect(actualDaysEarly, `${rung.key} displays ${promisedDays}d but opens ${actualDaysEarly}d early`).toBe(
        promisedDays,
      );
    }
  });

  it('falls back to the ladder position only when a tier promises nothing', () => {
    const w = buildWaterfall({
      paidTiersByPriceDesc: [{ id: 'top' }, { id: 'mid' }, { id: 'entry' }],
      windowDays: 30,
      now,
    });
    const publicAt = new Date(w.publicReleaseDate).getTime();
    expect(w.immediateTierIds).toEqual(['top']);
    expect(new Date(w.scheduled[0].opens_at).getTime()).toBe(publicAt - 14 * day);
    expect(new Date(w.scheduled[1].opens_at).getTime()).toBe(publicAt - 7 * day);
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
