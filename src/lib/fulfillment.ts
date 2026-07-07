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
