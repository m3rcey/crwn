-- Song Lab live shows: two additive columns, nothing destructive.
--
-- WHY THESE TWO, AND WHY NOTHING ELSE.
--
-- The "one night, two shows, one QR code" model needed NO new table. Song Lab already
-- models it: a PROJECT is the night and each DECISION is one show's poll, with its own
-- options, its own votes (UNIQUE per fan per decision) and its own opens_at/closes_at
-- window that effectiveStatus() already enforces server-side. A lead magnet bound to the
-- PROJECT (song_lab_offers.project_id, a column that already existed and nothing read)
-- resolves the currently live poll on every request. So the resolver is code, not schema.
--
-- Only two facts had nowhere to live:
--
--   1. song_lab_projects.show_timezone
--      Close times are stored as UTC instants (correct), but to SAY "Show 2 voting opens
--      at 8:30 PM" and to let the artist re-edit a schedule in local time, the event has
--      to remember which local time that was. Storing the IANA zone id, never a fixed
--      offset: "8 PM Eastern" is UTC-4 in September and UTC-5 in January, and hardcoding
--      EST would have closed Julius's first show an hour late.
--
--   2. song_lab_offer_claims.source
--      Which door the fan came through (the QR on the table vs the JUBO text). A pure
--      REPORTING dimension, allowlisted server-side to qr | jubo | sms | link. It never
--      reaches an authorization, pricing or eligibility decision.
--
-- Both are NULLABLE with no default and no backfill, so every existing row stays valid
-- and every existing one-poll magnet keeps working untouched. Rollback is two DROP
-- COLUMN statements; nothing reads either column when it is absent (the app selects
-- projects with select('*') and retries a claim insert without `source` on 42703).
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE song_lab_projects
  ADD COLUMN IF NOT EXISTS show_timezone text;

ALTER TABLE song_lab_offer_claims
  ADD COLUMN IF NOT EXISTS source text;

-- Keep the reporting dimension honest at the database, not just in the route.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'song_lab_claim_source_allowed'
  ) THEN
    ALTER TABLE song_lab_offer_claims
      ADD CONSTRAINT song_lab_claim_source_allowed
      CHECK (source IS NULL OR source IN ('qr', 'jubo', 'sms', 'link'));
  END IF;
END $$;

-- Reporting reads claims per artist by source; the existing (artist_id, created_at)
-- index already covers the artist scan, so this only helps the grouping.
CREATE INDEX IF NOT EXISTS idx_song_lab_claims_source
  ON song_lab_offer_claims(artist_id, source);

-- Grants are TABLE level on the Song Lab tables (see schema-phase2-song-lab.sql), so a
-- new column inherits them and needs no per-column GRANT. Re-issued for the public read
-- of projects to make that explicit rather than assumed. song_lab_offer_claims is
-- deliberately service-role only and gains nothing here.
GRANT SELECT ON song_lab_projects TO anon, authenticated;

COMMIT;

-- ── Self-verify (runs AFTER commit; a failure here means the assertion is wrong,
--    not that the change rolled back: probe before concluding anything) ──────────
DO $$
DECLARE
  v_missing text := '';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'song_lab_projects' AND column_name = 'show_timezone'
  ) THEN
    v_missing := v_missing || 'song_lab_projects.show_timezone ';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'song_lab_offer_claims' AND column_name = 'source'
  ) THEN
    v_missing := v_missing || 'song_lab_offer_claims.source ';
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'MIGRATION FAILED: missing %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'song_lab_claim_source_allowed'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: claim source CHECK constraint missing';
  END IF;

  -- The claims table must STILL be invisible to the Data API roles. A new column must
  -- never come with an accidental grant.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_name = 'song_lab_offer_claims' AND grantee IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: song_lab_offer_claims is reachable by anon/authenticated';
  END IF;
END $$;

-- Human-readable receipt (Supabase hides RAISE NOTICE; report in a result set).
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'song_lab_projects' AND column_name = 'show_timezone') AS project_timezone_column,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'song_lab_offer_claims' AND column_name = 'source') AS claim_source_column,
  (SELECT count(*) FROM song_lab_projects WHERE show_timezone IS NOT NULL) AS events_with_timezone,
  'song lab live shows applied' AS status;
