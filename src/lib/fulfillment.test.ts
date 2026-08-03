import { describe, it, expect } from 'vitest';
import {
  MISSED_GRACE_DAYS,
  missedCutoff,
  shouldMarkMissed,
  latenessDays,
  wasLate,
  isTerminalFulfillmentStatus,
  summarizePromiseHealth,
} from './fulfillment';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-03T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString();

describe('the missed threshold is one founder-adjustable constant', () => {
  it('defaults to 14 days', () => {
    expect(MISSED_GRACE_DAYS).toBe(14);
  });

  it('cutoff is the grace period behind now', () => {
    expect(missedCutoff(NOW).toISOString()).toBe(daysAgo(MISSED_GRACE_DAYS));
  });

  it('a negative grace period is floored at zero rather than moving the cutoff forward', () => {
    expect(missedCutoff(NOW, -5).getTime()).toBe(NOW.getTime());
  });
});

describe('shouldMarkMissed', () => {
  it('marks a pending promise past the grace period', () => {
    expect(shouldMarkMissed({ status: 'pending', due_at: daysAgo(15) }, NOW)).toBe(true);
  });

  it('leaves a pending promise inside the grace period alone', () => {
    expect(shouldMarkMissed({ status: 'pending', due_at: daysAgo(13) }, NOW)).toBe(false);
    expect(shouldMarkMissed({ status: 'pending', due_at: daysAgo(1) }, NOW)).toBe(false);
  });

  it('leaves a promise that is not yet due alone', () => {
    expect(shouldMarkMissed({ status: 'pending', due_at: daysAhead(5) }, NOW)).toBe(false);
  });

  it('never touches a terminal status, however old', () => {
    for (const status of ['completed', 'missed', 'cancelled', 'canceled', 'skipped']) {
      expect(shouldMarkMissed({ status, due_at: daysAgo(400) }, NOW)).toBe(false);
    }
  });

  it('ignores an event with no due date or an unparseable one', () => {
    expect(shouldMarkMissed({ status: 'pending', due_at: null }, NOW)).toBe(false);
    expect(shouldMarkMissed({ status: 'pending', due_at: 'soon' }, NOW)).toBe(false);
  });

  it('is exactly on the boundary at the cutoff instant, not before it', () => {
    expect(shouldMarkMissed({ status: 'pending', due_at: daysAgo(MISSED_GRACE_DAYS) }, NOW)).toBe(false);
    expect(
      shouldMarkMissed({ status: 'pending', due_at: new Date(NOW.getTime() - MISSED_GRACE_DAYS * DAY - 1).toISOString() }, NOW),
    ).toBe(true);
  });
});

describe('isTerminalFulfillmentStatus', () => {
  it('covers both spellings of cancelled, because the codebase has used each', () => {
    expect(isTerminalFulfillmentStatus('cancelled')).toBe(true);
    expect(isTerminalFulfillmentStatus('canceled')).toBe(true);
  });

  it('pending is not terminal', () => {
    expect(isTerminalFulfillmentStatus('pending')).toBe(false);
    expect(isTerminalFulfillmentStatus(null)).toBe(false);
  });
});

describe('latenessDays: derived from the two timestamps the table already stores', () => {
  it('counts whole days late', () => {
    expect(latenessDays('2026-08-01T00:00:00.000Z', '2026-08-04T00:00:00.000Z')).toBe(3);
  });

  it('an on-time completion is 0, not negative', () => {
    expect(latenessDays('2026-08-04T00:00:00.000Z', '2026-08-04T00:00:00.000Z')).toBe(0);
  });

  it('an early completion is 0, never negative', () => {
    expect(latenessDays('2026-08-04T00:00:00.000Z', '2026-08-01T00:00:00.000Z')).toBe(0);
  });

  it('floors a partial day: 23 hours late is not yet a day late', () => {
    expect(latenessDays('2026-08-01T00:00:00.000Z', '2026-08-01T23:00:00.000Z')).toBe(0);
    expect(latenessDays('2026-08-01T00:00:00.000Z', '2026-08-02T01:00:00.000Z')).toBe(1);
  });

  it('is null when either timestamp is missing or unparseable', () => {
    expect(latenessDays(null, '2026-08-04T00:00:00.000Z')).toBeNull();
    expect(latenessDays('2026-08-01T00:00:00.000Z', null)).toBeNull();
    expect(latenessDays('nope', '2026-08-04T00:00:00.000Z')).toBeNull();
  });

  it('wasLate agrees with latenessDays', () => {
    expect(wasLate('2026-08-01T00:00:00.000Z', '2026-08-04T00:00:00.000Z')).toBe(true);
    expect(wasLate('2026-08-04T00:00:00.000Z', '2026-08-04T00:00:00.000Z')).toBe(false);
    expect(wasLate(null, null)).toBe(false);
  });
});

describe('summarizePromiseHealth', () => {
  it('an empty calendar has null rates, not zero rates', () => {
    const h = summarizePromiseHealth([], NOW);
    expect(h.resolved).toBe(0);
    expect(h.completionRate).toBeNull();
    expect(h.missedRate).toBeNull();
    expect(h.lateCompletionRate).toBeNull();
    expect(h.medianLatenessDays).toBeNull();
  });

  it('computes completion, missed and late-completion rates', () => {
    const h = summarizePromiseHealth(
      [
        { status: 'completed', due_at: daysAgo(30), completed_at: daysAgo(30) }, // on time
        { status: 'completed', due_at: daysAgo(20), completed_at: daysAgo(18) }, // 2 days late
        { status: 'missed', due_at: daysAgo(60) },
        { status: 'missed', due_at: daysAgo(90) },
      ],
      NOW,
    );
    expect(h.completed).toBe(2);
    expect(h.missed).toBe(2);
    expect(h.resolved).toBe(4);
    expect(h.completionRate).toBeCloseTo(0.5);
    expect(h.missedRate).toBeCloseTo(0.5);
    expect(h.lateCompletions).toBe(1);
    expect(h.lateCompletionRate).toBeCloseTo(0.5);
  });

  it('separates overdue-within-grace from missed, so an artist is not scored during their grace period', () => {
    const h = summarizePromiseHealth(
      [
        { status: 'pending', due_at: daysAgo(3) }, // overdue, inside grace
        { status: 'pending', due_at: daysAgo(20) }, // past grace: due for the sweep
        { status: 'pending', due_at: daysAhead(10) }, // not due at all
      ],
      NOW,
    );
    expect(h.overdueWithinGrace).toBe(1);
    // Counted as missed on read so the summary does not lag the nightly cron by up to a day.
    expect(h.missed).toBe(1);
    expect(h.resolved).toBe(1);
  });

  it('does not count a future promise as anything', () => {
    const h = summarizePromiseHealth([{ status: 'pending', due_at: daysAhead(30) }], NOW);
    expect(h.resolved).toBe(0);
    expect(h.overdueWithinGrace).toBe(0);
    expect(h.missed).toBe(0);
  });

  it('takes the median of LATE completions only, ignoring the on-time ones', () => {
    const h = summarizePromiseHealth(
      [
        { status: 'completed', due_at: daysAgo(50), completed_at: daysAgo(50) }, // on time
        { status: 'completed', due_at: daysAgo(40), completed_at: daysAgo(39) }, // 1 late
        { status: 'completed', due_at: daysAgo(30), completed_at: daysAgo(27) }, // 3 late
        { status: 'completed', due_at: daysAgo(20), completed_at: daysAgo(11) }, // 9 late
      ],
      NOW,
    );
    expect(h.lateCompletions).toBe(3);
    expect(h.medianLatenessDays).toBe(3);
  });

  it('averages the middle pair for an even number of late completions', () => {
    const h = summarizePromiseHealth(
      [
        { status: 'completed', due_at: daysAgo(40), completed_at: daysAgo(38) }, // 2
        { status: 'completed', due_at: daysAgo(30), completed_at: daysAgo(26) }, // 4
      ],
      NOW,
    );
    expect(h.medianLatenessDays).toBe(3);
  });

  it('a completed promise with no completed_at is counted but never called late', () => {
    const h = summarizePromiseHealth([{ status: 'completed', due_at: daysAgo(10), completed_at: null }], NOW);
    expect(h.completed).toBe(1);
    expect(h.lateCompletions).toBe(0);
    expect(h.lateCompletionRate).toBe(0);
  });

  it('respects an injected grace period', () => {
    const events = [{ status: 'pending', due_at: daysAgo(5) }];
    expect(summarizePromiseHealth(events, NOW, 14).overdueWithinGrace).toBe(1);
    expect(summarizePromiseHealth(events, NOW, 2).missed).toBe(1);
  });
});
