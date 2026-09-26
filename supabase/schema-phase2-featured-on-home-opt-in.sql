-- Home's Featured Artists row becomes OPT-IN (founder decision, 2026-09-26).
--
-- The problem: the row featured every artist with music + an avatar + a presentable
-- name unless `featured_hidden` was set. So every new signup landed in the first
-- thing everyone sees at login, and the founder found out after the fact (Fr35h,
-- signed up 2026-09-26, was eligible within hours).
--
-- Why a NEW column instead of defaulting `featured_hidden` to true: `featured_hidden`
-- also removes an artist from Explore browse AND from Explore's track lists
-- (src/app/api/explore/route.ts). Defaulting it on would bury every new artist's
-- music across discovery, which is a much bigger change than "not on Home by
-- default". This column governs the Home row ONLY. Explore, the artist's /[slug]
-- page, their music, fans and payouts are untouched.
--
-- Rules on Home after this:
--   featured_on_home = true   AND   featured_hidden = false   AND the existing
--   completeness checks (music, avatar, presentable name, active account).
-- `featured_hidden` still wins, so every artist already hidden stays hidden.
--
-- Backfill: ONLY the two artists on the row today (GB, Mercey), by exact slug, so
-- the row looks the same tomorrow minus the new signup.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run. Self-verifies.

BEGIN;

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS featured_on_home BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN artist_profiles.featured_on_home IS
  'Founder-controlled opt-in for the Home Featured Artists row. New artists start false. Does not affect Explore or the public page. featured_hidden still overrides it.';

UPDATE artist_profiles
   SET featured_on_home = true
 WHERE slug IN ('gb', 'm3rcey');

-- The public view enumerates its columns AT CREATION TIME, so a new column is
-- invisible to it until it is rebuilt. Same exclusion list and same (non
-- security_invoker) form as schema-phase2-featured-hidden.sql.
DO $$
DECLARE
  cols TEXT;
BEGIN
  SELECT string_agg(format('a.%I', attname), ', ' ORDER BY attnum)
    INTO cols
    FROM pg_attribute
   WHERE attrelid = 'public.artist_profiles'::regclass
     AND attnum > 0
     AND NOT attisdropped
     AND attname NOT IN (
       'stripe_connect_id',
       'platform_stripe_customer_id',
       'platform_stripe_subscription_id'
     );

  IF cols IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: could not enumerate columns of artist_profiles';
  END IF;

  EXECUTE 'DROP VIEW IF EXISTS artist_profiles_public';
  EXECUTE format('CREATE VIEW artist_profiles_public AS SELECT %s FROM artist_profiles a', cols);
  EXECUTE 'GRANT SELECT ON artist_profiles_public TO anon, authenticated';
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Self-verify: fail loudly on a partial apply instead of silently half-landing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'artist_profiles'
       AND column_name = 'featured_on_home' AND column_default = 'false'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: artist_profiles.featured_on_home missing or not defaulting to false';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'artist_profiles_public'
       AND column_name = 'featured_on_home'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: featured_on_home not exposed on artist_profiles_public (view not rebuilt)';
  END IF;

  -- The rebuild must not drop the older discovery flag Home and Explore read.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'artist_profiles_public'
       AND column_name = 'featured_hidden'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: featured_hidden missing from rebuilt artist_profiles_public';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'artist_profiles_public'
       AND column_name IN ('stripe_connect_id', 'platform_stripe_customer_id', 'platform_stripe_subscription_id')
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: rebuilt view leaks a Stripe id column';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'artist_profiles_public'
       AND reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: artist_profiles_public must not be security_invoker';
  END IF;

  IF (SELECT count(*) FROM artist_profiles WHERE slug IN ('gb', 'm3rcey') AND featured_on_home) <> 2 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: gb and m3rcey were not carried onto the Featured row';
  END IF;

  IF EXISTS (SELECT 1 FROM artist_profiles WHERE slug = 'fr35h' AND featured_on_home) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: the newest signup (fr35h) is featured';
  END IF;

  RAISE NOTICE 'schema-phase2-featured-on-home-opt-in: OK';
END $$;

-- To feature an artist on Home later:
--   UPDATE artist_profiles SET featured_on_home = true WHERE slug = '<slug>';
-- To see who is on the row:
--   SELECT slug FROM artist_profiles WHERE featured_on_home AND NOT featured_hidden;
