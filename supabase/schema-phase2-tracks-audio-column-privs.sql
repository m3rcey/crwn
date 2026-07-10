-- schema-phase2-tracks-audio-column-privs.sql
--
-- STEP 2 of 2. THIS IS THE ONE THAT CLOSES THE LEAK.
--
-- PREREQUISITES, in this order:
--   1. schema-phase2-tracks-audio-view.sql has been applied (creates tracks_public).
--   2. The code that reads audio from `tracks_public` instead of `tracks` is
--      DEPLOYED to production.
-- Running this before the deploy strips audio from the player. Running it before
-- step 1 strips audio from everything, permanently, until step 1 lands.
--
-- WHAT IT DOES: `tracks` currently carries a TABLE-level SELECT grant to anon and
-- authenticated (verified in pg_class.relacl), and a table-level grant covers
-- every column. A column-level REVOKE against a table-level grant is a no-op, so
-- the grant must be dropped and re-issued per column. Afterwards:
--
--   anon:          ?select=audio_url_320  -> 42501 permission denied for column
--   anon:          ?select=*              -> 42501 (PostgREST expands * in the DB)
--   anon:          ?select=id,title,price -> 200, unchanged
--   entitled user: tracks_public           -> audio_url_* populated
--   service_role:  unchanged (its own grant is untouched, and it bypasses RLS)
--
-- The columns are computed by difference rather than typed out, so a column added
-- to `tracks` later is granted automatically and only the audio pair stays denied.
-- Typing the list by hand would silently drop any column added since this was
-- written.
--
-- ALSO FOLDED IN: the duplicate SELECT policy left on artist_agent_actions by the
-- previous migration. `artists_view_own_actions` (pre-existing) and "Artists read
-- their own agent actions" (added last session) are the same policy. Permissive
-- policies OR together, so a duplicate is not a leak -- but it is a second thing
-- to keep correct, so the newer one goes.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

-- ============================================================
-- tracks: table-level SELECT -> per-column SELECT, minus the audio URLs.
-- ============================================================
DO $$
DECLARE
  cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
    INTO cols
    FROM pg_attribute
   WHERE attrelid = 'public.tracks'::regclass
     AND attnum > 0
     AND NOT attisdropped
     AND attname NOT IN ('audio_url_128', 'audio_url_320');

  IF cols IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: could not enumerate columns of public.tracks';
  END IF;

  -- Drop the blanket grant first. Without this the per-column GRANT below is
  -- meaningless: Postgres checks table-level privilege OR column-level privilege.
  REVOKE SELECT ON public.tracks FROM anon, authenticated;

  EXECUTE format('GRANT SELECT (%s) ON public.tracks TO anon, authenticated', cols);

  RAISE NOTICE 'tracks: granted SELECT on % columns to anon, authenticated (audio_url_128/320 withheld)',
    (SELECT count(*) FROM pg_attribute
      WHERE attrelid = 'public.tracks'::regclass AND attnum > 0 AND NOT attisdropped
        AND attname NOT IN ('audio_url_128','audio_url_320'));
END $$;

-- ============================================================
-- artist_agent_actions: drop the duplicate SELECT policy.
-- ============================================================
DROP POLICY IF EXISTS "Artists read their own agent actions" ON artist_agent_actions;

COMMIT;

-- ============================================================
-- Self-verify (AFTER the COMMIT, so a bug here cannot undo a correct fix).
-- Schema facts only. This session is a BYPASSRLS role and holds its own grants,
-- so it can never observe what anon sees -- that is what the curl below is for.
-- ============================================================
DO $$
DECLARE
  n INTEGER;
BEGIN
  -- 1. No table-level SELECT on tracks may remain for anon/authenticated.
  SELECT count(*) INTO n
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE ns.nspname = 'public'
     AND c.relname = 'tracks'
     AND a.privilege_type = 'SELECT'
     AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated'));
  IF n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: % table-level SELECT grant(s) on tracks survive; audio is still readable', n;
  END IF;

  -- 2. Neither audio column may carry a column-level SELECT grant.
  SELECT count(*) INTO n
    FROM pg_attribute att
    CROSS JOIN LATERAL aclexplode(att.attacl) a
   WHERE att.attrelid = 'public.tracks'::regclass
     AND att.attname IN ('audio_url_128', 'audio_url_320')
     AND a.privilege_type = 'SELECT'
     AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated'));
  IF n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: audio columns still granted to anon/authenticated (% grants)', n;
  END IF;

  -- 3. Metadata must still be readable, or every surface goes blank.
  SELECT count(*) INTO n
    FROM pg_attribute att
    CROSS JOIN LATERAL aclexplode(att.attacl) a
   WHERE att.attrelid = 'public.tracks'::regclass
     AND att.attname IN ('id', 'title', 'is_free', 'price', 'album_art_url', 'artist_id')
     AND a.privilege_type = 'SELECT'
     AND a.grantee::regrole::text = 'anon';
  IF n <> 6 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon lost SELECT on core track metadata (% of 6 columns granted)', n;
  END IF;

  -- 4. The view must survive the REVOKE. It is SECURITY DEFINER, so it reads the
  --    base table as its owner -- but assert it exists rather than assume.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
     WHERE table_schema = 'public' AND table_name = 'tracks_public'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tracks_public is gone; the player has no audio source';
  END IF;

  -- 5. The duplicate agent policy is gone, the original remains.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'artist_agent_actions'
       AND policyname = 'Artists read their own agent actions'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: duplicate agent SELECT policy still present';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'artist_agent_actions'
       AND policyname = 'artists_view_own_actions'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: artists_view_own_actions is missing; artists cannot read their own log';
  END IF;

  RAISE NOTICE 'schema-phase2-tracks-audio-column-privs: OK (audio columns denied to anon + authenticated)';
END $$;

-- Show the surviving grants on the audio columns. Expect ZERO rows.
SELECT att.attname AS column_name,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS grantee,
       a.privilege_type
  FROM pg_attribute att
  CROSS JOIN LATERAL aclexplode(att.attacl) a
 WHERE att.attrelid = 'public.tracks'::regclass
   AND att.attname IN ('audio_url_128', 'audio_url_320')
   AND a.privilege_type = 'SELECT'
 ORDER BY 1, 2;
