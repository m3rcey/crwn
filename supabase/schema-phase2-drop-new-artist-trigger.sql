-- Retire the pg_net new-artist trigger (2026-09-26).
--
-- The founder's "New artist on CRWN" email used to go: artist_profiles INSERT ->
-- trg_notify_new_artist -> pg_net POST to /api/notifications/new-artist-hook with a
-- shared secret hand-pasted into this function -> Resend. It worked, then stopped,
-- more than once, with nothing logged anywhere the founder would see: the secret in
-- the function and NEW_ARTIST_WEBHOOK_SECRET in Vercel only had to drift apart for
-- every call to be refused with a 401.
--
-- The alert is now sent IN-PROCESS by the code that creates the artist row
-- (src/lib/newArtistAlert.ts, called from /api/onboarding/identity and
-- /api/onboarding/artist-created). The route this trigger called has been DELETED, so
-- the trigger now only generates 404s. This file removes it.
--
-- STEP 1 prints the trigger's last 10 deliveries as NOTICEs (Messages / Results pane),
-- so we learn what actually broke. Read them before closing the editor:
--   401 = the secret drifted     404 = the route was gone
--   error_msg set = pg_net could not reach thecrwn.app
--   no rows = the trigger never fired, or pg_net history has been purged
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run. Self-verifies.

-- STEP 1: diagnostics (read-only, tolerant of pg_net being absent).
DO $$
DECLARE
  r RECORD;
  n INTEGER := 0;
BEGIN
  IF to_regclass('net._http_response') IS NULL THEN
    RAISE NOTICE 'diagnostic: net._http_response does not exist (pg_net not installed?)';
  ELSE
    FOR r IN EXECUTE
      'SELECT id, status_code, left(coalesce(content::text, ''''), 120) AS body,
              error_msg, created
         FROM net._http_response ORDER BY created DESC LIMIT 10'
    LOOP
      n := n + 1;
      RAISE NOTICE 'diagnostic: % status=% error=% body=%', r.created, r.status_code, r.error_msg, r.body;
    END LOOP;
    IF n = 0 THEN
      RAISE NOTICE 'diagnostic: no pg_net responses recorded';
    END IF;
  END IF;

  RAISE NOTICE 'diagnostic: trigger present before this run = %',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_new_artist' AND NOT tgisinternal);
END $$;

-- STEP 2: remove the trigger and its function.
BEGIN;
DROP TRIGGER IF EXISTS trg_notify_new_artist ON artist_profiles;
DROP FUNCTION IF EXISTS public.notify_new_artist();
COMMIT;

-- Self-verify.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_new_artist' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: trg_notify_new_artist still exists';
  END IF;
  IF to_regprocedure('public.notify_new_artist()') IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: notify_new_artist() still exists';
  END IF;
  -- The promote-to-artist trigger lives on the same table and must survive.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_promote_to_artist' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: trg_promote_to_artist is missing (unrelated, but check it)';
  END IF;
  RAISE NOTICE 'schema-phase2-drop-new-artist-trigger: OK';
END $$;

-- Afterwards, the Vercel env var NEW_ARTIST_WEBHOOK_SECRET is unused and can be deleted.
