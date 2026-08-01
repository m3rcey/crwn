-- ============================================================
-- Make the Launch track cap real (2026-08-01)
-- ============================================================
-- THE PROBLEM: every plan limit CRWN advertises was decorative. Tracks are
-- inserted straight from the browser client, so the 50-track Launch cap was
-- enforced only by `pointer-events:none` on a form, and the bulk uploader had no
-- check at all: an artist on Launch could upload 500 tracks. Meanwhile
-- `recommendPlan()` tells a 50+ catalog artist they need Pro, which reads as a
-- lie the moment Launch silently accepts the whole catalog.
--
-- The cap now lives in the database, which is the only layer a browser insert
-- cannot route around. The UI still warns BEFORE the upload starts (the artist
-- must never discover a limit after committing the work), so this trigger is the
-- backstop, not the messenger.
--
-- SCOPE: tracks only. The member cap was REMOVED from the product rather than
-- enforced (the only enforcement point would be refusing a paying fan at
-- checkout), and every plan allows the same 3 paid tiers so that cap is not a
-- paywall. Do not add either here.
--
-- Limits mirror TIER_LIMITS_V2 in src/lib/platformTier.ts. They are duplicated
-- here on purpose: a DB trigger cannot import TypeScript. If the plan's track
-- allowance changes there, change it here in the same commit.

BEGIN;

CREATE OR REPLACE FUNCTION enforce_track_plan_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan TEXT;
  cap INTEGER;
  used INTEGER;
BEGIN
  SELECT COALESCE(platform_tier, 'starter') INTO plan
    FROM artist_profiles
   WHERE id = NEW.artist_id;

  -- Unknown/legacy plan keys ('label', 'empire') resolve to a paid plan, which
  -- is unlimited. Never fail closed on an unrecognized plan: refusing an upload
  -- because of a stale tier string would break a paying artist's catalog.
  cap := CASE plan WHEN 'starter' THEN 50 ELSE -1 END;

  IF cap < 0 THEN
    RETURN NEW;
  END IF;

  -- Soft-deleted tracks (is_active false) do not consume the allowance, matching
  -- /api/platform/limits. Deleting a track frees a slot.
  SELECT COUNT(*) INTO used
    FROM tracks
   WHERE artist_id = NEW.artist_id
     AND is_active IS DISTINCT FROM false;

  IF used >= cap THEN
    RAISE EXCEPTION 'TRACK_LIMIT_REACHED: this plan holds % tracks and % are already uploaded', cap, used
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- INSERT only. An UPDATE that reactivates a soft-deleted track is deliberately
-- allowed through: the artist already had that track, and blocking a restore
-- would strand their own catalog behind a paywall they were not warned about.
DROP TRIGGER IF EXISTS trg_enforce_track_plan_cap ON tracks;
CREATE TRIGGER trg_enforce_track_plan_cap
  BEFORE INSERT ON tracks
  FOR EACH ROW
  EXECUTE FUNCTION enforce_track_plan_cap();

COMMIT;

-- ============================================================
-- Self-verify: a partial apply must fail loudly rather than leave the cap
-- advertised but unenforced (which is the bug this migration exists to fix).
-- ============================================================
DO $$
BEGIN
  IF to_regprocedure('enforce_track_plan_cap()') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: enforce_track_plan_cap() missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_enforce_track_plan_cap'
       AND tgrelid = 'tracks'::regclass
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: trg_enforce_track_plan_cap missing (the track cap stays decorative)';
  END IF;

  RAISE NOTICE 'schema-phase2-track-cap-enforcement: OK';
END $$;
