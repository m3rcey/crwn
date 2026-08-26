import { describe, it, expect } from 'vitest';
// Two halves, split by consumer rather than duplicated: the slot maths runs in the local ingest
// command (a .mjs, which TypeScript cannot import), the due predicate runs on the server.
import { isDue, MISSED_SLOT_GRACE_MINUTES } from './schedule';
import {
  buildSlots,
  zonedWallClockToUtc,
  parseWallClock,
  parseDate,
  formatInZone,
  DEFAULT_TIME_ZONE,
} from '../../../scripts/lib/schedule.mjs';

describe('zonedWallClockToUtc', () => {
  // The whole point of the module. If these are wrong, every post is an hour off for half the
  // year and nothing warns anybody.
  it('converts summer (EDT, UTC-4) correctly', () => {
    const d = zonedWallClockToUtc(2026, 8, 27, 9, 0, 'America/New_York');
    expect(d.toISOString()).toBe('2026-08-27T13:00:00.000Z');
  });

  it('converts winter (EST, UTC-5) correctly', () => {
    const d = zonedWallClockToUtc(2026, 1, 15, 9, 0, 'America/New_York');
    expect(d.toISOString()).toBe('2026-01-15T14:00:00.000Z');
  });

  it('gives the same wall-clock hour a DIFFERENT utc instant across the DST boundary', () => {
    const summer = zonedWallClockToUtc(2026, 8, 27, 9, 0, 'America/New_York');
    const winter = zonedWallClockToUtc(2026, 12, 27, 9, 0, 'America/New_York');
    const summerHour = summer.getUTCHours();
    const winterHour = winter.getUTCHours();
    expect(winterHour - summerHour).toBe(1);
  });

  it('handles the spring-forward morning without drifting', () => {
    // 2026-03-08 is the US spring-forward date. 09:00 local is unambiguous (after the gap).
    const d = zonedWallClockToUtc(2026, 3, 8, 9, 0, 'America/New_York');
    expect(d.toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });

  it('handles a zone with no DST', () => {
    const d = zonedWallClockToUtc(2026, 8, 27, 9, 0, 'UTC');
    expect(d.toISOString()).toBe('2026-08-27T09:00:00.000Z');
  });
});

describe('parseWallClock / parseDate', () => {
  it('accepts valid values', () => {
    expect(parseWallClock('09:00')).toEqual({ hour: 9, minute: 0 });
    expect(parseWallClock('9:05')).toEqual({ hour: 9, minute: 5 });
    expect(parseWallClock('23:59')).toEqual({ hour: 23, minute: 59 });
    expect(parseDate('2026-08-27')).toEqual({ year: 2026, month: 8, day: 27 });
  });

  it('refuses malformed values rather than guessing', () => {
    expect(parseWallClock('9am')).toBeNull();
    expect(parseWallClock('24:00')).toBeNull();
    expect(parseWallClock('09:60')).toBeNull();
    expect(parseWallClock('')).toBeNull();
    expect(parseDate('27-08-2026')).toBeNull();
    expect(parseDate('2026-13-01')).toBeNull();
  });
});

describe('buildSlots', () => {
  it('spreads 10 posts from 9am to noon, inclusive of both ends', () => {
    const r = buildSlots({ date: '2026-08-27', start: '09:00', end: '12:00', count: 10 });
    expect(r.ok).toBe(true);
    expect(r.slots).toHaveLength(10);
    expect(r.spacingMinutes).toBe(20);
    // First lands exactly on 9am local, last exactly on noon local.
    expect(r.slots[0].toISOString()).toBe('2026-08-27T13:00:00.000Z');
    expect(r.slots[9].toISOString()).toBe('2026-08-27T16:00:00.000Z');
    // And the one in between is where a person would expect it.
    expect(r.slots[1].toISOString()).toBe('2026-08-27T13:20:00.000Z');
  });

  it('returns slots in strictly ascending order', () => {
    const r = buildSlots({ date: '2026-08-27', start: '09:00', end: '12:00', count: 10 });
    for (let i = 1; i < r.slots.length; i++) {
      expect(r.slots[i].getTime()).toBeGreaterThan(r.slots[i - 1].getTime());
    }
  });

  it('rounds every slot to a whole minute', () => {
    const r = buildSlots({ date: '2026-08-27', start: '09:00', end: '12:00', count: 7 });
    expect(r.ok).toBe(true);
    for (const s of r.slots) expect(s.getTime() % 60000).toBe(0);
  });

  it('handles a single post with no end time', () => {
    const r = buildSlots({ date: '2026-08-27', start: '09:00', count: 1 });
    expect(r.ok).toBe(true);
    expect(r.slots).toHaveLength(1);
    expect(r.spacingMinutes).toBeNull();
  });

  it('requires an end time for more than one post', () => {
    const r = buildSlots({ date: '2026-08-27', start: '09:00', count: 5 });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/end is required/i);
  });

  it('refuses an end at or before the start', () => {
    expect(buildSlots({ date: '2026-08-27', start: '12:00', end: '09:00', count: 5 }).ok).toBe(false);
    expect(buildSlots({ date: '2026-08-27', start: '09:00', end: '09:00', count: 5 }).ok).toBe(false);
  });

  it('refuses a bad count', () => {
    expect(buildSlots({ date: '2026-08-27', start: '09:00', end: '12:00', count: 0 }).ok).toBe(false);
    expect(buildSlots({ date: '2026-08-27', start: '09:00', end: '12:00', count: 2.5 }).ok).toBe(false);
  });

  it('collects every problem at once rather than one per run', () => {
    const r = buildSlots({ date: 'tomorrow', start: '9am', end: 'noon', count: 3 });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('produces winter slots an hour later in UTC than the same request in summer', () => {
    const summer = buildSlots({ date: '2026-08-27', start: '09:00', end: '12:00', count: 4 });
    const winter = buildSlots({ date: '2026-12-27', start: '09:00', end: '12:00', count: 4 });
    expect(winter.slots[0].getUTCHours() - summer.slots[0].getUTCHours()).toBe(1);
    // But the spacing the founder asked for is identical, which is the point.
    expect(winter.spacingMinutes).toBe(summer.spacingMinutes);
  });
});

describe('isDue', () => {
  const at = (iso: string) => new Date(iso);

  it('is not due before its slot', () => {
    expect(isDue(at('2026-08-27T13:00:00Z'), at('2026-08-27T12:59:00Z')).reason).toBe('future');
  });

  it('is due exactly on its slot', () => {
    expect(isDue(at('2026-08-27T13:00:00Z'), at('2026-08-27T13:00:00Z')).due).toBe(true);
  });

  it('is still due inside the grace window, so a missed tick publishes late rather than never', () => {
    const r = isDue(at('2026-08-27T13:00:00Z'), at('2026-08-27T14:00:00Z'));
    expect(r.due).toBe(true);
  });

  it('expires past the grace window rather than publishing a stale slot', () => {
    const past = new Date(Date.UTC(2026, 7, 27, 13, 0) + (MISSED_SLOT_GRACE_MINUTES + 1) * 60000);
    const r = isDue(at('2026-08-27T13:00:00Z'), past);
    expect(r.due).toBe(false);
    expect(r.reason).toBe('expired');
  });

  it('treats the grace boundary itself as still due', () => {
    const edge = new Date(Date.UTC(2026, 7, 27, 13, 0) + MISSED_SLOT_GRACE_MINUTES * 60000);
    expect(isDue(at('2026-08-27T13:00:00Z'), edge).due).toBe(true);
  });
});

describe('formatInZone', () => {
  it('renders the founder wall clock, not UTC', () => {
    const out = formatInZone(new Date('2026-08-27T13:00:00Z'), DEFAULT_TIME_ZONE);
    expect(out).toMatch(/9:00/);
    expect(out).toMatch(/EDT|GMT-4/);
  });
});
