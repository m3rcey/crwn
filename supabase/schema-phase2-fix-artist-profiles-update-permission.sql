-- Fix: artists cannot save their profile ("permission denied for table
-- artist_profiles", SQLSTATE 42501) on EVERY update.
--
-- ROOT CAUSE (two migrations that are individually correct but collide):
--   1. schema-phase2-rls-column-restrictions.sql / schema-phase2-freeze-clipper-
--      rate-columns.sql gave artist_profiles a FOR UPDATE policy whose WITH CHECK
--      freezes protected columns by comparing each to a SUBQUERY:
--          stripe_connect_id IS NOT DISTINCT FROM
--            (SELECT stripe_connect_id FROM artist_profiles WHERE user_id = auth.uid())
--      That subquery runs as the calling role (`authenticated`) and SELECTs
--      stripe_connect_id / platform_stripe_subscription_id / platform_stripe_customer_id.
--   2. schema-phase2-stripe-id-column-privs.sql REVOKED `authenticated`'s SELECT on
--      exactly those three columns (to stop the Stripe ids leaking to the browser).
--
--   So the WITH CHECK subqueries now select columns the role may no longer read.
--   A subquery over a forbidden column raises 42501 REGARDLESS of the comparison,
--   so the policy self-destructs on every artist_profiles UPDATE. The sibling
--   `profiles` policy uses the same pattern but still works, because
--   stripe-id-column-privs deliberately kept the table-level SELECT on `profiles`.
--
-- FIX: stop enforcing the column-freeze inside RLS (which forces privileged reads
-- as the unprivileged role). Enforce ownership in RLS, and freeze the protected
-- columns in a BEFORE UPDATE trigger that compares OLD vs NEW in-memory. OLD/NEW
-- are already-materialized rows, so reading them needs NO column SELECT privilege
-- and never touches the column-privilege wall. Legitimate writes to the protected
-- columns come from the admin/service client (which bypasses RLS today), so the
-- trigger exempts every role that is not a browser end-user.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
-- ROLLBACK: DROP TRIGGER trg_freeze_artist_profiles_cols ON artist_profiles;
--           then re-create the WITH CHECK policy from schema-phase2-freeze-clipper-
--           rate-columns.sql (but that re-introduces this exact bug).

BEGIN;

-- 1. Freeze the protected columns in a trigger instead of the RLS WITH CHECK.
--    SECURITY DEFINER so it is owned by a privileged role; but note it never reads
--    the table anyway (OLD/NEW are in-memory), so the freeze can't 42501.
CREATE OR REPLACE FUNCTION public.freeze_artist_profiles_protected_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only browser end-users (anon/authenticated) are frozen. The admin/service
  -- client (service_role) and direct SQL (auth.role() IS NULL) legitimately edit
  -- these columns: Stripe Connect onboarding, platform-subscription webhooks, the
  -- clamped clipper-/referral-rate endpoints. They bypass RLS today; keep them free.
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Any client-sent change to a protected column is silently reverted to the
  -- stored value. The update still succeeds for the safe fields (tagline, city,
  -- genres, slug, ...), so artists get a clean save instead of a 42501.
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_artist_profiles_cols ON public.artist_profiles;
CREATE TRIGGER trg_freeze_artist_profiles_cols
  BEFORE UPDATE ON public.artist_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_artist_profiles_protected_cols();

-- 2. Replace the self-referential WITH CHECK policy with a plain ownership check.
--    The column-freeze now lives in the trigger above, so the policy no longer
--    needs to (and must not) SELECT the withheld Stripe columns.
DROP POLICY IF EXISTS "Artists can update own profile safe fields" ON public.artist_profiles;
DROP POLICY IF EXISTS "Artists can update own profile" ON public.artist_profiles;
CREATE POLICY "Artists can update own profile"
  ON public.artist_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;

-- ============================================================
-- Self-verify (after COMMIT so a bug here can't undo a correct fix).
-- ============================================================
DO $$
DECLARE
  n INTEGER;
BEGIN
  -- The freeze trigger must exist.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.artist_profiles'::regclass
      AND tgname = 'trg_freeze_artist_profiles_cols'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: freeze trigger missing on artist_profiles';
  END IF;

  -- Exactly one FOR UPDATE policy, and it must NOT reference the withheld columns
  -- (a leftover self-referential WITH CHECK would re-introduce the 42501).
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'artist_profiles'
     AND cmd = 'UPDATE'
     AND coalesce(with_check, '') LIKE '%stripe_connect_id%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: an UPDATE policy still references stripe_connect_id in WITH CHECK (%)', n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'artist_profiles'
       AND cmd = 'UPDATE'
       AND policyname = 'Artists can update own profile'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: ownership UPDATE policy missing on artist_profiles';
  END IF;

  RAISE NOTICE 'schema-phase2-fix-artist-profiles-update-permission: OK';
END $$;
