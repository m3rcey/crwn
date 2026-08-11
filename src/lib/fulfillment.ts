// fulfillment.ts — recurrence math for fulfillment obligations. Pure, dependency-
// free (no date library in this repo) so it's unit-checkable offline and safe to
// import anywhere. The DB writes that USE these live in the API routes.

export type Recurrence =
  | 'none'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'custom';

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: 'One-time',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  custom: 'Custom',
};

export const FULFILLMENT_TYPE_LABEL: Record<string, string> = {
  content_drop: 'Content drop',
  livestream: 'Livestream',
  event: 'Event',
  message: 'Message / update',
  file_delivery: 'File delivery',
  shipment: 'Shipment',
  custom_thankyou: 'Thank-you',
  fan_council: 'Fan council / vote',
  access_unlock: 'Access unlock',
  manual_task: 'Manual task',
};

/**
 * Next due date after `from` for a recurrence. Returns null for 'none'/'custom'
 * (custom has no built-in cadence in v1). Month-based cadences clamp to the last
 * day of the target month so Jan-31 + 1mo => Feb-28/29 rather than rolling into March.
 */
export function computeNextDue(recurrence: Recurrence, from: Date): Date | null {
  const d = new Date(from);
  switch (recurrence) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      return d;
    case 'biweekly':
      d.setDate(d.getDate() + 14);
      return d;
    case 'monthly':
      return addMonthsClamped(d, 1);
    case 'quarterly':
      return addMonthsClamped(d, 3);
    case 'none':
    case 'custom':
    default:
      return null;
  }
}

/** Add whole months, clamping the day so month-end dates don't overflow. */
export function addMonthsClamped(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getDate();
  d.setDate(1); // avoid overflow while shifting the month
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/**
 * Given a recurring obligation and the moment its current cycle was completed,
 * return the next due date (or null if it's one-time / has no cadence).
 * We advance from the later of (previous due, completion time) so a late
 * completion doesn't immediately produce another overdue cycle.
 */
export function nextDueAfterCompletion(
  recurrence: Recurrence,
  previousDueAt: string | null,
  completedAt: Date,
): Date | null {
  const base =
    previousDueAt && new Date(previousDueAt) > completedAt
      ? new Date(previousDueAt)
      : completedAt;
  return computeNextDue(recurrence, base);
}

// ---------------------------------------------------------------------------
// Promise reliability: missed, late, and the health summary derived from them
// ---------------------------------------------------------------------------
//
// `fulfillment_events.status = 'missed'` was read in nine places and written in none, so a
// promise that was never delivered stayed `pending` forever and "missed" evaluated to zero
// across the whole product. The sweep that writes it lives in the daily 6am cron; the rules
// it applies live HERE, pure, so the threshold is one constant and the arithmetic is testable
// without a database.
//
// A promise is not late the second it is due. Artists deliver at midnight, timezones drift,
// and a product that declares a broken promise an hour after the due date is a product that
// gets ignored. The grace period is the whole difference between a signal and a nag.

/**
 * Days after `due_at` before a still-pending promise is recorded as MISSED.
 *
 * FOUNDER-ADJUSTABLE POLICY VALUE. There is no founder-approved threshold in CRWN Brain or
 * the repository for this, so 14 days is a documented temporary default: long enough that a
 * busy week is not a broken promise, short enough that the signal still means something
 * inside a monthly cadence. Change it HERE and nowhere else.
 */
export const MISSED_GRACE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Statuses that are already resolved. A sweep must never touch one of these. */
export const TERMINAL_FULFILLMENT_STATUSES = ['completed', 'missed', 'cancelled', 'canceled', 'skipped'] as const;

export function isTerminalFulfillmentStatus(status: string | null | undefined): boolean {
  return !!status && (TERMINAL_FULFILLMENT_STATUSES as readonly string[]).includes(status);
}

/**
 * The instant at which a promise due at `dueAt` becomes missed. Exported so the sweep can
 * turn it into a single indexed `due_at < cutoff` comparison rather than filtering in JS.
 */
export function missedCutoff(now: Date, graceDays: number = MISSED_GRACE_DAYS): Date {
  return new Date(now.getTime() - Math.max(0, graceDays) * DAY_MS);
}

/**
 * Should this event be recorded as missed? True only for a still-pending promise whose due
 * date is more than the grace period in the past.
 */
export function shouldMarkMissed(
  event: { status?: string | null; due_at?: string | null },
  now: Date,
  graceDays: number = MISSED_GRACE_DAYS,
): boolean {
  if (event.status !== 'pending') return false;
  if (!event.due_at) return false;
  const due = new Date(event.due_at);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < missedCutoff(now, graceDays).getTime();
}

/**
 * How many whole days late a completion was. 0 means on time or early, never negative.
 *
 * Derived from the two authoritative timestamps the table already stores, so there is no
 * `days_late` column to keep in sync. A stored copy would buy nothing: lateness is a pure
 * function of two values that never change after completion.
 */
export function latenessDays(
  dueAt: string | Date | null | undefined,
  completedAt: string | Date | null | undefined,
): number | null {
  if (!dueAt || !completedAt) return null;
  const due = new Date(dueAt);
  const done = new Date(completedAt);
  if (Number.isNaN(due.getTime()) || Number.isNaN(done.getTime())) return null;
  const diff = done.getTime() - due.getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / DAY_MS);
}

/** Was a completed promise delivered after its due date? */
export function wasLate(
  dueAt: string | Date | null | undefined,
  completedAt: string | Date | null | undefined,
): boolean {
  const days = latenessDays(dueAt, completedAt);
  return days !== null && days > 0;
}

export interface PromiseHealthEvent {
  status?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
}

export interface PromiseHealth {
  /** Events that reached a verdict: completed or missed. Pending ones are not yet evidence. */
  resolved: number;
  completed: number;
  missed: number;
  lateCompletions: number;
  /** Still pending and already past due, but inside the grace period. */
  overdueWithinGrace: number;
  /** completed / resolved, 0-1. Null when nothing has resolved yet. */
  completionRate: number | null;
  /** missed / resolved, 0-1. Null when nothing has resolved yet. */
  missedRate: number | null;
  /** lateCompletions / completed, 0-1. Null when nothing has completed yet. */
  lateCompletionRate: number | null;
  /** Median whole days late across LATE completions only. Null when there are none. */
  medianLatenessDays: number | null;
}

// ---------------------------------------------------------------------------
// Fan promise vs the artist's own plan (Z12)
// ---------------------------------------------------------------------------

/**
 * The Revenue Ramp writes the artist's PRIVATE growth plan into the same tables the Promise
 * Calendar uses (`src/lib/revenueRampSeed.ts`), on purpose: it puts dated work in the place the
 * artist already looks instead of an article they have to remember to open. Each of those rows
 * carries `metadata.ramp_step_key`, and `auto_create_fan_items: false` keeps it off every fan's
 * calendar.
 *
 * WHAT THAT PRIVACY BOUNDARY DID NOT COVER, and this predicate does.
 * Three readers counted those rows as promises owed to paying fans:
 *   - the Constraint Engine's evidence assembler,
 *   - the Manager's fulfillment insights,
 *   - the Roadmap's `promises_on_track` step.
 * So "Personally message your 50 most engaged fans" going a day past due made CRWN tell the artist
 * *"These fans have already paid for something they have not received."* Nobody paid for it. And
 * because FULFILLMENT is evaluated first and outranks every growth stage, one stale private to-do
 * could suppress REACH and FIRST_PAID indefinitely, which also gates the Virality Engine off.
 *
 * A ramp step is work the artist owes THEMSELVES. A promise is work they owe someone who paid.
 * The two are not the same fact and must never be counted together.
 */
export function isFanPromiseEvent(event: {
  metadata?: Record<string, unknown> | null;
}): boolean {
  const key = event?.metadata?.ramp_step_key;
  return typeof key !== 'string' || key.length === 0;
}

/** Drop the artist's own ramp steps, keeping only promises owed to fans. */
export function onlyFanPromises<T extends { metadata?: Record<string, unknown> | null }>(
  events: T[],
): T[] {
  return events.filter(isFanPromiseEvent);
}

/**
 * The PostgREST filter that expresses the same rule for a `count`/`head` query, where there are no
 * rows to filter in JavaScript. Kept beside the predicate so the two definitions cannot drift.
 */
export const FAN_PROMISE_FILTER = { column: 'metadata->>ramp_step_key', value: null } as const;

/**
 * Summarize promise reliability from raw events. Pure, so the definitions of "completion rate"
 * and "late" exist once and any surface that shows them shows the same number.
 *
 * Rates are null rather than 0 on an empty denominator, because "no promises have resolved
 * yet" and "every promise was missed" are opposite facts and must not render identically.
 *
 * Callers that mean "promises owed to FANS" must pass events through `onlyFanPromises` first. This
 * function deliberately does not filter: the Promise Calendar shows ramp steps on purpose, and a
 * filter buried in here would silently change what that surface displays.
 */
export function summarizePromiseHealth(
  events: PromiseHealthEvent[],
  now: Date = new Date(),
  graceDays: number = MISSED_GRACE_DAYS,
): PromiseHealth {
  let completed = 0;
  let missed = 0;
  let lateCompletions = 0;
  let overdueWithinGrace = 0;
  const latenesses: number[] = [];

  for (const e of events) {
    if (e.status === 'completed') {
      completed += 1;
      const days = latenessDays(e.due_at, e.completed_at);
      if (days !== null && days > 0) {
        lateCompletions += 1;
        latenesses.push(days);
      }
    } else if (e.status === 'missed') {
      missed += 1;
    } else if (e.status === 'pending' && e.due_at) {
      const due = new Date(e.due_at);
      if (!Number.isNaN(due.getTime()) && due.getTime() < now.getTime()) {
        // Past due but not yet swept. Counted separately so it is visible without being
        // scored as a broken promise before the artist has had their grace period.
        if (!shouldMarkMissed(e, now, graceDays)) overdueWithinGrace += 1;
        else missed += 1; // due for the sweep; count it now so reads do not lag the cron
      }
    }
  }

  const resolved = completed + missed;
  const median = (xs: number[]): number | null => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
  };

  return {
    resolved,
    completed,
    missed,
    lateCompletions,
    overdueWithinGrace,
    completionRate: resolved > 0 ? completed / resolved : null,
    missedRate: resolved > 0 ? missed / resolved : null,
    lateCompletionRate: completed > 0 ? lateCompletions / completed : null,
    medianLatenessDays: median(latenesses),
  };
}
