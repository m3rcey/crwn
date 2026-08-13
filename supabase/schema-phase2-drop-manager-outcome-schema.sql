-- Drop the retired Manager outcome-scoring schema (pre-PMF surface reduction, 2026-08-13).
--
-- WHAT: the artist_action_outcomes view and the three outcome columns on artist_agent_actions
-- (baseline_metrics, outcome_metrics, outcome_delta).
--
-- WHY IT IS SAFE: the scoring loop was retired 2026-08-11 (see the note in
-- src/app/api/cron/outcome-measure/route.ts for the four reasons), no code reads or writes any
-- of the three columns, and ZERO rows were ever written to them. This drops nothing but NULLs
-- and a view over them. The ACTION TELEMETRY columns (status, result_message, executed_at)
-- are untouched: what Manager did remains on record.
--
-- Self-verifies: refuses to run if any row actually holds outcome data, so a surprise is a
-- loud error instead of a silent loss.

DO $$
DECLARE
  n BIGINT;
BEGIN
  -- Guard BEFORE dropping: if any row ever got data, stop and look instead of deleting it.
  SELECT count(*) INTO n
    FROM artist_agent_actions
   WHERE baseline_metrics IS NOT NULL
      OR outcome_metrics IS NOT NULL
      OR outcome_delta IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'ABORTED: % artist_agent_actions row(s) hold outcome data; expected zero. Investigate before dropping.', n;
  END IF;
END $$;

BEGIN;

DROP VIEW IF EXISTS artist_action_outcomes;

ALTER TABLE artist_agent_actions
  DROP COLUMN IF EXISTS baseline_metrics,
  DROP COLUMN IF EXISTS outcome_metrics,
  DROP COLUMN IF EXISTS outcome_delta;

COMMIT;

-- Self-verify
DO $$
BEGIN
  IF to_regclass('public.artist_action_outcomes') IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: artist_action_outcomes view still exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'artist_agent_actions'
       AND column_name IN ('baseline_metrics', 'outcome_metrics', 'outcome_delta')
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: outcome column(s) still present on artist_agent_actions';
  END IF;
  RAISE NOTICE 'schema-phase2-drop-manager-outcome-schema: OK';
END $$;
