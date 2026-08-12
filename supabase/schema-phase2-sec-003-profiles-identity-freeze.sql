-- ============================================================================
-- SEC-003 — freeze the profile columns that carry IDENTITY and APPROVAL authority
-- ============================================================================
-- Cybersecurity audit 2026-08-12, docs/CYBERSECURITY_AUDIT_2026-08-12.md
--
-- THE BUG:
-- schema-phase2-profiles-column-privileges.sql revoked SELECT on the sensitive
-- profile columns but never touched UPDATE, and the RLS policy is a bare
-- ownership check:
--     USING (auth.uid() = id) WITH CHECK (auth.uid() = id)
-- The freeze trigger reverted exactly three columns (is_active,
-- stripe_connect_id, role). So `email`, `phone`, `full_name` and `is_approved`
-- were writable by the account itself, from the browser, with no verification.
--
-- WHY THAT WAS CRITICAL, not cosmetic:
--   * MONEY. Team Splits resolved a collaborator by `profiles.email`
--     (ilike) and pre-set `collaborator_user_id`, which is the column the accrual
--     cron and atomic_team_split_cashout pay out on. Claim a producer's address
--     before they sign up and their revenue share binds to you. The application
--     half of this is fixed in the same commit: email now only INVITES, and the
--     binding happens at accept-invite against the VERIFIED auth.users email.
--   * THE APPROVAL GATE. `is_approved` is the artist gate. A user could approve
--     themselves with a single PATCH. Currently damped because artist_gate is OFF,
--     but a kill switch that anyone can flip is not a kill switch.
--   * IDENTITY. `email` is a mirror of auth.users.email. Letting the mirror
--     diverge from the verified identity is how an application starts trusting an
--     unverified claim.
--
-- WHAT THIS DOES NOT BREAK (traced before writing):
--   * NOTHING in src/ writes profiles.email, profiles.phone or profiles.full_name.
--     There is no account email-change flow to preserve. Verified by grep across
--     the whole repo: zero writers.
--   * profiles.is_approved is written ONLY by /api/admin/approvals, which uses the
--     service-role client (and, as of SEC-001, a session-derived admin).
--   * The artist profile form writes display_name, bio, avatar_url and
--     social_links only. All four remain writable.
--   * The trigger already exempts non-browser roles, so service_role and direct
--     SQL keep full access. Admin approval, webhooks and support tooling are
--     unaffected.
--
-- If CRWN later ships an account email change, it must go through Supabase Auth's
-- verified email-change flow and then have trusted SERVER code mirror the new
-- address into profiles.email (service_role is exempt from this trigger, so no
-- change to this migration is needed).
--
-- Idempotent. Additive/restrictive only: no data is rewritten.
-- ROLLBACK: re-run schema-phase2-fix-profiles-update-permission.sql, which
-- redefines freeze_profiles_protected_cols() with the original three columns.
-- ============================================================================

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

  -- SEC-003 additions. Identity and approval authority are not self-service.
  NEW.email             := OLD.email;        -- mirror of the verified auth identity
  NEW.phone             := OLD.phone;
  NEW.is_approved       := OLD.is_approved;  -- the artist gate

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

-- The trigger itself is unchanged; recreate defensively so a partial earlier
-- apply cannot leave the function updated with no trigger attached.
DROP TRIGGER IF EXISTS trg_freeze_profiles_cols ON public.profiles;
CREATE TRIGGER trg_freeze_profiles_cols
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_profiles_protected_cols();

COMMIT;

-- ---------------------------------------------------------------------------------------
-- Self-verify. Asserts the SOURCE of the installed function actually freezes each
-- column, so a half-applied or reverted migration fails loudly here.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  v_src text;
  v_col text;
BEGIN
  SELECT prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'freeze_profiles_protected_cols';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: freeze_profiles_protected_cols() is missing';
  END IF;

  FOREACH v_col IN ARRAY ARRAY['is_active', 'stripe_connect_id', 'email', 'phone', 'is_approved'] LOOP
    IF position('NEW.' || v_col in v_src) = 0 THEN
      RAISE EXCEPTION 'MIGRATION FAILED: freeze trigger does not protect profiles.% (SEC-003)', v_col;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_freeze_profiles_cols'
       AND tgrelid = 'public.profiles'::regclass
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: trg_freeze_profiles_cols is not attached to profiles';
  END IF;

  RAISE NOTICE 'SEC-003 verified: email, phone and is_approved are frozen against browser writes.';
END $$;
