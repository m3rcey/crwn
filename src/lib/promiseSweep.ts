// promiseSweep.ts — SERVER ONLY. Transition long-overdue pending promises to `missed`.
//
// WHY THIS EXISTS
// `fulfillment_events.status = 'missed'` was read in nine places and written in none, so an
// undelivered promise stayed `pending` forever and every "missed" count in the product
// evaluated to zero. That made promise reliability unmeasurable over time: it could only ever
// be sampled at this instant by comparing due_at to now, which is not the same fact. A promise
// that was two months late and a promise that is two months overdue right now looked
// identical, and neither left a record.
//
// WHERE IT RUNS
// Piggybacked on the existing daily 6am cron (/api/cron/scheduled-releases), which already
// hosts promise reminders. Vercel Hobby caps crons at one per day and vercel.json is at 25
// entries, so the house pattern is to piggyback rather than add. There is no new schedule.
//
// SAFETY PROPERTIES
//  - Idempotent by construction: the UPDATE is guarded by `status = 'pending'`, so a second
//    run in the same day matches nothing. There is no read-then-write and no race to lose.
//  - Terminal states are untouchable. The guard is on the UPDATE itself, not on a JS filter,
//    so a completed, cancelled or already-missed event cannot be reclassified even if the
//    selection query were wrong.
//  - It creates nothing. No new fulfillment_events, no recurrence advance. Marking a promise
//    missed is a verdict on an existing row; generating the next cycle is the completion
//    path's job and duplicating it here would double an artist's calendar.
//  - Bounded per run, so one artist with a very stale calendar cannot starve the cron.

import { MISSED_GRACE_DAYS, missedCutoff } from '@/lib/fulfillment';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

/** Upper bound on rows touched per run. Well above any realistic daily backlog. */
const SWEEP_LIMIT = 500;

export interface PromiseSweepResult {
  marked: number;
  /** Set when the sweep could not run at all (missing table, DB error). */
  error?: string;
}

/**
 * Mark every pending fulfillment event whose due date is more than the grace period in the
 * past as `missed`. Returns how many rows changed. Never throws.
 *
 * `graceDays` is injectable for tests only. Production always uses the single founder-
 * adjustable constant in fulfillment.ts.
 */
export async function sweepMissedPromises(
  db: Db,
  opts?: { now?: Date; graceDays?: number; limit?: number },
): Promise<PromiseSweepResult> {
  const now = opts?.now ?? new Date();
  const graceDays = opts?.graceDays ?? MISSED_GRACE_DAYS;
  const cutoff = missedCutoff(now, graceDays).toISOString();
  const nowIso = now.toISOString();

  try {
    // Select first so the run is bounded and reportable. The ids are then updated under the
    // same `status = 'pending'` guard, which is what makes a concurrent completion safe: if a
    // fan-facing completion lands between the select and the update, the update simply misses.
    const { data: due, error: selErr } = await db
      .from('fulfillment_events')
      .select('id')
      .eq('status', 'pending')
      .lt('due_at', cutoff)
      .limit(opts?.limit ?? SWEEP_LIMIT);

    if (selErr) return { marked: 0, error: String(selErr.message ?? selErr) };
    const ids = (due ?? []).map((r: { id: string }) => r.id).filter(Boolean);
    if (ids.length === 0) return { marked: 0 };

    const { data: updated, error: updErr } = await db
      .from('fulfillment_events')
      .update({ status: 'missed', updated_at: nowIso })
      .in('id', ids)
      .eq('status', 'pending')
      .select('id');

    if (updErr) return { marked: 0, error: String(updErr.message ?? updErr) };
    return { marked: (updated ?? []).length };
  } catch (err) {
    return { marked: 0, error: String(err) };
  }
}
