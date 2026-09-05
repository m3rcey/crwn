import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { recordCampaignWinner, selectedWinner } from './store';

/**
 * The winner-recording primitive and the migration that backs it.
 *
 * The one-winner guarantee has two layers and both are tested here: the server pre-check (a
 * friendly sentence) and the database's partial unique index (the authority, reached when two
 * requests race past the pre-check together).
 */

const CAMPAIGN = 'c1';
const NOW = '2026-09-04T12:00:00.000Z';

type Row = { campaign_id: string; fan_id: string; selected_winner_at: string | null; role?: string };

/** A participants-table double with the partial unique index's behaviour built in. */
function fakeDb(rows: Row[], opts: { columnMissing?: boolean; raceWinner?: string } = {}) {
  const from = () => {
    const filters: { col: string; op: string; val: unknown }[] = [];
    let payload: Record<string, unknown> | null = null;
    let notNullCol: string | null = null;
    let isNullCol: string | null = null;
    const matching = () =>
      rows.filter((r) => {
        for (const f of filters) if ((r as unknown as Record<string, unknown>)[f.col] !== f.val) return false;
        if (notNullCol && (r as unknown as Record<string, unknown>)[notNullCol] == null) return false;
        if (isNullCol && (r as unknown as Record<string, unknown>)[isNullCol] != null) return false;
        return true;
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: any = {
      select: () => api,
      eq: (col: string, val: unknown) => { filters.push({ col, op: 'eq', val }); return api; },
      not: (col: string) => { notNullCol = col; return api; },
      is: (col: string) => { isNullCol = col; return api; },
      update: (p: Record<string, unknown>) => { payload = p; return api; },
      maybeSingle: async () => {
        if (opts.columnMissing) return { data: null, error: { code: '42703', message: 'column does not exist' } };
        return { data: matching()[0] ?? null, error: null };
      },
      then: (resolve: (v: unknown) => void) => {
        if (opts.columnMissing) return Promise.resolve({ data: null, error: { code: '42703', message: 'no column' } }).then(resolve);
        // The database index: another request won the race between the pre-check and here.
        if (opts.raceWinner) {
          return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }).then(resolve);
        }
        const hit = matching();
        hit.forEach((r) => Object.assign(r, payload));
        return Promise.resolve({ data: hit.map((r) => ({ fan_id: r.fan_id })), error: null }).then(resolve);
      },
    };
    return api;
  };
  return { from } as never;
}

const participants = (): Row[] => [
  { campaign_id: CAMPAIGN, fan_id: 'fan-a', selected_winner_at: null },
  { campaign_id: CAMPAIGN, fan_id: 'fan-b', selected_winner_at: null },
  { campaign_id: 'other', fan_id: 'fan-c', selected_winner_at: null },
];

describe('recording a winner', () => {
  it('records an existing participant and reports it as newly recorded', async () => {
    const rows = participants();
    const r = await recordCampaignWinner(fakeDb(rows), CAMPAIGN, 'fan-a', NOW);
    expect(r).toEqual({ recorded: true, alreadyWinner: false });
    expect(rows.find((x) => x.fan_id === 'fan-a')!.selected_winner_at).toBe(NOW);
    expect(rows.find((x) => x.fan_id === 'fan-b')!.selected_winner_at).toBeNull();
  });

  it('refuses a fan who never took part: winning cannot create a participation', async () => {
    const rows = participants();
    const r = await recordCampaignWinner(fakeDb(rows), CAMPAIGN, 'stranger', NOW);
    expect(r).toEqual({ recorded: false, reason: 'not_a_participant' });
    expect(rows.every((x) => x.selected_winner_at === null)).toBe(true);
  });

  it('refuses a participant of ANOTHER campaign', async () => {
    const rows = participants();
    const r = await recordCampaignWinner(fakeDb(rows), CAMPAIGN, 'fan-c', NOW);
    expect(r).toEqual({ recorded: false, reason: 'not_a_participant' });
  });

  it('refuses a SECOND winner once one is recorded', async () => {
    const rows = participants();
    rows[0].selected_winner_at = NOW;
    const r = await recordCampaignWinner(fakeDb(rows), CAMPAIGN, 'fan-b', NOW);
    expect(r).toEqual({ recorded: false, reason: 'winner_already_selected' });
    expect(rows[1].selected_winner_at).toBeNull();
  });

  it('re-recording the SAME winner is idempotent, not a failure', async () => {
    const rows = participants();
    rows[0].selected_winner_at = NOW;
    const r = await recordCampaignWinner(fakeDb(rows), CAMPAIGN, 'fan-a', '2026-09-05T00:00:00.000Z');
    expect(r).toEqual({ recorded: true, alreadyWinner: true });
    // And the original timestamp is NOT overwritten: recording is append-only.
    expect(rows[0].selected_winner_at).toBe(NOW);
  });

  it('a RACE lost at the database reads as "already selected", not as an error', async () => {
    // Both requests pass the pre-check, then the partial unique index refuses the second.
    const r = await recordCampaignWinner(fakeDb(participants(), { raceWinner: 'fan-a' }), CAMPAIGN, 'fan-b', NOW);
    expect(r).toEqual({ recorded: false, reason: 'winner_already_selected' });
  });

  it('before the migration, recording reports not_supported instead of crashing', async () => {
    const r = await recordCampaignWinner(fakeDb(participants(), { columnMissing: true }), CAMPAIGN, 'fan-a', NOW);
    expect(r).toEqual({ recorded: false, reason: 'not_supported' });
  });
});

describe('reading the recorded winner', () => {
  it('returns the one participant carrying a selection', async () => {
    const rows = participants();
    rows[1].selected_winner_at = NOW;
    expect(await selectedWinner(fakeDb(rows), CAMPAIGN)).toMatchObject({ fan_id: 'fan-b' });
  });

  it('returns null when nobody has been recorded', async () => {
    expect(await selectedWinner(fakeDb(participants()), CAMPAIGN)).toBeNull();
  });

  it('returns null (never throws) before the migration, so the product behaves as it did', async () => {
    expect(await selectedWinner(fakeDb(participants(), { columnMissing: true }), CAMPAIGN)).toBeNull();
  });
});

describe('the migration itself', () => {
  const sql = readFileSync(new URL('../../../supabase/schema-phase3-campaign-winner-selection.sql', import.meta.url), 'utf8');

  it('is additive and nullable, with no backfill', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS selected_winner_at TIMESTAMPTZ NULL');
    // No UPDATE of existing participants, and no data migration of any kind.
    expect(sql).not.toMatch(/UPDATE public\.fan_campaign_participants\s+SET selected_winner_at = now\(\)\s*;/);
    expect(sql).not.toContain('DROP COLUMN');
  });

  it('makes one-winner-per-campaign a DATABASE fact, via a PARTIAL unique index', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_fan_campaign_participants_one_winner');
    expect(sql).toContain('ON public.fan_campaign_participants (campaign_id)');
    // Partial is load-bearing: a non-partial unique index on campaign_id would allow only ONE
    // participant per campaign at all, which would break joining entirely.
    expect(sql).toContain('WHERE selected_winner_at IS NOT NULL');
  });

  it('freezes the column against clients with a trigger, not only with RLS', () => {
    expect(sql).toContain('freeze_campaign_winner_selection');
    expect(sql).toContain('trg_freeze_campaign_winner_selection');
    expect(sql).toContain("v_role IN ('anon', 'authenticated')");
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF selected_winner_at');
  });

  it('makes winner selection append-only, for the application too', () => {
    expect(sql).toMatch(/cannot be changed or cleared through the API/);
  });

  it('adds no column the campaign or the subscription already owns', () => {
    // SQL statements only. The header explains why there is no is_winner, and a comment
    // arguing against a column is not the column.
    const statements = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    for (const forbidden of ['is_winner', 'winner_rank', 'drawing_id', 'eligibility_status', 'winning_entry_id', 'fulfilled_at', 'prize_amount']) {
      expect(statements, `${forbidden} must not be added`).not.toContain(forbidden);
    }
    // Exactly ONE column is added by this migration.
    expect(statements.match(/ADD COLUMN/g)).toHaveLength(1);
  });

  it('self-verifies BEHAVIOURALLY and cleans up after itself', () => {
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql).toContain("set_config('request.jwt.claims'");
    expect(sql).toContain('an authenticated client set selected_winner_at');
    expect(sql).toContain('a campaign accepted two selected winners');
    expect(sql).toContain('self-verify left test rows behind');
  });
});
