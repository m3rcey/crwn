-- ─────────────────────────────────────────────────────────────────────────────
-- STOP profiles leaking every user's email (and phone) to the whole internet.
--
-- WHAT IS WRONG TODAY (verified against production 2026-07-23 with the PUBLIC
-- anon key, from outside the app):
--   GET /rest/v1/profiles?select=*  ->  68 rows, every one including `email`,
--   plus 5 rows with a real `phone`. The anon key ships inside every browser
--   bundle, so this is readable by anyone who opens devtools. No login needed.
--
-- ROOT CAUSE: `schema.sql` created
--     CREATE POLICY "Profiles are viewable by everyone" ON profiles
--       FOR SELECT USING (true);
--   which is correct for the PUBLIC columns (an artist's display_name and avatar
--   have to render on their public page) but profiles later grew private columns
--   by ALTER TABLE: email, phone, full_name, stripe_connect_id, is_approved,
--   last_active_at, onboarding_nudge_sent_at. The policy was never revisited, so
--   each new column inherited "viewable by everyone".
--
-- WHY RLS CANNOT FIX THIS: RLS filters ROWS, never COLUMNS. The rows genuinely
--   are public (that is the point of an artist page). The leak is at the column
--   level, so the fix has to be a column privilege. Same conclusion, and the same
--   fix, as the artist_profiles Stripe-id leak: `artist_profiles.stripe_connect_id`
--   already returns 42501 to anon, proving the pattern works. That hardening was
--   simply never applied to `profiles`.
--
-- ORDER MATTERS: a column-level GRANT is a no-op while a table-level GRANT is
--   still in place (the table grant already covers every column). The REVOKE of
--   the table grant MUST come first, then re-grant only the safe columns.
--
-- APP IMPACT: none for the browser. No client component reads profiles.email,
--   .phone or .full_name (grepped: every read of those is a server route using
--   the service-role client, which bypasses grants entirely). `useAuth` used to
--   do `select('*')`, which WOULD have started failing with 42501 here, so it was
--   changed to an explicit column list in the same commit as this migration.
--   A user's own email is still available client-side from the Supabase session
--   (`user.email`), which is where it should have been read from all along.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
-- ROLLBACK (re-opens the leak, do not):
--   GRANT SELECT ON public.profiles TO anon, authenticated;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Drop the blanket table grant. Until this happens every column-level GRANT
--    below is decorative, because the table grant already implies all columns.
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;

-- 2. Re-grant ONLY the columns that are genuinely public. These are what render
--    an artist's page, a chat author, a community post byline, a leaderboard row.
GRANT SELECT (
  id,
  role,
  display_name,
  username,
  avatar_url,
  bio,
  social_links,
  is_active,
  created_at,
  updated_at
) ON public.profiles TO anon;

-- 3. A logged-in user needs a little more: the tour/onboarding state drives
--    client-side UI (useTourCheck, useArtistSetup, the setup wizard gate). These
--    are booleans and a JSONB of completed tour keys. They carry no PII, so
--    granting them to `authenticated` costs nothing even though a column grant
--    cannot be narrowed to "your own row".
GRANT SELECT (
  id,
  role,
  display_name,
  username,
  avatar_url,
  bio,
  social_links,
  is_active,
  created_at,
  updated_at,
  has_completed_tour,
  completed_tours,
  onboarding_completed
) ON public.profiles TO authenticated;

-- 4. Deliberately NOT granted to any browser role:
--      email, phone, full_name, stripe_connect_id,
--      is_approved, last_active_at, onboarding_nudge_sent_at
--    Server routes read these through the service-role client, which is not
--    subject to grants, so nothing server-side changes.

COMMIT;

-- ============================================================
-- Self-verify (after COMMIT so a bug here cannot undo a correct fix).
-- Asserts the ACTUAL privilege state, not that the statements ran.
-- ============================================================
DO $$
DECLARE
  leaked TEXT;
  col    TEXT;
BEGIN
  -- The private columns must be unreadable by BOTH browser roles.
  FOREACH col IN ARRAY ARRAY[
    'email', 'phone', 'full_name', 'stripe_connect_id',
    'is_approved', 'last_active_at', 'onboarding_nudge_sent_at'
  ] LOOP
    -- Skip columns that do not exist in this database.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = col
    ) THEN
      CONTINUE;
    END IF;

    IF has_column_privilege('anon', 'public.profiles', col, 'SELECT') THEN
      leaked := coalesce(leaked || ', ', '') || 'anon:' || col;
    END IF;
    IF has_column_privilege('authenticated', 'public.profiles', col, 'SELECT') THEN
      leaked := coalesce(leaked || ', ', '') || 'authenticated:' || col;
    END IF;
  END LOOP;

  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: profiles columns still readable by a browser role: %', leaked;
  END IF;

  -- The public columns must STILL be readable, or every artist page breaks.
  IF NOT has_column_privilege('anon', 'public.profiles', 'display_name', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon lost display_name, public artist pages will not render';
  END IF;
  IF NOT has_column_privilege('anon', 'public.profiles', 'avatar_url', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon lost avatar_url';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'completed_tours', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: authenticated lost completed_tours, the tour system will 42501';
  END IF;

  RAISE NOTICE 'schema-phase2-profiles-column-privileges: OK (email/phone no longer readable by anon or authenticated)';
END $$;
