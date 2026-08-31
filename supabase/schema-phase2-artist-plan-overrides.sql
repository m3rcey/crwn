-- schema-phase2-artist-plan-overrides.sql
-- PER-ARTIST PLAN CAPABILITY OVERRIDES. Comped features, one artist at a time.
--
-- Why this exists. Plan capabilities (live, DMs, scheduling, bundles, clipper) are decided
-- by artist_profiles.platform_tier, and that is right: they are what a plan sells. But a
-- founder sometimes needs to comp a capability to ONE artist without moving them to a plan
-- they are not paying for. GB The G1ft is on Launch and is running the Song Lab experiment;
-- his tier ladder promises Executive Producer Sessions (a live session) and direct
-- interaction / Q&A (DMs), and a tier benefit CRWN refuses to deliver is a promise broken
-- to a paying fan.
--
-- ADDITIVE ONLY, and that is enforced in code (applyPlanOverrides in platformTier.ts).
-- An override can turn a capability ON. It can NEVER turn one off. A field that could
-- revoke would be a silent downgrade of an artist who paid for the plan, invisible in the
-- billing record, and no support conversation would ever find it.
--
-- Server-only, no grant to anon/authenticated, exactly like launch_partner and
-- song_lab_enabled. A browser must not be able to read (or appear to set) its own
-- capabilities.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS plan_feature_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN artist_profiles.plan_feature_overrides IS
  'Comped plan capabilities for THIS artist, e.g. {"allowsLive": true, "allowsDMs": true}. Additive only: true grants, false is ignored. Server-only, never granted to client roles.';

-- GB The G1ft: Executive Producer Sessions (Gold) and direct interaction / Q&A (Platinum)
-- while he stays on Launch. Founder decision 2026-08-22. Nobody else is comped.
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE artist_profiles
     SET plan_feature_overrides = '{"allowsLive": true, "allowsDMs": true}'::jsonb
   WHERE slug = 'gb';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 artist with slug gb, updated %', v_count;
  END IF;
END $$;

COMMIT;

-- ── Self-verify: privilege facts, not mere existence ────────────────────────────
DO $$
DECLARE
  v_comped integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'artist_profiles'
      AND column_name = 'plan_feature_overrides'
  ) THEN
    RAISE EXCEPTION 'artist_profiles.plan_feature_overrides missing';
  END IF;

  -- Must stay server-only. A client-readable capability field invites a client-side gate.
  IF EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'artist_profiles'
      AND column_name = 'plan_feature_overrides' AND grantee IN ('anon','authenticated')
  ) THEN
    RAISE EXCEPTION 'plan_feature_overrides must stay server-only; a client grant exists';
  END IF;

  -- Exactly one comped artist, and it is gb.
  SELECT count(*) INTO v_comped
    FROM artist_profiles
   WHERE plan_feature_overrides <> '{}'::jsonb;
  IF v_comped <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 comped artist, found %', v_comped;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM artist_profiles
     WHERE slug = 'gb' AND plan_feature_overrides ? 'allowsLive'
  ) THEN
    RAISE EXCEPTION 'gb is not the comped artist';
  END IF;
END $$;

SELECT
  (SELECT count(*) FROM artist_profiles WHERE plan_feature_overrides <> '{}'::jsonb) AS comped_artists,
  (SELECT slug FROM artist_profiles WHERE plan_feature_overrides <> '{}'::jsonb LIMIT 1) AS comped_slug,
  'plan overrides applied' AS status;
