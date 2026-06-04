-- schema-phase2-new-artist-webhook.sql
-- Guaranteed, server-side founder notification on every new artist page.
-- Fires from the DB (not the browser), so it can't be missed if a tab closes.
--
-- HOW IT WORKS: an AFTER INSERT trigger on artist_profiles uses pg_net to POST
-- the new row to /api/notifications/new-artist-hook, which emails joshn.wms@gmail.com.
--
-- BEFORE YOU RUN THIS:
--   1. Pick a long random secret (e.g. `openssl rand -hex 32`).
--   2. In Vercel, add env var  NEW_ARTIST_WEBHOOK_SECRET = <that secret>  and redeploy.
--   3. Replace REPLACE_WITH_YOUR_SECRET below with the SAME value, then run this.
-- (The secret is NOT committed to git — keep it only in Vercel + this one-time run.)
--
-- Apply in the Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_new_artist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://thecrwn.app/api/notifications/new-artist-hook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'REPLACE_WITH_YOUR_SECRET'
    ),
    body    := jsonb_build_object(
      'user_id',      NEW.user_id,
      'slug',         NEW.slug,
      'recruited_by', NEW.recruited_by
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_artist ON artist_profiles;
CREATE TRIGGER trg_notify_new_artist
  AFTER INSERT ON artist_profiles
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_artist();

-- To rotate the secret later: rerun this file with a new value (and update Vercel).
-- To check delivery: SELECT * FROM net._http_response ORDER BY created DESC LIMIT 10;
