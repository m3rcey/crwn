import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { unlockMonthsFor, unlockAt, dripLock, dripLabel } from './memberDrip';

const GOLD = '11111111-1111-1111-1111-111111111111';
const PLAT = '22222222-2222-2222-2222-222222222222';

describe('unlockMonthsFor mirrors the SQL clause', () => {
  it('reads a whole number of months for the tier', () => {
    expect(unlockMonthsFor({ [GOLD]: 2 }, GOLD)).toBe(2);
    expect(unlockMonthsFor({ [GOLD]: 2.9 }, GOLD)).toBe(2);
  });
  it('a tier with no entry waits for nothing (Platinum)', () => {
    expect(unlockMonthsFor({ [GOLD]: 2 }, PLAT)).toBe(0);
  });
  it('fails OPEN on every malformed shape, like the SQL', () => {
    for (const bad of [null, undefined, [1, 2], 'x', 3, { [GOLD]: 'soon' }, { [GOLD]: 0 }, { [GOLD]: -4 }, { [GOLD]: NaN }]) {
      expect(unlockMonthsFor(bad, GOLD)).toBe(0);
    }
    expect(unlockMonthsFor({ [GOLD]: 2 }, null)).toBe(0);
  });
  it('clamps at 120 months', () => {
    expect(unlockMonthsFor({ [GOLD]: 1e12 }, GOLD)).toBe(120);
  });
});

describe('unlockAt is calendar months, as Postgres make_interval counts them', () => {
  it('adds months', () => {
    expect(unlockAt(new Date('2026-10-01T15:00:00Z'), 1).toISOString()).toBe('2026-11-01T15:00:00.000Z');
    expect(unlockAt(new Date('2026-10-16T00:00:00Z'), 3).toISOString()).toBe('2027-01-16T00:00:00.000Z');
  });
  it('clamps the end of a month the way Postgres does', () => {
    expect(unlockAt(new Date('2027-01-31T12:00:00Z'), 1).toISOString()).toBe('2027-02-28T12:00:00.000Z');
    expect(unlockAt(new Date('2028-01-31T12:00:00Z'), 1).toISOString()).toBe('2028-02-29T12:00:00.000Z');
  });
});

describe('dripLock only ever describes a lock the server applies', () => {
  const map = { [GOLD]: 1 };
  it('the server yes always wins', () => {
    expect(dripLock({ map, tierId: GOLD, serverGranted: true, startedAt: new Date().toISOString() })).toBeNull();
  });
  it('a waiting member gets the day it opens', () => {
    const lock = dripLock({ map, tierId: GOLD, serverGranted: false, startedAt: '2026-10-01T00:00:00Z' })!;
    expect(lock.opensAt!.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(dripLabel(lock, new Date('2026-10-20T00:00:00Z'))).toBe('Unlocks in 12 days');
    expect(dripLabel(lock, new Date('2026-10-31T00:00:00Z'))).toBe('Unlocks tomorrow');
  });
  it('a preview persona (no start) sees the day-one lock with no date', () => {
    const lock = dripLock({ map, tierId: GOLD, serverGranted: false, startedAt: null })!;
    expect(lock.opensAt).toBeNull();
    expect(dripLabel(lock)).toBe('Unlocks after month 1 of your membership');
  });
  it('no delay for the viewer means no drip lock (the normal gate decides)', () => {
    expect(dripLock({ map, tierId: PLAT, serverGranted: false })).toBeNull();
    expect(dripLock({ map: null, tierId: GOLD, serverGranted: false })).toBeNull();
  });
});

describe('the TypeScript rule and the SQL clause stay one rule', () => {
  const sql = readFileSync('supabase/schema-phase2-tier-unlock-months.sql', 'utf8');
  it('the SQL clamps at the same 120 and fails open on non-numbers and non-objects', () => {
    expect(sql).toMatch(/LEAST\(floor\(\(v_delays ->> sub\.tier_id::text\)::numeric\), 120\)/);
    expect(sql).toContain("jsonb_typeof(v_delays) = 'object'");
    expect(sql).toContain("jsonb_typeof(v_delays -> sub.tier_id::text) = 'number'");
    expect(sql).toContain('COALESCE(sub.started_at, sub.created_at)');
  });
  it('the delay runs only AFTER the tier has matched allowed_tier_ids, so it can never grant', () => {
    const match = sql.indexOf('IF NOT (v_tiers ? sub.tier_id::text) THEN RETURN false; END IF;');
    const drip = sql.indexOf('v_delays := t.tier_unlock_months;');
    expect(match).toBeGreaterThan(0);
    expect(drip).toBeGreaterThan(match);
  });
});
