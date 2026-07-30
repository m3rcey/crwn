-- Fix: EVERY browser-side update to `profiles` fails ("permission denied for
-- table profiles", SQLSTATE 42501). Broken since 2026-07-23. Confirmed live in
-- production 2026-07-30 by a real signup: /welcome's save alert, the setup
-- wizard's photo save, tour-completion writes, and the profile settings form
-- are ALL silently rejected. API routes are unaffected (service role).
--
-- ROOT CAUSE (two migrations that are individually correct but collide —
-- the EXACT same collision already fixed once on artist_profiles by
-- schema-phase2-fix-artist-profiles-update-permission.sql):
--   1. schema-phase2-rls-column-restrictions.sql gave `profiles` a FOR UPDATE
--      policy whose WITH CHECK freezes protected columns via SUBQUERIES:
--          stripe_connect_id IS NOT DISTINCT FROM
--            (SELECT stripe_connect_id FROM profiles WHERE id = auth.uid())
--      Those subqueries run as the calling role (`authenticated`).
--   2. schema-phase2-profiles-column-privileges.sql (applied ~2026-07-23)
--      REVOKED the table-level SELECT on profiles and re-granted only safe
--      columns. `stripe_connect_id` is (correctly) NOT in the granted list.
--   A subquery over a forbidden column raises 42501 regardless of the
--   comparison, so the policy self-destructs on every UPDATE. The artist_profiles
--   fix even predicted this: it noted the profiles policy "still works because
--   stripe-id-column-privs kept the table-level SELECT on profiles" — the
--   profiles column-privileges migration later removed exactly that.
--
-- FIX (same shape as the artist_profiles fix): enforce ownership in RLS, and
-- freeze the protected columns (is_active, stripe_connect_id, role) in a
-- BEFORE UPDATE trigger comparing OLD vs NEW in-memory, which needs no column
-- SELECT privilege. One wrinkle profiles has that artist_profiles did not:
-- trg_promote_to_artist (AFTER INSERT on artist_profiles) legitimately updates
-- profiles.role fan->artist DURING an authenticated request, so auth.role() is
-- still 'authenticated' when the freeze trigger fires. The freeze therefore
-- allows exactly that transition — fan -> artist for a user who HAS an
-- artist_profiles row (the trigger is AFTER INSERT, so the row exists). A user
-- can never grant themselves admin, un-deactivate themselves, or touch the
-- Stripe id; a user with an artist page "self-promoting" to artist is a no-op
-- of the correct state.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
-- ROLLBACK: DROP TRIGGER trg_freeze_profiles_cols ON profiles; then re-create
-- the WITH CHECK policy from schema-phase2-rls-column-restrictions.sql (but
-- that re-introduces this exact bug).

BEGIN;

CREATE OR REPLACE FUNCTION public.freeze_profiles_protected_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only browser end-users are frozen. The admin/service client (service_role)
  -- and direct SQL legitimately edit these columns: account deactivation,
  -- admin approvals, fan Stripe connect, webhooks. They bypass RLS today; keep
  -- them free.
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Client-sent changes to protected columns are silently reverted to the
  -- stored value, so the update still succeeds for the safe fields instead of
  -- 42501-ing the whole statement.
  NEW.is_active         := OLD.is_active;
  NEW.stripe_connect_id := OLD.stripe_connect_id;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- The ONE legitimate in-request role change: trg_promote_to_artist promotes
    -- fan -> artist right after the artist_profiles insert (AFTER INSERT, so
    -- the row is visible here). SECURITY DEFINER makes this EXISTS immune to
    -- the caller's column privileges.
    IF NOT (
      OLD.role = 'fan' AND NEW.role = 'artist'
      AND EXISTS (SELECT 1 FROM public.artist_profiles WHERE user_id = NEW.id)
    ) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_profiles_cols ON public.profiles;
CREATE TRIGGER trg_freeze_profiles_cols
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_profiles_protected_cols();

-- Replace the self-referential WITH CHECK policy with a plain ownership check.
-- The column-freeze now lives in the trigger above, so the policy no longer
-- needs to (and must not) SELECT the withheld columns.
DROP POLICY IF EXISTS "Users can update own profile safe fields" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SAME COLLISION, THIRD INSTANCE: the "Gated artist profile insert" policy on
-- artist_profiles subqueries profiles.is_approved (revoked), so the RLS INSERT
-- 42501s for every authenticated user — reproduced against production
-- 2026-07-30 with a throwaway user ("permission denied for table profiles").
-- Postgres checks permissions for ALL tables a policy references at executor
-- startup, so the artist_gate_enabled() short-circuit does not save it.
-- Fix: read the approval flag through a SECURITY DEFINER helper, which runs
-- with the function owner's privileges and never hits the column wall.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_passes_artist_gate(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = p_user
      AND (p.is_approved = true OR p.role = 'admin')
  );
$$;
REVOKE ALL ON FUNCTION public.user_passes_artist_gate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_passes_artist_gate(uuid) TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "Gated artist profile insert" ON public.artist_profiles;
CREATE POLICY "Gated artist profile insert"
  ON public.artist_profiles FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      NOT artist_gate_enabled()
      OR public.user_passes_artist_gate(auth.uid())
    )
  );

COMMIT;

-- ============================================================
-- Self-verify (after COMMIT so a bug here cannot undo a correct fix).
-- Asserts the ACTUAL state, not that the statements ran.
-- ============================================================
DO $$
DECLARE
  n INTEGER;
BEGIN
  IF to_regprocedure('public.freeze_profiles_protected_cols()') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: freeze_profiles_protected_cols() is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'trg_freeze_profiles_cols'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: freeze trigger missing on profiles';
  END IF;

  -- No UPDATE policy may still reference a withheld column in WITH CHECK
  -- (that is the exact 42501 this migration removes).
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'profiles'
     AND cmd = 'UPDATE'
     AND coalesce(with_check, '') LIKE '%stripe_connect_id%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: an UPDATE policy still references stripe_connect_id in WITH CHECK (%)', n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'profiles'
       AND cmd = 'UPDATE'
       AND policyname = 'Users can update own profile'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: ownership UPDATE policy missing on profiles';
  END IF;

  -- The promote path must still exist, or the role exemption above guards nothing.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_promote_to_artist') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: trg_promote_to_artist is missing (role promotion would be dead)';
  END IF;

  -- The artist-gate helper must exist, and the INSERT policy must no longer
  -- subquery profiles directly (that inline subquery IS the 42501).
  IF to_regprocedure('public.user_passes_artist_gate(uuid)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: user_passes_artist_gate(uuid) is missing';
  END IF;
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'artist_profiles'
     AND cmd = 'INSERT'
     AND coalesce(with_check, '') LIKE '%is_approved%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: an INSERT policy still reads profiles.is_approved inline (%)', n;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'artist_profiles'
       AND cmd = 'INSERT'
       AND policyname = 'Gated artist profile insert'
       AND coalesce(with_check, '') LIKE '%user_passes_artist_gate%'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: gated INSERT policy missing or not using the SECURITY DEFINER helper';
  END IF;

  RAISE NOTICE 'schema-phase2-fix-profiles-update-permission: OK (profiles updates + RLS artist publish work again; protected cols frozen in trigger)';
END $$;
