// How long is left to vote, in words.
//
// Deliberately expressed as REMAINING TIME rather than a clock time. "Closes in 12m 08s"
// is the same true statement in every timezone; "closes at 8:00 PM" is only correct in
// the venue's zone and quietly misleads everyone else, including the artist checking from
// a different city. The wall-clock time still appears elsewhere for planning; this is the
// urgency, and urgency is a duration.
//
// Pure and side-effect free: the ticking lives in the component, the arithmetic lives
// here where it can be tested without a clock.

export interface CountdownParts {
  /** True once the closing instant has passed, or when there is nothing to count to. */
  expired: boolean;
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Break the gap between now and `closesAt` into whole units. A missing or unparseable
 * date returns `expired: false` with a zero total and is reported by `hasDeadline`, so a
 * vote with no closing time never renders a countdown that reads "0s" and looks over.
 */
export function countdownFrom(closesAt: string | null | undefined, now: Date): CountdownParts {
  const none: CountdownParts = { expired: false, totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  if (!closesAt) return none;
  const end = new Date(closesAt).getTime();
  if (Number.isNaN(end)) return none;

  const totalMs = end - now.getTime();
  if (totalMs <= 0) {
    return { expired: true, totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  return {
    expired: false,
    totalMs,
    days: Math.floor(totalMs / DAY),
    hours: Math.floor((totalMs % DAY) / HOUR),
    minutes: Math.floor((totalMs % HOUR) / MINUTE),
    seconds: Math.floor((totalMs % MINUTE) / SECOND),
  };
}

/** Is there a closing instant to count down to at all? */
export function hasDeadline(closesAt: string | null | undefined): boolean {
  if (!closesAt) return false;
  return !Number.isNaN(new Date(closesAt).getTime());
}

/**
 * Two units, never three, and seconds only once they matter.
 *
 * A vote closing in three days does not need a second hand: it changes nothing the fan
 * would do and it turns a calm line into a flicker. Inside the last hour the seconds are
 * the whole point, which is the moment a room is being asked to vote before the set ends.
 */
export function formatCountdown(parts: CountdownParts): string {
  if (parts.expired) return 'Closed';
  const { days, hours, minutes, seconds } = parts;
  if (days > 0) {
    const d = `${days} ${days === 1 ? 'day' : 'days'}`;
    return hours > 0 ? `${d} ${hours}h` : d;
  }
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

/**
 * Under an hour a vote is genuinely about to end, which is when a room should feel it.
 * Used to make the countdown louder rather than to change what it says.
 */
export function isUrgent(parts: CountdownParts): boolean {
  return !parts.expired && parts.totalMs > 0 && parts.totalMs < HOUR;
}

/** How often to re-render: every second inside the last hour, otherwise every minute. */
export function tickIntervalMs(parts: CountdownParts): number {
  return isUrgent(parts) || parts.totalMs < DAY ? SECOND : MINUTE;
}

/**
 * The full closing instant in the reader's own locale, for the quieter line under the
 * countdown ("Closes Saturday, Sep 26 at 8:00 PM"). Returns null when there is no
 * deadline, so callers render nothing rather than an empty label.
 */
export function closingLabel(closesAt: string | null | undefined, locale?: string): string | null {
  if (!hasDeadline(closesAt)) return null;
  const d = new Date(closesAt as string);
  return d.toLocaleString(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
