// Member drip: a track can open to a tier N months after EACH MEMBER'S OWN start
// (schema-phase2-tier-unlock-months.sql, founder 2026-10-01).
//
// The database is the authority: can_play_track enforces the delay and tracks_public hands back
// audio only on its yes. This file is the SAME rule for rendering, so a waiting member sees
// "Unlocks in 12 days" instead of a play button the server will refuse. It never grants: every
// caller uses it only to show a lock the server already applies, or (in the owner's preview,
// which has no server answer) to remove access, never to add it.
//
// Kept in step with the SQL by memberDrip.test.ts: same shape, same fail-OPEN direction for a
// malformed value, same 120-month clamp, same start (COALESCE(started_at, created_at)).

export type TierUnlockMonths = Record<string, unknown> | null | undefined;

/** Whole months a tier waits on this track, or 0 for no delay. Mirrors the SQL exactly: a
 *  non-object map, a non-number entry, zero or a negative value all mean "no delay". */
export function unlockMonthsFor(map: unknown, tierId: string | null | undefined): number {
  if (!tierId || !map || typeof map !== 'object' || Array.isArray(map)) return 0;
  const raw = (map as Record<string, unknown>)[tierId];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  const months = Math.min(Math.floor(raw), 120);
  return months > 0 ? months : 0;
}

/** The moment a member who started at `start` hears the track: start + N calendar months,
 *  the same arithmetic as Postgres make_interval(months => N). */
export function unlockAt(start: Date, months: number): Date {
  const d = new Date(start.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // Postgres clamps Jan 31 + 1 month to Feb 28/29; do the same.
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export interface DripLock {
  months: number;
  /** When it opens for this member; null when the start is unknown (the owner's preview). */
  opensAt: Date | null;
}

/**
 * Is this track waiting on the member drip for this viewer? Rendering only.
 * `serverGranted` is the database's own answer (a locator on the tracks_public row): when it
 * says yes the track is open, whatever this computes. When it says no and the viewer's tier
 * carries a delay, this is the lock to show. `startedAt` is the member's subscription start;
 * without one (a preview persona) the lock shows with no date, as a day-one member sees it.
 */
export function dripLock(opts: {
  map: unknown;
  tierId: string | null | undefined;
  serverGranted: boolean;
  startedAt?: string | null;
  now?: Date;
}): DripLock | null {
  if (opts.serverGranted) return null;
  const months = unlockMonthsFor(opts.map, opts.tierId);
  if (!months) return null;
  const start = opts.startedAt ? new Date(opts.startedAt) : null;
  if (start && Number.isNaN(start.getTime())) return { months, opensAt: null };
  return { months, opensAt: start ? unlockAt(start, months) : null };
}

/** "Unlocks in 12 days" / "Unlocks tomorrow" / "Unlocks after month 2 of your membership". */
export function dripLabel(lock: DripLock, now: Date = new Date()): string {
  if (!lock.opensAt) return `Unlocks after month ${lock.months} of your membership`;
  const days = Math.ceil((lock.opensAt.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return 'Unlocking now';
  if (days === 1) return 'Unlocks tomorrow';
  return `Unlocks in ${days} days`;
}
