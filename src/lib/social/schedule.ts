/**
 * The half of the publishing schedule that runs ON THE SERVER.
 *
 * The slot MATHS (local wall clock to absolute UTC, daylight saving, spreading N posts across a
 * window) lives in scripts/lib/schedule.mjs, because its only consumer is the local ingest
 * command and a .mjs cannot be imported from TypeScript. Splitting by consumer rather than
 * duplicating keeps one implementation of each function; both halves are covered by
 * src/lib/social/schedule.test.ts.
 *
 * What the tick needs is only this: given a slot and the current time, should it publish?
 */

/**
 * How far a tick looks backwards for work it missed.
 *
 * A tick that only published posts due in the last few seconds would drop anything whose slot
 * passed while a deploy was in flight or a tick failed. Looking back means a missed slot still
 * goes out late rather than never. It is capped because a post that is hours stale is no longer
 * the post the founder scheduled, and silently publishing yesterday's queue at 3am is worse than
 * skipping it.
 */
export const MISSED_SLOT_GRACE_MINUTES = 90;

/**
 * Which queued rows a tick should publish.
 *
 * Deliberately expressed as a pure predicate over timestamps so the boundary conditions are
 * testable without a database: due but not yet published, and not so stale that publishing it
 * would surprise the founder.
 */
export function isDue(
  scheduledFor: Date,
  now: Date,
  graceMinutes: number = MISSED_SLOT_GRACE_MINUTES
): { due: boolean; reason: 'due' | 'future' | 'expired' } {
  const deltaMs = now.getTime() - scheduledFor.getTime();
  if (deltaMs < 0) return { due: false, reason: 'future' };
  if (deltaMs > graceMinutes * 60000) return { due: false, reason: 'expired' };
  return { due: true, reason: 'due' };
}
