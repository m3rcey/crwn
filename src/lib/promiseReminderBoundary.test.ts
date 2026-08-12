import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { onlyFanPromises, isFanPromiseEvent, FAN_PROMISE_FILTER } from './fulfillment';

// PROMISE REMINDER BOUNDARY.
//
// The Promise Calendar holds two different kinds of row: obligations owed to PAYING FANS, and
// Revenue Ramp steps, which are the artist's own private growth plan owed to nobody. Only the
// first may ever be spoken about in fan-obligation language.
//
// Z12 applied that boundary to the three readers that DECIDE (Constraint evidence, Manager
// insights, Roadmap) and missed both readers that COMMUNICATE. `promiseReminders` selected
// `metadata` and never filtered; `calendarReminders` did not even select `metadata`, so it could
// not have filtered. Both were LIVE daily. Production at the time: 97 fulfillment_events, 93 of
// them ramp steps, 11 inside the 8-day reminder window. So CRWN was preparing to email artists
// "Promise due in 3 days: Connect Stripe" as though a paying fan were waiting on it.

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (p: string) => stripComments(readFileSync(p, 'utf8'));

const PROMISE = read('src/lib/promiseReminders.ts');
const CALENDAR = read('src/lib/calendarReminders.ts');

const rampStep = { id: 'r1', title: 'Connect Stripe', metadata: { ramp_step_key: 'connect_stripe' } };
const fanPromise = { id: 'f1', title: 'Monthly Vault unlock', metadata: { tier_id: 't1' } };

describe('the canonical predicate', () => {
  it('separates a ramp step from a fan promise', () => {
    expect(isFanPromiseEvent(rampStep)).toBe(false);
    expect(isFanPromiseEvent(fanPromise)).toBe(true);
  });

  it('treats absent or empty metadata as a fan promise, never as a ramp step', () => {
    // Failing the other way would silently mute real obligations.
    expect(isFanPromiseEvent({ metadata: null })).toBe(true);
    expect(isFanPromiseEvent({})).toBe(true);
    expect(isFanPromiseEvent({ metadata: { ramp_step_key: '' } })).toBe(true);
  });

  it('filters a mixed set the way production actually looks', () => {
    const mixed = [rampStep, fanPromise, rampStep, rampStep];
    const kept = onlyFanPromises(mixed);
    expect(kept).toHaveLength(1);
    expect(kept[0].title).toBe('Monthly Vault unlock');
  });
});

describe('both reminder paths use the SAME canonical boundary', () => {
  it('promiseReminders filters through the shared predicate', () => {
    expect(PROMISE).toContain('onlyFanPromises');
    expect(PROMISE).toContain("from '@/lib/fulfillment'");
  });

  it('calendarReminders filters in the query through the shared constant', () => {
    expect(CALENDAR).toContain('FAN_PROMISE_FILTER');
    expect(CALENDAR).toMatch(/\.is\(FAN_PROMISE_FILTER\.column, FAN_PROMISE_FILTER\.value\)/);
    // The constant expresses the identical rule as the predicate.
    expect(FAN_PROMISE_FILTER.column).toBe('metadata->>ramp_step_key');
    expect(FAN_PROMISE_FILTER.value).toBeNull();
  });

  it('neither re-expresses the rule with its own literal', () => {
    // A fourth interpretation of "is this owed to a fan" is how the first three drifted.
    expect(PROMISE).not.toMatch(/ramp_step_key/);
    expect(CALENDAR).not.toMatch(/'ramp_step_key'|"ramp_step_key"/);
  });
});

describe('promiseReminders cannot leak a ramp step downstream', () => {
  it('every consumer reads the FILTERED set, not the raw query result', () => {
    // The filter would be decorative if the loop below it still walked `events`.
    expect(PROMISE).toContain('const fanEvents = onlyFanPromises(');
    expect(PROMISE).toMatch(/for \(const e of fanEvents\)/);
    expect(PROMISE).toMatch(/new Set\(fanEvents\.map/);
    // No consumer may still iterate the unfiltered rows.
    expect(PROMISE).not.toMatch(/for \(const e of events as DueEvent\[\]\)/);
    expect(PROMISE).not.toMatch(/new Set\(\(events as DueEvent\[\]\)\.map/);
  });

  it('returns early when nothing survives the filter, rather than emailing an empty digest', () => {
    expect(PROMISE).toMatch(/if \(!fanEvents\.length\) return/);
  });
});

describe('fan-obligation language stays attached to real obligations', () => {
  it('promiseReminders still says "Promise due" — for fan promises only', () => {
    // The fix must not weaken truthful urgency for genuine obligations, only stop applying it to
    // the artist's own chores.
    expect(PROMISE).toMatch(/Promise due in/);
  });

  it('the reminder paths are the only place this language could reach a ramp step', () => {
    // Guard against a future reader picking up fulfillment_events without the boundary. Both
    // communication readers are now filtered; the three decision readers already were.
    for (const [label, src] of [['promiseReminders', PROMISE], ['calendarReminders', CALENDAR]] as const) {
      const readsEvents = /from\('fulfillment_events'\)/.test(src);
      const filters = /onlyFanPromises|FAN_PROMISE_FILTER/.test(src);
      expect(readsEvents && !filters, `${label} reads fulfillment_events without the boundary`).toBe(false);
    }
  });
});
