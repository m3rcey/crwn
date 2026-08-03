import { describe, it, expect } from 'vitest';
import { sweepMissedPromises } from './promiseSweep';
import { MISSED_GRACE_DAYS } from './fulfillment';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-03T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

interface Row {
  id: string;
  status: string;
  due_at: string | null;
}

/**
 * An in-memory stand-in that enforces the two guards that matter: the select filters on
 * status + due_at, and the UPDATE re-checks status, which is what makes a concurrent
 * completion safe and the whole sweep idempotent.
 */
function makeDb(rows: Row[], opts?: { selectError?: string; updateError?: string }) {
  const calls = { selects: 0, updates: 0 };

  const db = {
    from(table: string) {
      if (table !== 'fulfillment_events') throw new Error(`unexpected table ${table}`);
      return {
        select() {
          calls.selects += 1;
          const state: { status?: string; before?: string; limit?: number } = {};
          const chain = {
            eq(col: string, val: string) {
              if (col === 'status') state.status = val;
              return chain;
            },
            lt(col: string, val: string) {
              if (col === 'due_at') state.before = val;
              return chain;
            },
            limit(n: number) {
              state.limit = n;
              if (opts?.selectError) return Promise.resolve({ data: null, error: { message: opts.selectError } });
              const matched = rows
                .filter((r) => (state.status ? r.status === state.status : true))
                .filter((r) => (state.before && r.due_at ? r.due_at < state.before : !state.before))
                .slice(0, n)
                .map((r) => ({ id: r.id }));
              return Promise.resolve({ data: matched, error: null });
            },
          };
          return chain;
        },
        update(patch: Record<string, unknown>) {
          calls.updates += 1;
          const state: { ids?: string[]; status?: string } = {};
          const chain = {
            in(col: string, vals: string[]) {
              if (col === 'id') state.ids = vals;
              return chain;
            },
            eq(col: string, val: string) {
              if (col === 'status') state.status = val;
              return chain;
            },
            select() {
              if (opts?.updateError) return Promise.resolve({ data: null, error: { message: opts.updateError } });
              const changed: { id: string }[] = [];
              for (const r of rows) {
                if (!state.ids?.includes(r.id)) continue;
                // The guard: only a row still in the expected status is written.
                if (state.status && r.status !== state.status) continue;
                Object.assign(r, patch);
                changed.push({ id: r.id });
              }
              return Promise.resolve({ data: changed, error: null });
            },
          };
          return chain;
        },
      };
    },
  };

  return { db, rows, calls };
}

describe('sweepMissedPromises', () => {
  it('marks a pending promise past the grace period as missed', async () => {
    const { db, rows } = makeDb([{ id: 'a', status: 'pending', due_at: daysAgo(20) }]);
    const res = await sweepMissedPromises(db, { now: NOW });
    expect(res.marked).toBe(1);
    expect(rows[0].status).toBe('missed');
  });

  it('leaves a promise inside the grace period pending', async () => {
    const { db, rows } = makeDb([{ id: 'a', status: 'pending', due_at: daysAgo(MISSED_GRACE_DAYS - 1) }]);
    const res = await sweepMissedPromises(db, { now: NOW });
    expect(res.marked).toBe(0);
    expect(rows[0].status).toBe('pending');
  });

  it('never reclassifies a completed promise, however old', async () => {
    const { db, rows } = makeDb([{ id: 'a', status: 'completed', due_at: daysAgo(400) }]);
    const res = await sweepMissedPromises(db, { now: NOW });
    expect(res.marked).toBe(0);
    expect(rows[0].status).toBe('completed');
  });

  it('never reclassifies a cancelled promise', async () => {
    const { db, rows } = makeDb([{ id: 'a', status: 'cancelled', due_at: daysAgo(400) }]);
    await sweepMissedPromises(db, { now: NOW });
    expect(rows[0].status).toBe('cancelled');
  });

  it('is idempotent: a second run in the same day marks nothing more', async () => {
    const { db, rows } = makeDb([
      { id: 'a', status: 'pending', due_at: daysAgo(30) },
      { id: 'b', status: 'pending', due_at: daysAgo(40) },
    ]);
    const first = await sweepMissedPromises(db, { now: NOW });
    const second = await sweepMissedPromises(db, { now: NOW });
    expect(first.marked).toBe(2);
    expect(second.marked).toBe(0);
    expect(rows.every((r) => r.status === 'missed')).toBe(true);
  });

  it('creates nothing: the row count is unchanged', async () => {
    const { db, rows } = makeDb([{ id: 'a', status: 'pending', due_at: daysAgo(30) }]);
    await sweepMissedPromises(db, { now: NOW });
    expect(rows).toHaveLength(1);
  });

  it('does nothing when there is nothing due, and does not issue an update', async () => {
    const { db, calls } = makeDb([{ id: 'a', status: 'pending', due_at: daysAgo(1) }]);
    const res = await sweepMissedPromises(db, { now: NOW });
    expect(res.marked).toBe(0);
    expect(calls.updates).toBe(0);
  });

  it('respects an injected grace period', async () => {
    const { db, rows } = makeDb([{ id: 'a', status: 'pending', due_at: daysAgo(5) }]);
    const res = await sweepMissedPromises(db, { now: NOW, graceDays: 2 });
    expect(res.marked).toBe(1);
    expect(rows[0].status).toBe('missed');
  });

  it('is bounded by the limit so one stale calendar cannot starve the cron', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, status: 'pending', due_at: daysAgo(30) }));
    const { db } = makeDb(many);
    const res = await sweepMissedPromises(db, { now: NOW, limit: 4 });
    expect(res.marked).toBe(4);
  });

  it('reports a select failure without throwing', async () => {
    const { db } = makeDb([], { selectError: 'relation "fulfillment_events" does not exist' });
    const res = await sweepMissedPromises(db, { now: NOW });
    expect(res.marked).toBe(0);
    expect(res.error).toContain('does not exist');
  });

  it('reports an update failure without throwing', async () => {
    const { db } = makeDb([{ id: 'a', status: 'pending', due_at: daysAgo(30) }], { updateError: 'permission denied' });
    const res = await sweepMissedPromises(db, { now: NOW });
    expect(res.marked).toBe(0);
    expect(res.error).toContain('permission denied');
  });

  it('never throws when the client itself blows up', async () => {
    const db = {
      from() {
        throw new Error('connection lost');
      },
    };
    const res = await sweepMissedPromises(db, { now: NOW });
    expect(res.marked).toBe(0);
    expect(res.error).toContain('connection lost');
  });
});
