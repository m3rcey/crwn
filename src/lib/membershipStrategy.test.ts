// The membership strategy brain is deterministic and maps onto the pinned
// ladder. These tests are the contract: same facts, same strategy, and the
// content classes can never reproduce the lock-everyone early-access bug.

import { describe, expect, it } from 'vitest';
import {
  MEMBERSHIP_STRATEGIES,
  PAID_FIRST_WINDOWS,
  classifyTrack,
  fieldsForClass,
  recommendStrategy,
  strategyDef,
} from './membershipStrategy';
import { RECOMMENDED_LADDER } from './tierTemplate';

describe('recommendStrategy', () => {
  it('is deterministic: same facts, same answer', () => {
    const facts = { catalogTracks: 30, unreleasedTracks: 4, releasesPerYear: 6 };
    expect(recommendStrategy(facts)).toEqual(recommendStrategy(facts));
  });

  it('recommends the Vault for a deep unreleased archive', () => {
    const r = recommendStrategy({ unreleasedTracks: 25 });
    expect(r.strategy).toBe('vault_membership');
    expect(r.reason).toBe('deep_unreleased_archive');
  });

  it('recommends the Vault for long release gaps over a real catalog', () => {
    const r = recommendStrategy({ releasesPerYear: 1, catalogTracks: 40 });
    expect(r.strategy).toBe('vault_membership');
    expect(r.reason).toBe('long_release_gaps');
  });

  it('defaults to the Release Club when facts are unknown', () => {
    // Release Club works at any cadence and never asks the artist to open an
    // archive they may not have, so it is the safe default.
    expect(recommendStrategy({}).strategy).toBe('release_club');
  });

  it('keeps a consistent releaser on the Release Club even with a big catalog', () => {
    expect(recommendStrategy({ releasesPerYear: 8, catalogTracks: 120 }).strategy).toBe('release_club');
  });
});

describe('strategy definitions', () => {
  it('cover every ladder rung, in ladder order, for both strategies', () => {
    const rungOrder = RECOMMENDED_LADDER.map((t) => t.key);
    for (const def of Object.values(MEMBERSHIP_STRATEGIES)) {
      expect(def.tierRoles.map((r) => r.rung)).toEqual(rungOrder);
    }
  });

  it('never invent a tier NAME: roles are roles, the ladder names the rungs', () => {
    // The spec's First Listen / Inner Circle / Executive / Vault are roles.
    // Rung names come from RECOMMENDED_LADDER at render time, so nothing here
    // may carry a name field that could drift from the pinned ladder.
    for (const def of Object.values(MEMBERSHIP_STRATEGIES)) {
      for (const role of def.tierRoles) {
        expect(role).not.toHaveProperty('name');
      }
    }
  });

  it('early access deepens with the ladder: a higher rung never hears it later', () => {
    for (const def of Object.values(MEMBERSHIP_STRATEGIES)) {
      const days = def.tierRoles.map((r) => r.earlyAccessDays);
      for (let i = 1; i < days.length; i += 1) expect(days[i]).toBeGreaterThanOrEqual(days[i - 1]);
    }
  });

  it('waterfall steps run outward-in: later steps are never earlier-access', () => {
    for (const def of Object.values(MEMBERSHIP_STRATEGIES)) {
      const days = def.waterfall.map((s) => s.daysBeforeRelease);
      for (let i = 1; i < days.length; i += 1) expect(days[i]).toBeLessThanOrEqual(days[i - 1]);
    }
  });

  it('uses no em dashes anywhere artist-facing', () => {
    expect(JSON.stringify(MEMBERSHIP_STRATEGIES)).not.toContain('—');
  });

  it('has three months of 90-day plan and a promise for both plans', () => {
    for (const def of Object.values(MEMBERSHIP_STRATEGIES)) {
      expect(def.ninetyDays.map((m) => m.month)).toEqual([1, 2, 3]);
      expect(def.monthlyPromise.launch.length).toBeGreaterThan(10);
      expect(def.monthlyPromise.pro.length).toBeGreaterThan(10);
    }
  });
});

describe('content classes', () => {
  const now = new Date('2026-08-01T12:00:00Z');

  it('round-trips: fieldsForClass then classifyTrack returns the same class', () => {
    const tiers = ['t1', 't2'];
    for (const cls of ['free_forever', 'paid_first', 'member_only'] as const) {
      const fields = fieldsForClass(cls, { tierIds: tiers, windowDays: 14, now });
      expect(classifyTrack(fields, now)).toBe(cls);
    }
  });

  it('paid_first keeps is_free TRUE so "public later" actually happens', () => {
    const fields = fieldsForClass('paid_first', { tierIds: ['t1'], windowDays: 7, now });
    expect(fields.is_free).toBe(true);
    expect(fields.allowed_tier_ids).toEqual(['t1']);
    const date = new Date(fields.public_release_date!);
    expect(date.getTime()).toBeGreaterThan(now.getTime());
  });

  it('cannot produce the lock-everyone state (future date with no tiers)', () => {
    // The old two-toggle UI could write is_free true + tiers [] + future date,
    // which the gate reads as "locked for everyone, members included".
    for (const cls of ['free_forever', 'paid_first', 'member_only'] as const) {
      const fields = fieldsForClass(cls, { tierIds: [], windowDays: 7, now });
      const futureDate = fields.public_release_date && new Date(fields.public_release_date) > now;
      if (futureDate) expect(fields.allowed_tier_ids.length).toBeGreaterThan(0);
    }
  });

  it('a paid_first track becomes free_forever once the window passes', () => {
    const fields = fieldsForClass('paid_first', { tierIds: ['t1'], windowDays: 7, now });
    const later = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect(classifyTrack(fields, later)).toBe('free_forever');
  });

  it('classifies legacy rows sensibly', () => {
    expect(classifyTrack({ is_free: true }, now)).toBe('free_forever');
    expect(classifyTrack({ is_free: null }, now)).toBe('free_forever');
    expect(classifyTrack({ is_free: false, allowed_tier_ids: ['t1'] }, now)).toBe('member_only');
    // The broken legacy combo reads as free_forever (its post-window truth),
    // never as a paid_first the artist did not configure.
    expect(classifyTrack({ is_free: true, allowed_tier_ids: [], public_release_date: '2026-08-05T00:00:00Z' }, now)).toBe('free_forever');
  });

  it('spec windows are the recommended set', () => {
    expect([...PAID_FIRST_WINDOWS]).toEqual([7, 14, 21, 30]);
  });

  it('strategyDef returns the matching definition', () => {
    expect(strategyDef('release_club').key).toBe('release_club');
    expect(strategyDef('vault_membership').key).toBe('vault_membership');
  });
});
