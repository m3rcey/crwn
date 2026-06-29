-- schema-phase2-promote-artist-role.sql
-- Fixes a split-brain: a user publishes an artist_profiles row but their
-- profiles.role stays 'fan', because the column-restriction RLS policy
-- (schema-phase2-rls-column-restrictions.sql) deliberately forbids users from
-- changing their own role. The form's client-side role='artist' update was
-- therefore silently rejected for every new artist (e.g. Lakes).
--
-- Correct fix: promote the role SERVER-SIDE via a trigger when the artist page
-- is created. This bypasses RLS safely (fan -> artist only, never touches admin)
-- and is atomic with the insert, so it can't be missed.
--
-- Apply in the Supabase SQL Editor. Safe to re-run.

CREATE OR REPLACE FUNCTION promote_to_artist_on_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
     SET role = 'artist'
   WHERE id = NEW.user_id
     AND role = 'fan';   -- never demote an admin
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_to_artist ON artist_profiles;
CREATE TRIGGER trg_promote_to_artist
  AFTER INSERT ON artist_profiles
  FOR EACH ROW
  EXECUTE FUNCTION promote_to_artist_on_publish();

-- Backfill: promote any existing artist-page owner still stuck at 'fan'.
UPDATE profiles p
   SET role = 'artist'
  FROM artist_profiles ap
 WHERE ap.user_id = p.id
   AND p.role = 'fan';

-- SELF-VERIFY: fail loudly if the trigger didn't land or anyone is still split-brain.
DO $$
BEGIN
  IF to_regprocedure('public.promote_to_artist_on_publish()') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: promote_to_artist_on_publish() is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_promote_to_artist') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: trg_promote_to_artist trigger is missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM artist_profiles ap
    JOIN profiles p ON p.id = ap.user_id
    WHERE p.role = 'fan'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: an artist-page owner is still role=fan';
  END IF;
  RAISE NOTICE 'OK: artist role promotion trigger installed and backfill clean.';
END $$;
