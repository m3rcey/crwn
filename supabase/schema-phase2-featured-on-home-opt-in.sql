-- Home's Featured Artists row is the FOUNDER'S DISCRETION (founder decision, 2026-09-26).
-- Artists do not opt in and cannot set it: Josh switches an artist on from
-- /admin?tab=artists, and a new signup starts switched off.
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

-- ── Featured is the FOUNDER'S discretion, so artists cannot set it ────────────────
-- Artists hold UPDATE on their own artist_profiles row (they edit their profile from
-- the browser), and column protection is a DENYLIST in this trigger function, so a new
-- column is artist-writable by default. Without this, any artist could put themselves
-- on the Featured row, or un-hide themselves, from the browser console.
-- Full replacement of the function as last defined by
-- schema-phase2-artist-plan-overrides.sql (every column it froze is kept), adding the two
-- discovery flags. The founder sets them from /admin?tab=artists (service role).
CREATE OR REPLACE FUNCTION public.freeze_artist_profiles_protected_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only browser end-users are frozen. service_role and direct SQL legitimately edit these.
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  NEW.platform_tier                   := OLD.platform_tier;
  NEW.stripe_connect_id               := OLD.stripe_connect_id;
  NEW.platform_subscription_status    := OLD.platform_subscription_status;
  NEW.platform_stripe_subscription_id := OLD.platform_stripe_subscription_id;
  NEW.platform_stripe_customer_id     := OLD.platform_stripe_customer_id;
  NEW.is_founding_artist              := OLD.is_founding_artist;
  NEW.founding_artist_number          := OLD.founding_artist_number;
  NEW.referral_commission_rate        := OLD.referral_commission_rate;
  NEW.clipper_commission_rate         := OLD.clipper_commission_rate;
  NEW.clipper_rate_schedule           := OLD.clipper_rate_schedule;
  NEW.clipper_campaign_started_at     := OLD.clipper_campaign_started_at;
  NEW.plan_feature_overrides          := OLD.plan_feature_overrides;
  NEW.song_lab_enabled                := OLD.song_lab_enabled;
  -- Discovery curation. Founder-set only.
  NEW.featured_on_home                := OLD.featured_on_home;
  NEW.featured_hidden                 := OLD.featured_hidden;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_artist_profiles_cols ON public.artist_profiles;
CREATE TRIGGER trg_freeze_artist_profiles_cols
  BEFORE UPDATE ON public.artist_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_artist_profiles_protected_cols();

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

  -- The freeze must cover both flags AND still cover what it covered before.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.artist_profiles'::regclass
       AND tgname = 'trg_freeze_artist_profiles_cols' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: freeze trigger missing on artist_profiles';
  END IF;
  IF position('NEW.featured_on_home' IN pg_get_functiondef('public.freeze_artist_profiles_protected_cols()'::regprocedure)) = 0
     OR position('NEW.featured_hidden' IN pg_get_functiondef('public.freeze_artist_profiles_protected_cols()'::regprocedure)) = 0
     OR position('NEW.plan_feature_overrides' IN pg_get_functiondef('public.freeze_artist_profiles_protected_cols()'::regprocedure)) = 0
     OR position('NEW.stripe_connect_id' IN pg_get_functiondef('public.freeze_artist_profiles_protected_cols()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: freeze function does not cover the featured flags plus the existing protected columns';
  END IF;

  IF EXISTS (SELECT 1 FROM artist_profiles WHERE slug = 'fr35h' AND featured_on_home) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: the newest signup (fr35h) is featured';
  END IF;

  RAISE NOTICE 'schema-phase2-featured-on-home-opt-in: OK';
END $$;

-- To feature an artist on Home later: use the Feature button at /admin?tab=artists, or
--   UPDATE artist_profiles SET featured_on_home = true WHERE slug = '<slug>';
-- To see who is on the row:
--   SELECT slug FROM artist_profiles WHERE featured_on_home AND NOT featured_hidden;
