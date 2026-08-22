import { describe, it, expect } from 'vitest';
import {
  countdownFrom,
  formatCountdown,
  hasDeadline,
  isUrgent,
  tickIntervalMs,
  closingLabel,
} from './countdown';

const NOW = new Date('2026-09-26T18:00:00Z');
const at = (iso: string) => countdownFrom(iso, NOW);

describe('countdownFrom', () => {
  it('breaks the gap into whole units', () => {
    const p = at('2026-09-27T20:30:45Z'); // 1d 2h 30m 45s
    expect([p.days, p.hours, p.minutes, p.seconds]).toEqual([1, 2, 30, 45]);
    expect(p.expired).toBe(false);
  });

  it('marks a passed instant expired and zeroes the parts', () => {
    const p = at('2026-09-26T17:59:59Z');
    expect(p.expired).toBe(true);
    expect([p.days, p.hours, p.minutes, p.seconds, p.totalMs]).toEqual([0, 0, 0, 0, 0]);
  });

  it('treats the exact closing instant as closed, never as one last second', () => {
    expect(at('2026-09-26T18:00:00Z').expired).toBe(true);
  });

  it('a missing or unparseable date is NOT expired (nothing to count to)', () => {
    for (const v of [null, undefined, '', 'not a date']) {
      const p = countdownFrom(v as string | null, NOW);
      expect(p.expired).toBe(false);
      expect(p.totalMs).toBe(0);
    }
  });
});

describe('hasDeadline', () => {
  it('separates "no deadline" from "bad deadline" from a real one', () => {
    expect(hasDeadline('2026-09-27T00:00:00Z')).toBe(true);
    expect(hasDeadline(null)).toBe(false);
    expect(hasDeadline('garbage')).toBe(false);
  });
});

describe('formatCountdown', () => {
  it('drops seconds when days remain, because a second hand changes nothing at that range', () => {
    expect(formatCountdown(at('2026-09-29T21:00:00Z'))).toBe('3 days 3h');
    expect(formatCountdown(at('2026-09-27T18:00:00Z'))).toBe('1 day');
  });

  it('uses hours and minutes inside a day', () => {
    expect(formatCountdown(at('2026-09-26T21:07:30Z'))).toBe('3h 07m');
  });

  it('shows seconds inside the last hour, when they are the whole point', () => {
    expect(formatCountdown(at('2026-09-26T18:12:08Z'))).toBe('12m 08s');
    expect(formatCountdown(at('2026-09-26T18:00:08Z'))).toBe('8s');
  });

  it('says Closed once it has passed', () => {
    expect(formatCountdown(at('2026-09-26T17:00:00Z'))).toBe('Closed');
  });

  it('never renders three units', () => {
    for (const iso of ['2026-09-29T21:34:56Z', '2026-09-26T21:07:30Z', '2026-09-26T18:12:08Z']) {
      expect(formatCountdown(at(iso)).split(' ').length).toBeLessThanOrEqual(3);
    }
  });
});

describe('isUrgent / tickIntervalMs', () => {
  it('is urgent only inside the last hour', () => {
    expect(isUrgent(at('2026-09-26T18:59:00Z'))).toBe(true);
    expect(isUrgent(at('2026-09-26T19:30:00Z'))).toBe(false);
    expect(isUrgent(at('2026-09-26T17:00:00Z'))).toBe(false); // expired is not urgent
  });

  it('ticks every second within a day and every minute beyond it', () => {
    expect(tickIntervalMs(at('2026-09-26T18:10:00Z'))).toBe(1000);
    expect(tickIntervalMs(at('2026-09-26T23:00:00Z'))).toBe(1000);
    expect(tickIntervalMs(at('2026-09-29T18:00:00Z'))).toBe(60000);
  });
});

describe('closingLabel', () => {
  it('renders a full instant, and nothing at all without one', () => {
    const label = closingLabel('2026-09-26T20:00:00Z', 'en-US');
    expect(label).toBeTruthy();
    expect(label).toMatch(/Sep/);
    expect(closingLabel(null)).toBeNull();
    expect(closingLabel('garbage')).toBeNull();
  });
});
