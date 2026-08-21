import { describe, it, expect } from 'vitest';
import {
  tzOffsetMs,
  isValidTimeZone,
  zonedTimeToUtc,
  formatTimeInZone,
  resolveShowPhase,
  scheduleLabel,
  DEFAULT_SHOW_TIMEZONE,
  type ShowPoll,
} from './schedule';

const ET = 'America/New_York';

function poll(over: Partial<ShowPoll> & { id: string }): ShowPoll {
  return {
    stage_label: 'Show 1',
    question: 'What should Julius sing for the finale?',
    options: [
      { id: 'a', label: 'Never Too Much' },
      { id: 'b', label: 'Outstanding' },
    ],
    status: 'open',
    is_free: true,
    allowed_tier_ids: [],
    opens_at: null,
    closes_at: null,
    winning_option_id: null,
    ...over,
  } as ShowPoll;
}

describe('timezone conversion (the DST trap)', () => {
  it('8:00 PM in Atlanta on Sept 26 is EDT, which is midnight UTC, not 1am', () => {
    // The founder said "8 PM EST". A fixed EST offset would produce 01:00Z and close the
    // show an hour late, because Atlanta is on EDT in September.
    const utc = zonedTimeToUtc('2026-09-26', '20:00', ET);
    expect(utc?.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  it('11:00 PM the same night is 03:00Z the next day', () => {
    expect(zonedTimeToUtc('2026-09-26', '23:00', ET)?.toISOString()).toBe('2026-09-27T03:00:00.000Z');
  });

  it('the SAME wall time in January is an hour later in UTC (EST)', () => {
    expect(zonedTimeToUtc('2026-01-15', '20:00', ET)?.toISOString()).toBe('2026-01-16T01:00:00.000Z');
  });

  it('works for a zone that does not observe DST at all', () => {
    expect(zonedTimeToUtc('2026-09-26', '20:00', 'America/Phoenix')?.toISOString())
      .toBe('2026-09-27T03:00:00.000Z');
    expect(zonedTimeToUtc('2026-01-15', '20:00', 'America/Phoenix')?.toISOString())
      .toBe('2026-01-16T03:00:00.000Z');
  });

  it('a spring-forward time that does not exist still yields a real instant', () => {
    // 2:30am on the US spring-forward date never happens. It must not throw or return
    // an invalid date; any deterministic real instant is acceptable.
    const utc = zonedTimeToUtc('2026-03-08', '02:30', ET);
    expect(utc).not.toBeNull();
    expect(Number.isNaN(utc!.getTime())).toBe(false);
  });

  it('a fall-back time that happens twice resolves to a real instant showing that wall time', () => {
    const utc = zonedTimeToUtc('2026-11-01', '01:30', ET);
    expect(utc).not.toBeNull();
    expect(formatTimeInZone(utc!, ET)).toBe('1:30 AM');
  });

  it('rejects malformed input rather than guessing a date', () => {
    expect(zonedTimeToUtc('26/09/2026', '20:00', ET)).toBeNull();
    expect(zonedTimeToUtc('2026-09-26', '8pm', ET)).toBeNull();
    expect(zonedTimeToUtc('2026-09-26', '25:00', ET)).toBeNull();
    expect(zonedTimeToUtc('2026-13-26', '20:00', ET)).toBeNull();
    expect(zonedTimeToUtc('2026-09-26', '20:00', 'Not/AZone')).toBeNull();
  });

  it('tzOffsetMs reports the real seasonal offsets for Eastern', () => {
    expect(tzOffsetMs(Date.UTC(2026, 8, 26, 12), ET)).toBe(-4 * 3600 * 1000); // September, EDT
    expect(tzOffsetMs(Date.UTC(2026, 0, 15, 12), ET)).toBe(-5 * 3600 * 1000); // January, EST
  });

  it('validates zone ids and defaults to Eastern for the live-show template', () => {
    expect(isValidTimeZone(ET)).toBe(true);
    expect(isValidTimeZone('America/Atlanta')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
    expect(DEFAULT_SHOW_TIMEZONE).toBe('America/New_York');
  });

  it('formats a stored instant back into local show time', () => {
    expect(formatTimeInZone('2026-09-27T00:00:00.000Z', ET)).toBe('8:00 PM');
    expect(formatTimeInZone('2026-09-27T03:00:00.000Z', ET)).toBe('11:00 PM');
  });
});

describe('resolveShowPhase (one URL, two shows)', () => {
  // Julius's night: Show 1 closes 8pm ET, Show 2 runs 8:30pm to 11pm ET.
  const show1 = poll({
    id: 's1',
    stage_label: 'Show 1',
    closes_at: '2026-09-27T00:00:00.000Z', // 8:00 PM ET
  });
  const show2 = poll({
    id: 's2',
    stage_label: 'Show 2',
    options: [{ id: 'a', label: 'Bad Boy' }, { id: 'b', label: 'I Like' }],
    opens_at: '2026-09-27T00:30:00.000Z', // 8:30 PM ET
    closes_at: '2026-09-27T03:00:00.000Z', // 11:00 PM ET
  });
  const night = [show1, show2];

  it('during Show 1 the link shows Show 1 only', () => {
    const phase = resolveShowPhase(night, new Date('2026-09-26T23:00:00Z')); // 7pm ET
    expect(phase.kind).toBe('active');
    expect(phase.kind === 'active' && phase.poll.id).toBe('s1');
  });

  it('at exactly 8:00 PM ET Show 1 is closed, not open', () => {
    const phase = resolveShowPhase(night, new Date('2026-09-27T00:00:00Z'));
    expect(phase.kind).toBe('between');
  });

  it('between the sets it names the next show and when it opens', () => {
    const phase = resolveShowPhase(night, new Date('2026-09-27T00:10:00Z')); // 8:10pm ET
    expect(phase.kind).toBe('between');
    if (phase.kind !== 'between') throw new Error('expected between');
    expect(phase.nextPoll.id).toBe('s2');
    expect(formatTimeInZone(phase.opensAt, ET)).toBe('8:30 PM');
    expect(phase.endedPoll?.id).toBe('s1');
  });

  it('during Show 2 the SAME link shows Show 2', () => {
    const phase = resolveShowPhase(night, new Date('2026-09-27T01:30:00Z')); // 9:30pm ET
    expect(phase.kind).toBe('active');
    expect(phase.kind === 'active' && phase.poll.id).toBe('s2');
  });

  it('after 11 PM ET the night is over', () => {
    const phase = resolveShowPhase(night, new Date('2026-09-27T03:30:00Z'));
    expect(phase.kind).toBe('ended');
    expect(phase.kind === 'ended' && phase.lastPoll?.id).toBe('s2');
  });

  it('never shows both polls at once: two open polls resolve to the one closing soonest', () => {
    const bothOpen = [
      poll({ id: 'late', closes_at: '2026-09-27T03:00:00.000Z' }),
      poll({ id: 'early', closes_at: '2026-09-27T00:00:00.000Z' }),
    ];
    const phase = resolveShowPhase(bothOpen, new Date('2026-09-26T23:00:00Z'));
    expect(phase.kind === 'active' && phase.poll.id).toBe('early');
  });

  it('is stable when two open polls close at the same moment', () => {
    const tie = [
      poll({ id: 'bbb', closes_at: '2026-09-27T00:00:00.000Z' }),
      poll({ id: 'aaa', closes_at: '2026-09-27T00:00:00.000Z' }),
    ];
    const at = new Date('2026-09-26T23:00:00Z');
    const first = resolveShowPhase(tie, at);
    const second = resolveShowPhase([...tie].reverse(), at);
    expect(first.kind === 'active' && first.poll.id).toBe('aaa');
    expect(second.kind === 'active' && second.poll.id).toBe('aaa');
  });

  it('a manually opened poll with no end time stays the active one', () => {
    const phase = resolveShowPhase([poll({ id: 'manual', closes_at: null })], new Date('2027-01-01T00:00:00Z'));
    expect(phase.kind === 'active' && phase.poll.id).toBe('manual');
  });

  it('drafts are invisible to the public resolver, even as "opens soon"', () => {
    const phase = resolveShowPhase(
      [poll({ id: 'd1', status: 'draft', opens_at: '2026-09-27T00:30:00.000Z' })],
      new Date('2026-09-26T23:00:00Z'),
    );
    expect(phase.kind).toBe('none');
  });

  it('an event with nothing published resolves to none, never a crash', () => {
    expect(resolveShowPhase([], new Date()).kind).toBe('none');
  });

  it('a manual close of Show 1 hands over to the between state immediately', () => {
    const closedEarly = [{ ...show1, status: 'closed' as const }, show2];
    const phase = resolveShowPhase(closedEarly, new Date('2026-09-26T23:15:00Z')); // 7:15pm ET
    expect(phase.kind).toBe('between');
    expect(phase.kind === 'between' && phase.nextPoll.id).toBe('s2');
  });

  it('a manually opened Show 2 takes over even before its scheduled open', () => {
    const openedEarly = [{ ...show1, status: 'closed' as const }, { ...show2, opens_at: null }];
    const phase = resolveShowPhase(openedEarly, new Date('2026-09-26T23:15:00Z'));
    expect(phase.kind === 'active' && phase.poll.id).toBe('s2');
  });
});

describe('scheduleLabel (what Studio tells the artist)', () => {
  const at = new Date('2026-09-26T23:00:00Z'); // 7pm ET

  it('separates a scheduled close from a hand close', () => {
    const scheduledClose = poll({ id: 'x', closes_at: '2026-09-27T00:00:00.000Z' });
    expect(scheduleLabel(scheduledClose, at)).toBe('open');
    // Closed by hand while its scheduled close is still in the future.
    expect(scheduleLabel({ ...scheduledClose, status: 'closed' }, at)).toBe('closed_early');
    // Closed after the scheduled time: it ran its course.
    expect(scheduleLabel({ ...scheduledClose, status: 'closed' }, new Date('2026-09-27T01:00:00Z')))
      .toBe('closed_on_time');
  });

  it('flags an open poll with no end time, which would never auto-close', () => {
    expect(scheduleLabel(poll({ id: 'y', closes_at: null }), at)).toBe('open_no_end');
  });

  it('names draft and scheduled states', () => {
    expect(scheduleLabel(poll({ id: 'd', status: 'draft' }), at)).toBe('draft');
    expect(scheduleLabel(poll({ id: 's', opens_at: '2026-09-27T00:30:00.000Z' }), at)).toBe('scheduled');
  });
});
