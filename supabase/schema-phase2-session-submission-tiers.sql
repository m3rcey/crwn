-- schema-phase2-session-submission-tiers.sql
-- WHO MAY SUBMIT, separately from who may watch.
--
-- An Executive Producer Session has one tier list, and it answered both questions at once:
-- reach the room and you could also upload a beat to it. GB The G1ft's ladder needs those
-- split. Gold "Executive Producer Sessions, viewer access" plus "vote on selected creative
-- decisions"; Platinum "submit beats, vocals, ideas, hooks, references for consideration".
-- One room, two privileges. Without this the artist has to run Platinum-only sessions and
-- shut Gold out entirely, which is a worse product than the ladder describes.
--
-- NARROWING ONLY, and this is the safety property that matters. submission_tier_ids can
-- only take submission access AWAY from people who can already reach the session. It is
-- checked AFTER the existing access gate, never instead of it, so a fan who cannot enter
-- the room can never submit to it however this column is set. NULL means "whoever can
-- watch may submit", which is exactly today's behaviour, so every existing session keeps
-- its current meaning the moment this lands.
--
-- A PAID TICKET IS NOT ENOUGH once this is set, and that is deliberate. A ticket buys entry
-- to the room (src/lib/live/access.ts keeps that promise, and a later price change still
-- cannot revoke it). Submitting material is what the artist sells on a monthly rung, so it
-- requires holding one of the listed tiers.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS submission_tier_ids jsonb;

COMMENT ON COLUMN live_sessions.submission_tier_ids IS
  'Tiers permitted to SUBMIT material, narrowing the session''s watch access. NULL = anyone who can watch may submit (the original behaviour). Never widens: checked after the access gate, so it cannot admit someone who cannot reach the session.';

COMMIT;

-- ── Self-verify ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_sessions'
      AND column_name = 'submission_tier_ids'
  ) THEN
    RAISE EXCEPTION 'live_sessions.submission_tier_ids missing';
  END IF;

  -- Must be NULL everywhere on arrival, or an existing session would silently change
  -- who can submit to it.
  IF EXISTS (SELECT 1 FROM live_sessions WHERE submission_tier_ids IS NOT NULL) THEN
    RAISE EXCEPTION 'submission_tier_ids should be NULL on every existing session';
  END IF;
END $$;

SELECT
  (SELECT count(*) FROM live_sessions) AS sessions,
  (SELECT count(*) FROM live_sessions WHERE submission_tier_ids IS NOT NULL) AS with_submission_list,
  'session submission tiers applied' AS status;
