-- ============================================================
-- Comp unlimited tracks to one artist at a time (founder decision, 2026-09-30)
-- ============================================================
-- WHY: Prince Dre's concierge launch puts his whole catalog (8 projects, 94 songs) behind his
-- tiers. He is on Launch, which holds 50 tracks, and the founder chose to comp him rather than
-- ask for $49/mo before his first paid fan. The upload stopped at 50 with TRACK_LIMIT_REACHED.
--
-- HOW: the SAME per-artist comp column that comps GB's live sessions
-- (artist_profiles.plan_feature_overrides, schema-phase2-artist-plan-overrides.sql): server-only,
-- frozen against browser updates, grant-only. A new key, {"unlimitedTracks": true}, makes the
-- track-cap trigger let that artist's inserts through. It is a BOOLEAN, never a number, so it can
-- only lift a cap, and it moves no money (the fee, members and tiers stay un-overridable).
-- src/lib/platformTier.ts `hasUnlimitedTracksComp` reads the same key so the upload forms do not
-- warn about a cap that no longer applies.
--
-- Everything else in enforce_track_plan_cap is unchanged: the 50 cap on Launch, unlimited on a
-- paid plan, soft-deleted tracks not counted, INSERT only.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION enforce_track_plan_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan TEXT;
  comped BOOLEAN;
  cap INTEGER;
  used INTEGER;
BEGIN
  SELECT COALESCE(platform_tier, 'starter'),
         COALESCE((plan_feature_overrides ->> 'unlimitedTracks')::boolean, false)
    INTO plan, comped
    FROM artist_profiles
   WHERE id = NEW.artist_id;

  -- A founder comp (grant-only, server-only column) lifts the cap for this artist.
  IF comped THEN
    RETURN NEW;
  END IF;

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

DROP TRIGGER IF EXISTS trg_enforce_track_plan_cap ON tracks;
CREATE TRIGGER trg_enforce_track_plan_cap
  BEFORE INSERT ON tracks
  FOR EACH ROW
  EXECUTE FUNCTION enforce_track_plan_cap();

-- The comp itself: Prince Dre (slug princedre), merged into any comps he already has.
UPDATE artist_profiles
   SET plan_feature_overrides = COALESCE(plan_feature_overrides, '{}'::jsonb) || '{"unlimitedTracks": true}'::jsonb
 WHERE slug = 'princedre';

COMMIT;

-- ============================================================
-- Self-verify: the trigger reads the comp, the trigger is attached, and Dre carries the comp.
-- ============================================================
DO $$
BEGIN
  IF to_regprocedure('enforce_track_plan_cap()') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: enforce_track_plan_cap() missing';
  END IF;
  IF position('unlimitedTracks' IN pg_get_functiondef('enforce_track_plan_cap()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: enforce_track_plan_cap() does not read the unlimitedTracks comp';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_track_plan_cap' AND tgrelid = 'tracks'::regclass
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: trg_enforce_track_plan_cap missing (the Launch cap would stop being enforced)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM artist_profiles WHERE slug = 'princedre' AND plan_feature_overrides ->> 'unlimitedTracks' = 'true'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: princedre does not carry the unlimitedTracks comp';
  END IF;
  RAISE NOTICE 'schema-phase2-track-cap-comp: OK';
END $$;
