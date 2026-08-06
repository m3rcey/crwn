-- Launch partner cohort flag (First Revenue Launch offer, 2026-08-06).
--
-- artist_profiles.launch_partner marks the handful of artists in the founding
-- First Revenue Launch cohort. When true, /api/artist/launch-partner serves the
-- First Paid Member Guarantee checklist and the LaunchPartnerChecklist card
-- renders on the command screen. Everything else about the checklist is derived
-- on read; this flag is the ONLY stored value.
--
-- DELIBERATELY SERVER-ONLY: no grant to anon or authenticated, and NOT added to
-- the artist_profiles_public view. The only reader is the service-role client in
-- the API route. Because the column is unreadable to client roles, no browser
-- query may ever name it (naming one revoked column fails the ENTIRE statement
-- with 42501, including select('*') and embedded joins). The code ships with no
-- client-side reference; keep it that way.
--
-- Enabling an artist is a founder action, one UPDATE per artist:
--   see supabase/enable-launch-partner.sql
--
-- Code fails soft before this runs: the route answers { enabled: false } on a
-- 42703 missing-column error and the card renders nothing.

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS launch_partner boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN artist_profiles.launch_partner IS
  'First Revenue Launch cohort membership. Server-side reads only; never grant to client roles.';

-- Self-verify: fail loudly if the column did not land.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artist_profiles' AND column_name = 'launch_partner'
  ) THEN
    RAISE EXCEPTION 'launch_partner column missing on artist_profiles';
  END IF;

  -- The column must NOT be readable by client roles. A future broad re-grant
  -- would silently expose cohort membership and re-arm the 42501 trap.
  IF EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_name = 'artist_profiles'
      AND column_name = 'launch_partner'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'launch_partner must not be SELECTable by anon/authenticated';
  END IF;
END $$;
