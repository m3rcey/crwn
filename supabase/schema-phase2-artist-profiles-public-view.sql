-- schema-phase2-artist-profiles-public-view.sql
--
-- STEP 1 of 2. ADDITIVE ONLY. Nothing is revoked, no policy changes.
-- Applying this file cannot break any existing surface.
--
-- THE BUG (confirmed from outside with the anon key, 2026-07-10):
--   curl "$URL/rest/v1/artist_profiles?select=slug,stripe_connect_id" -H "apikey: $ANON"
--   -> [{"slug":"m3rcey","stripe_connect_id":"acct_..."}, {"slug":"gb", ...}]
--
-- SEVERITY, honestly stated: a Stripe Connect account id is NOT a credential. It
-- cannot move money without the platform's secret key. This is data minimization --
-- the same class as the leaderboard `spent` field -- not the paid-audio emergency.
-- It is fixed because no browser has any reason to read it.
--
-- WHY A VIEW: step 2 revokes the table-level SELECT grant on artist_profiles and
-- re-grants every column except the Stripe ids. That makes `select('*')` fail with
-- 42501, because PostgREST expands `*` in the database. Five public reads use a
-- wildcard, hidden inside `.select('*, profile:profiles(*)')`:
--     src/app/(main)/home/page.tsx
--     src/app/[slug]/page.tsx                     (x2)
--     src/app/[slug]/playlist/[id]/page.tsx
--     src/app/artist/[slug]/playlist/[id]/page.tsx
-- Enumerating 42 columns at five call sites would rot the moment a column is added.
-- This view is that column list, maintained by the database instead.
--
-- The view is built with dynamic SQL from pg_attribute, so a column added to
-- artist_profiles later appears automatically and only the denylist stays hidden.
--
-- SECURITY DEFINER (the Postgres default: security_invoker is off), so it keeps
-- working after step 2's REVOKE. artist_profiles' SELECT policy is `USING (true)`,
-- so the view exposes exactly the rows anon could already see -- it widens nothing.
-- If a row policy is ever added to artist_profiles, THIS VIEW MUST BE REVISITED.
--
-- NOT IN SCOPE: `profiles.stripe_connect_id` (recruiter payouts) leaks the same way.
-- Closing it means revoking the table grant on `profiles`, and `useAuth.tsx` reads
-- that table with `select('*')`. Breaking the auth hook to hide a non-credential is
-- a bad trade. Tracked, deliberately deferred.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

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

-- ============================================================
-- Self-verify (AFTER the COMMIT). Schema facts only -- this session is a BYPASSRLS
-- role and can never observe what anon sees.
-- ============================================================
DO $$
DECLARE
  n INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
     WHERE table_schema = 'public' AND table_name = 'artist_profiles_public'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: artist_profiles_public view missing';
  END IF;

  -- The view must NOT expose any Stripe id.
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'artist_profiles_public'
     AND column_name IN ('stripe_connect_id', 'platform_stripe_customer_id', 'platform_stripe_subscription_id');
  IF n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: the view exposes % Stripe id column(s)', n;
  END IF;

  -- …but must expose what the public artist page renders.
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'artist_profiles_public'
     AND column_name IN ('id', 'user_id', 'slug', 'tagline', 'banner_url', 'platform_tier');
  IF n <> 6 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: the view is missing core columns (% of 6)', n;
  END IF;

  -- It must not be security_invoker, or step 2's REVOKE will break it.
  IF EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'artist_profiles_public'
       AND reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: artist_profiles_public must not be security_invoker';
  END IF;

  SELECT count(*) INTO n
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'artist_profiles_public'
     AND privilege_type = 'SELECT' AND grantee IN ('anon', 'authenticated');
  IF n < 2 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: view not granted to anon + authenticated (found %)', n;
  END IF;

  RAISE NOTICE 'schema-phase2-artist-profiles-public-view: OK (additive; nothing revoked yet)';
END $$;

-- What the view exposes. Confirm no stripe_* / platform_stripe_* appears.
SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'artist_profiles_public'
 ORDER BY ordinal_position;
