-- schema-phase2-stripe-id-column-privs.sql
--
-- STEP 2 of 2. THIS IS THE ONE THAT CLOSES THE LEAK.
--
-- PREREQUISITES, in this order:
--   1. schema-phase2-artist-profiles-public-view.sql applied.
--   2. The code below is DEPLOYED:
--      - the five public `select('*', profile:profiles(*))` reads repointed to
--        artist_profiles_public
--      - /api/stripe/booking-checkout reads stripe_connect_id with the admin client
--      - /api/stripe/platform-checkout reads+writes platform_stripe_customer_id with
--        the service client
--      - ArtistProfileForm.tsx enumerates its columns instead of select('*')
-- Running this before that deploy breaks the public artist page AND two money flows.
--
-- WHAT IT DOES: anon/authenticated hold a TABLE-level SELECT grant on
-- artist_profiles, and a table-level grant covers EVERY column. A column-level
-- REVOKE against it is a NO-OP -- Postgres checks table-privilege OR
-- column-privilege -- so the blanket grant is dropped and re-issued per column.
-- The kept set is computed by difference, so a column added later is granted
-- automatically and only the denylist stays denied.
--
-- Afterwards:
--   anon: ?select=stripe_connect_id -> 42501 permission denied
--   anon: ?select=*                 -> 42501 (PostgREST expands * in the DB)
--   anon: ?select=slug,tagline      -> 200, unchanged
--   anon: artist_profiles_public    -> 200, every column except the Stripe ids
--   service_role: unchanged
--
-- NOT IN SCOPE: `profiles.stripe_connect_id` (recruiter payouts) leaks identically.
-- Closing it means revoking the table grant on `profiles`, and useAuth.tsx reads
-- that table with `select('*')` on every page load. Breaking the auth hook to hide
-- a value that is not a credential is a bad trade. Deliberately deferred.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
-- Undo, if something unexpected breaks:
--   GRANT SELECT ON public.artist_profiles TO anon, authenticated;

BEGIN;

DO $$
DECLARE
  cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
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

  -- Drop the blanket grant FIRST, or the per-column GRANT below means nothing.
  REVOKE SELECT ON public.artist_profiles FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.artist_profiles TO anon, authenticated', cols);
END $$;

COMMIT;

-- ============================================================
-- Self-verify (AFTER the COMMIT, so a bug here cannot undo a correct fix).
-- Schema facts only. This session is a BYPASSRLS role holding its own grants and
-- can never observe what anon sees -- the anon-key curl is the real proof, and the
-- /api/cron/rls-canary route now runs it daily.
-- ============================================================
DO $$
DECLARE
  n INTEGER;
BEGIN
  -- 1. No table-level SELECT may survive for anon/authenticated.
  SELECT count(*) INTO n
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE ns.nspname = 'public'
     AND c.relname = 'artist_profiles'
     AND a.privilege_type = 'SELECT'
     AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated'));
  IF n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: % table-level SELECT grant(s) survive; the Stripe ids are still readable', n;
  END IF;

  -- 2. No Stripe id column may carry a column-level SELECT grant.
  SELECT count(*) INTO n
    FROM pg_attribute att
    CROSS JOIN LATERAL aclexplode(att.attacl) a
   WHERE att.attrelid = 'public.artist_profiles'::regclass
     AND att.attname IN ('stripe_connect_id', 'platform_stripe_customer_id', 'platform_stripe_subscription_id')
     AND a.privilege_type = 'SELECT'
     AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated'));
  IF n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: Stripe id columns still granted to anon/authenticated (% grants)', n;
  END IF;

  -- 3. The public artist page must still work, or every profile goes blank.
  SELECT count(*) INTO n
    FROM pg_attribute att
    CROSS JOIN LATERAL aclexplode(att.attacl) a
   WHERE att.attrelid = 'public.artist_profiles'::regclass
     AND att.attname IN ('id', 'user_id', 'slug', 'tagline', 'banner_url', 'platform_tier')
     AND a.privilege_type = 'SELECT'
     AND a.grantee::regrole::text = 'anon';
  IF n <> 6 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon lost SELECT on core artist_profiles columns (% of 6)', n;
  END IF;

  -- 4. The view must survive the REVOKE, or five public pages 42501.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
     WHERE table_schema = 'public' AND table_name = 'artist_profiles_public'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: artist_profiles_public is gone; the public artist page will fail';
  END IF;

  RAISE NOTICE 'schema-phase2-stripe-id-column-privs: OK (Stripe ids denied to anon + authenticated)';
END $$;

-- Surviving grants on the Stripe id columns. Expect ZERO rows.
SELECT att.attname AS column_name,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS grantee,
       a.privilege_type
  FROM pg_attribute att
  CROSS JOIN LATERAL aclexplode(att.attacl) a
 WHERE att.attrelid = 'public.artist_profiles'::regclass
   AND att.attname IN ('stripe_connect_id', 'platform_stripe_customer_id', 'platform_stripe_subscription_id')
   AND a.privilege_type = 'SELECT'
 ORDER BY 1, 2;
