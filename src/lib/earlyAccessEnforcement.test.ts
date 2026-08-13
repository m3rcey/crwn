// Early access is SERVER-enforced, and there is exactly ONE definition of
// "inside the early-access window".
//
// The bug this guards: can_play_track() short-circuited on `is_free`, and
// fieldsForClass('paid_first') sets is_free = true for the whole window. So the
// database said "yes" to every reader, including anonymous, while React alone
// hid the track. tracks_public serves audio_url_* on exactly that boolean and is
// granted to anon, so /api/tracks/[id]/stream would sign a URL for a logged-out
// visitor and /embed/[trackId] would pass its own is_free guard.
//
// These are SOURCE assertions. Behaviour is proved by
// supabase/verify-early-access-window.sql (transactional, rolls back) and by the
// anon probe in scripts/probe-migrations.mjs. A vitest run cannot reach Postgres,
// so it asserts the things that can silently drift instead: that the migration
// still carries the predicate, that the TypeScript contract still agrees with it,
// and that nobody has grown a second copy of the rule.

import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { classifyTrack, fieldsForClass } from './membershipStrategy';

const MIGRATION = readFileSync('supabase/schema-phase2-early-access-window-enforcement.sql', 'utf8');
const ORACLE_SRC = readFileSync('supabase/schema-phase2-fix-entitlement-oracle-via-authuid.sql', 'utf8');
const STREAM_ROUTE = readFileSync('src/app/api/tracks/[id]/stream/route.ts', 'utf8');

/**
 * The migration with `--` comments removed.
 *
 * NEGATIVE assertions must run against EXECUTABLE sql. The migration documents
 * the old line it replaces ("Was: IF t.is_free THEN RETURN true;"), and a naive
 * `not.toContain` on the raw file fails on that comment, which would push the
 * next author to soften either the comment or the test. Strip the prose instead.
 */
const MIGRATION_SQL = MIGRATION.replace(/^\s*--.*$/gm, '');

describe('the migration fixes the canonical oracle and nothing else', () => {
  it('reads public_release_date and guards the is_free short-circuit with it', () => {
    expect(MIGRATION).toContain('CREATE OR REPLACE FUNCTION can_play_track(p_track UUID, p_user UUID)');
    expect(MIGRATION).toContain('public_release_date');
    expect(MIGRATION_SQL).toMatch(/IF\s+t\.is_free\s+AND\s+NOT\s+v_in_window\s+THEN\s+RETURN\s+true;/);
    // The bare short-circuit must be gone, or the fix is cosmetic.
    expect(MIGRATION_SQL).not.toMatch(/IF\s+t\.is_free\s+THEN\s+RETURN\s+true;/);
  });

  it('keeps every property that makes the oracle safe', () => {
    expect(MIGRATION).toContain('SECURITY DEFINER');
    expect(MIGRATION).toContain('SET search_path = public');
    // p_user is still ignored: entitlement is always auth.uid(). Trusting the
    // argument is what made this function an oracle anyone could query.
    expect(MIGRATION).toMatch(/v_user\s+UUID\s*:=\s*auth\.uid\(\)/);
    expect(MIGRATION).toContain('p_user IGNORED');
    // Same grant as before, not a wider one.
    expect(MIGRATION).toContain('GRANT EXECUTE ON FUNCTION can_play_track(UUID, UUID) TO anon, authenticated;');
    expect(MIGRATION_SQL).not.toMatch(/GRANT[^;]*can_play_track[^;]*TO\s+PUBLIC/i);
  });

  it('does not touch RLS, the view, or any column grant', () => {
    for (const forbidden of ['DROP VIEW', 'CREATE VIEW', 'ALTER TABLE', 'DISABLE ROW LEVEL SECURITY', 'DROP POLICY']) {
      expect(MIGRATION_SQL, `migration must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('the superseded oracle is left in place as history, not silently edited', () => {
    // The previous definition still says what it said. This file supersedes it;
    // rewriting history would hide which change introduced which behaviour.
    expect(ORACLE_SRC).toMatch(/IF\s+t\.is_free\s+THEN\s+RETURN\s+true;/);
  });
});

describe('ONE definition of "inside the window", shared by SQL and TypeScript', () => {
  // classifyTrack is the TypeScript contract: 'paid_first' iff a FUTURE date AND
  // a non-empty tier list. The SQL predicate must be the same three clauses, or
  // the database and the product disagree about what a members-first track is.
  it('the SQL predicate is the three clauses classifyTrack uses', () => {
    expect(MIGRATION).toMatch(/t\.public_release_date\s+IS\s+NOT\s+NULL/);
    expect(MIGRATION).toMatch(/t\.public_release_date\s*>\s*now\(\)/);
    expect(MIGRATION).toMatch(/jsonb_array_length\(v_tiers\)\s*>\s*0/);
    // jsonb_array_length() ERRORS on a non-array, and an erroring oracle denies
    // every reader on the platform, not just this track.
    expect(MIGRATION).toMatch(/jsonb_typeof\(v_tiers\)\s*=\s*'array'/);
  });

  const now = new Date('2026-08-13T12:00:00Z');
  const future = new Date('2026-08-20T12:00:00Z').toISOString();
  const past = new Date('2026-08-01T12:00:00Z').toISOString();

  it('future date + tiers is paid_first on both sides (the window is ON)', () => {
    expect(classifyTrack({ is_free: true, allowed_tier_ids: ['t1'], public_release_date: future }, now)).toBe(
      'paid_first',
    );
  });

  it('future date + NO tiers is free_forever, so the SQL must leave it public', () => {
    // The degenerate state. Treating it as a locked window would lock out every
    // paying member for the whole window: the exact failure the content-class
    // refactor exists to make unrepresentable.
    expect(classifyTrack({ is_free: true, allowed_tier_ids: [], public_release_date: future }, now)).toBe(
      'free_forever',
    );
  });

  it('past date is not a window on either side', () => {
    expect(classifyTrack({ is_free: true, allowed_tier_ids: ['t1'], public_release_date: past }, now)).toBe(
      'free_forever',
    );
  });

  it('fieldsForClass still encodes paid_first as is_free TRUE, which is why the oracle needed the date', () => {
    const f = fieldsForClass('paid_first', { tierIds: ['t1'], windowDays: 7, now });
    expect(f.is_free).toBe(true);
    expect(f.allowed_tier_ids).toEqual(['t1']);
    expect(new Date(f.public_release_date!).getTime()).toBeGreaterThan(now.getTime());
  });

  it('members-first with no tiers selected is encoded as public now, never as a locked window', () => {
    const f = fieldsForClass('paid_first', { tierIds: [], windowDays: 7, now });
    expect(f.public_release_date).toBeNull();
    expect(f.is_free).toBe(true);
  });
});

describe('no second gate', () => {
  it('the stream route still derives entitlement from the view, never from its own tier maths', () => {
    // A NULL audio url IS the 403. Re-deriving "is this fan subscribed?" in
    // TypeScript is the shape of the original leak.
    expect(STREAM_ROUTE).toContain("from('tracks_public')");
    expect(STREAM_ROUTE).toContain('createServerSupabaseClient');
    expect(STREAM_ROUTE).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    for (const forbidden of ['allowed_tier_ids', 'public_release_date', "from('subscriptions')"]) {
      expect(STREAM_ROUTE, `stream route must not re-derive entitlement via ${forbidden}`).not.toContain(forbidden);
    }
  });
});
