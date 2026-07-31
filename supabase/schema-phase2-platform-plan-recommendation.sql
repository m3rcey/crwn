-- Platform plan recommendation storage (pricing strategy 2026-07-31).
--
-- Every artist account technically begins on Launch (free). CRWN separately stores the
-- RECOMMENDED operating plan, computed deterministically by src/lib/planRecommendation.ts
-- from the artist's calculator projection, catalog, contacts, and feature intent.
-- The columns are written ONLY by service-role code (the recommendation engine); clients
-- read them to personalize onboarding and the launch-boundary plan decision.
--
-- COLUMN-PRIVILEGE TRAP: schema-phase2-stripe-id-column-privs.sql replaced the blanket
-- SELECT grant on artist_profiles with per-column grants. A new column WITHOUT its own
-- grant makes every `select('*')` on the table fail 42501 for anon/authenticated. The
-- GRANT below is therefore NOT optional; it restores the pre-migration select('*')
-- behavior. The recommendation is not a secret (worst case a reader learns which plan
-- CRWN would suggest), so anon+authenticated read access is fine.

BEGIN;

ALTER TABLE public.artist_profiles
  ADD COLUMN IF NOT EXISTS recommended_plan TEXT
    CHECK (recommended_plan IN ('starter', 'pro', 'scale')),
  ADD COLUMN IF NOT EXISTS recommendation_reason TEXT,
  ADD COLUMN IF NOT EXISTS projected_monthly_gmv INTEGER; -- cents, from the calculator

GRANT SELECT (recommended_plan, recommendation_reason, projected_monthly_gmv)
  ON public.artist_profiles TO anon, authenticated;

COMMIT;

-- ============================================================
-- Self-verify (after COMMIT): columns exist and are readable by the app roles.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'artist_profiles'
       AND column_name = 'recommended_plan'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: artist_profiles.recommended_plan missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'artist_profiles'
       AND column_name = 'recommendation_reason'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: artist_profiles.recommendation_reason missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'artist_profiles'
       AND column_name = 'projected_monthly_gmv'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: artist_profiles.projected_monthly_gmv missing';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.artist_profiles', 'recommended_plan', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: authenticated cannot SELECT recommended_plan (select(*) on artist_profiles would 42501)';
  END IF;
  IF NOT has_column_privilege('anon', 'public.artist_profiles', 'recommended_plan', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon cannot SELECT recommended_plan (select(*) on artist_profiles would 42501)';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.artist_profiles', 'projected_monthly_gmv', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: authenticated cannot SELECT projected_monthly_gmv';
  END IF;

  RAISE NOTICE 'OK: plan recommendation columns exist and are readable.';
END $$;
