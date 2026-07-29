// revenueRampSeed.ts — SERVER ONLY. Lay the revenue ramp into the Promise Calendar
// the moment an artist finishes setup, so the roadmap is dated work in the place they
// already look instead of an article they have to remember to read.
//
// Reuses the existing promise machinery rather than adding a table: each ramp step is a
// one-off `fulfillment_obligations` row (source_type 'custom', recurrence 'none') plus its
// single `fulfillment_events` instance, which the Promise Calendar already projects.
//
// THREE THINGS THAT MUST NOT REGRESS
//
//  1. `auto_create_fan_items` DEFAULTS TO TRUE on that table. A ramp step is the artist's
//     private growth plan, not a promise owed to supporters, so every insert sets it FALSE
//     explicitly. Without that line every fan's calendar would show their artist's private
//     roadmap, including "Personally message your 50 most engaged fans".
//  2. Idempotent per (artist, step key). Setup completion can be retried, and a duplicated
//     roadmap is worse than none.
//  3. Best effort, always. This runs inside the route that flips `setup_completed`, which
//     gates the entire app. A seeding failure must never block an artist from entering CRWN,
//     and it must survive the tables not existing at all (the promise-calendar migration is
//     applied in production, but a fresh environment may not have it yet).

import { buildRamp, type Ramp } from './revenueRamp';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

/** Marks a promise row as belonging to the ramp, so it can be found, typed and skipped. */
export const RAMP_BENEFIT_TYPE = 'ramp_step';

export interface SeedResult {
  seeded: number;
  skipped: number;
  ok: boolean;
}

/**
 * Create any missing ramp steps for this artist. Returns counts for logging; never throws.
 *
 * `targetMonthlyCents` is the artist's own calculator number (from their claimed lead-magnet
 * result). It is stored on each row's metadata so the calendar can show the milestone the
 * step is working toward without recomputing the whole ramp from scratch.
 */
export async function seedRevenueRamp(
  db: Db,
  args: { artistId: string; targetMonthlyCents?: number | null; startedAt?: Date },
): Promise<SeedResult> {
  const ramp: Ramp = buildRamp({
    targetMonthlyCents: args.targetMonthlyCents ?? null,
    startedAt: args.startedAt ?? new Date(),
  });

  try {
    // What is already there. One read, then insert only the gaps.
    const { data: existing, error } = await db
      .from('fulfillment_obligations')
      .select('metadata')
      .eq('artist_id', args.artistId)
      .eq('benefit_type', RAMP_BENEFIT_TYPE)
      .limit(500);

    // A missing table (or any read failure) means we do nothing rather than half-seed.
    if (error) return { seeded: 0, skipped: 0, ok: false };

    const done = new Set<string>();
    for (const row of existing ?? []) {
      const key = (row?.metadata as Record<string, unknown> | null)?.ramp_step_key;
      if (typeof key === 'string') done.add(key);
    }

    const pending = ramp.steps.filter((s) => !done.has(s.key));
    if (pending.length === 0) return { seeded: 0, skipped: ramp.steps.length, ok: true };

    const phaseByKey = new Map(ramp.phases.map((p) => [p.key, p]));

    for (const step of pending) {
      const phase = phaseByKey.get(step.phase);
      const metadata = {
        ramp_step_key: step.key,
        ramp_phase: step.phase,
        ramp_phase_name: step.phaseName,
        ramp_href: step.href,
        ramp_accelerator: step.accelerator === true,
        ramp_target_monthly_cents: ramp.targetMonthlyCents,
        ramp_phase_target_monthly_cents: phase?.targetMonthlyCents ?? null,
        ramp_phase_target_payers: phase?.targetPayers ?? null,
      };

      const { data: obligation, error: obErr } = await db
        .from('fulfillment_obligations')
        .insert({
          artist_id: args.artistId,
          source_type: 'custom',
          benefit_type: RAMP_BENEFIT_TYPE,
          title: step.title,
          description: step.detail,
          fulfillment_type: step.fulfillmentType,
          recurrence: 'none',
          next_due_at: step.dueAt,
          audience_kind: 'all_supporters',
          requires_completion: true,
          // See note 1 in the header. This line is the privacy boundary.
          auto_create_fan_items: false,
          auto_create_artist_task: true,
          status: 'active',
          metadata,
        })
        .select('id')
        .single();

      if (obErr || !obligation?.id) continue;

      await db.from('fulfillment_events').insert({
        obligation_id: obligation.id,
        artist_id: args.artistId,
        title: step.title,
        due_at: step.dueAt,
        status: 'pending',
        metadata,
      });
    }

    return { seeded: pending.length, skipped: ramp.steps.length - pending.length, ok: true };
  } catch {
    return { seeded: 0, skipped: 0, ok: false };
  }
}

/**
 * The artist's ramp as stored: rebuilt from the first ramp row's creation date so the dates
 * shown are the ones actually on their calendar, not a fresh 365 days from today.
 * Null when the artist has no ramp (pre-existing artists, or a failed seed).
 */
export async function loadRevenueRamp(db: Db, artistId: string): Promise<Ramp | null> {
  try {
    const { data, error } = await db
      .from('fulfillment_obligations')
      .select('created_at, metadata')
      .eq('artist_id', artistId)
      .eq('benefit_type', RAMP_BENEFIT_TYPE)
      .order('created_at', { ascending: true })
      .limit(1);

    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) return null;

    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const target =
      typeof meta.ramp_target_monthly_cents === 'number' ? meta.ramp_target_monthly_cents : null;

    return buildRamp({ targetMonthlyCents: target, startedAt: new Date(String(row.created_at)) });
  } catch {
    return null;
  }
}
