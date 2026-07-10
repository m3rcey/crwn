-- schema-phase2-revoke-entitlement-oracle-execute.sql
--
-- Stop anon/authenticated from calling the entitlement helpers directly.
--
-- THE ISSUE (confirmed from outside with the anon key, 2026-07-10):
--   Postgres grants EXECUTE on a new function to PUBLIC by default. So the anon
--   key could POST /rest/v1/rpc/can_play_track with ANY p_user and read the
--   boolean back:
--     can_play_track('<paid track>', '<some artist user_id>')  -> true
--     can_play_track('<paid track>', '<random uuid>')          -> false
--   That is an entitlement ORACLE. It returns no row data -- only true/false --
--   but it answers "is THAT user entitled to this track?" for any user id, and
--   user ids are themselves world-readable (artist_profiles.user_id).
--   can_read_community_post has the same exposure.
--
-- WHY REVOKING IS SAFE: both functions exist ONLY to be called from inside their
-- SECURITY DEFINER views (tracks_public, community_posts_feed). A SECURITY DEFINER
-- view evaluates its body as the view OWNER, so the owner's EXECUTE privilege is
-- what matters there -- not the caller's. Nothing in the app calls either function
-- over RPC (grep: no rpc('can_play_track') / rpc('can_read_community_post')).
-- Revoking EXECUTE from PUBLIC therefore closes the RPC door and leaves the views
-- working.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

-- REVOKE from PUBLIC covers anon + authenticated (they inherit PUBLIC). Also
-- revoke explicitly, in case a prior migration granted them by name. The function
-- owner keeps EXECUTE, so the definer views are unaffected.
REVOKE EXECUTE ON FUNCTION can_play_track(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION can_read_community_post(UUID, UUID) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ============================================================
-- Self-verify (AFTER the COMMIT). Schema facts only; the real proof is the anon
-- RPC returning 404/403, checked from outside and now by /api/cron/rls-canary.
-- ============================================================
DO $$
DECLARE
  n INTEGER;
BEGIN
  -- Neither function may still grant EXECUTE to PUBLIC/anon/authenticated.
  SELECT count(*) INTO n
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE ns.nspname = 'public'
     AND p.proname IN ('can_play_track', 'can_read_community_post')
     AND a.privilege_type = 'EXECUTE'
     AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated'));
  IF n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: % EXECUTE grant(s) to public/anon/authenticated survive', n;
  END IF;

  -- The definer views that depend on the functions must still exist.
  IF NOT EXISTS (SELECT 1 FROM information_schema.views
                  WHERE table_schema='public' AND table_name='tracks_public') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tracks_public missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.views
                  WHERE table_schema='public' AND table_name='community_posts_feed') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: community_posts_feed missing';
  END IF;

  RAISE NOTICE 'schema-phase2-revoke-entitlement-oracle-execute: OK (RPC door closed, views intact)';
END $$;

-- proacl for both. A NULL acl means "owner-only" (default EXECUTE to PUBLIC is
-- gone once any REVOKE touches it). Confirm no anon/authenticated EXECUTE remains.
SELECT p.proname,
       coalesce(array_to_string(p.proacl, E'\n'), '(owner only)') AS acl
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
 WHERE ns.nspname = 'public'
   AND p.proname IN ('can_play_track', 'can_read_community_post');
