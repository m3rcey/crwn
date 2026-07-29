// calendar.ts — shared types + pure, client-safe helpers for the Promise Calendar
// (artist) and My CRWN Calendar (fan). NO supabase / server imports here so this
// file is safe to import from client components. The actual data projection lives
// in calendarProjection.ts (server-only).

export type CalendarItemType =
  | 'promise' // artist fulfillment task (artist side only)
  | 'roadmap' // revenue-ramp step (artist side only, never fan-visible)
  | 'campaign' // road_campaign deadline
  | 'mission' // mission deadline
  | 'city_unlock' // city_unlock deadline
  | 'bounty' // clip_bounty deadline / earning window
  | 'proof_of_demand' // demand test deadline
  | 'livestream' // scheduled live session
  | 'renewal'; // fan subscription renewal (fan side only)

export type CalendarItemStatus =
  | 'overdue'
  | 'today'
  | 'upcoming'
  | 'completed'
  | 'missed';

export interface CalendarItem {
  id: string; // stable per source row: `${sourceType}:${sourceId}`
  sourceType:
    | 'fulfillment_event'
    | 'road_campaign'
    | 'mission'
    | 'city_unlock'
    | 'clip_bounty'
    | 'proof_of_demand'
    | 'live_session'
    | 'subscription';
  sourceId: string;
  type: CalendarItemType;
  title: string;
  subtitle?: string; // artist name (fan side) or audience/source (artist side)
  dueAt: string; // ISO timestamp
  status: CalendarItemStatus;
  cta?: string;
  href?: string;
  reward?: string; // "Vault access", "$50 + commission", etc.
  meta?: Record<string, unknown>;
}

export const ITEM_TYPE_LABEL: Record<CalendarItemType, string> = {
  promise: 'Promise',
  roadmap: 'Roadmap',
  campaign: 'Campaign',
  mission: 'Mission',
  city_unlock: 'City unlock',
  bounty: 'Earning window',
  proof_of_demand: 'Demand test',
  livestream: 'Livestream',
  renewal: 'Renewal',
};

// Buckets used by both calendars to group a flat, sorted item list.
export type CalendarBucket = 'overdue' | 'today' | 'week' | 'later' | 'completed';

export const BUCKET_LABEL: Record<CalendarBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  week: 'This week',
  later: 'Later',
  completed: 'Completed',
};

/** Classify an item into a display bucket relative to `now` (defaults to Date.now). */
export function bucketFor(item: CalendarItem, now: Date = new Date()): CalendarBucket {
  if (item.status === 'completed') return 'completed';
  if (item.status === 'overdue' || item.status === 'missed') return 'overdue';
  const due = new Date(item.dueAt);
  const startToday = startOfDay(now);
  const startTomorrow = new Date(startToday.getTime() + 86400000);
  const startNextWeek = new Date(startToday.getTime() + 7 * 86400000);
  if (due < startTomorrow) return 'today';
  if (due < startNextWeek) return 'week';
  return 'later';
}

/** Midnight of the given date in the runtime's local timezone. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Derive status from a due date. `completed`/`missed` are passed through by callers. */
export function statusForDue(dueAt: string, now: Date = new Date()): CalendarItemStatus {
  const due = new Date(dueAt);
  if (due < now) return 'overdue';
  if (startOfDay(due).getTime() === startOfDay(now).getTime()) return 'today';
  return 'upcoming';
}

/** Human relative label: "Overdue 3d", "Today", "Tomorrow", "in 5d", "Aug 12". */
export function relativeDueLabel(dueAt: string, now: Date = new Date()): string {
  const due = new Date(dueAt);
  const ms = due.getTime() - now.getTime();
  const dayMs = 86400000;
  const dueDay = startOfDay(due).getTime();
  const nowDay = startOfDay(now).getTime();
  const dayDiff = Math.round((dueDay - nowDay) / dayMs);

  if (ms < 0) {
    // Same calendar day but the time already passed — hours late, not a full day.
    if (dayDiff === 0) return 'Overdue today';
    const overdueDays = Math.abs(dayDiff);
    return overdueDays === 1 ? 'Overdue 1d' : `Overdue ${overdueDays}d`;
  }
  if (dayDiff === 0) {
    // Same calendar day — show the time if it's still ahead.
    return `Today ${formatTime(due)}`;
  }
  if (dayDiff === 1) return 'Tomorrow';
  if (dayDiff <= 6) return `in ${dayDiff}d`;
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Sort: overdue first (most overdue first), then soonest upcoming. Completed last. */
export function sortCalendarItems(items: CalendarItem[]): CalendarItem[] {
  const rank: Record<CalendarItemStatus, number> = {
    overdue: 0,
    missed: 0,
    today: 1,
    upcoming: 2,
    completed: 3,
  };
  return [...items].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });
}
