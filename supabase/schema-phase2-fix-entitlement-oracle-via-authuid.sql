-- schema-phase2-fix-entitlement-oracle-via-authuid.sql
--
-- SUPERSEDES schema-phase2-revoke-entitlement-oracle-execute.sql, which was WRONG
-- and caused a production outage.
--
-- WHAT WENT WRONG: that migration REVOKEd EXECUTE on the entitlement helpers from
-- anon + authenticated, on the belief that a SECURITY DEFINER view calls functions
-- as the view OWNER. That is false. A view delegates the owner's privileges for
-- TABLE access, but a function invoked inside the view is checked against the
-- QUERYING role's EXECUTE privilege. So revoking EXECUTE from authenticated made
-- tracks_public and community_posts_feed return
--   42501 permission denied for function can_play_track
-- for every logged-in user -- the player and community feed went dark. Confirmed
-- from outside with the anon key.
--
-- THE REAL FIX: the functions must stay EXECUTE-able by anon + authenticated, or
-- the views break. The oracle risk was that a direct RPC caller could pass ANY
-- p_user and read back that user's entitlement. So we neuter the argument: the
-- function IGNORES p_user and derives auth.uid() itself. Now it can only ever
-- answer for the caller, whether reached through the view (which passed auth.uid()
-- anyway) or by direct RPC (where a spoofed p_user is discarded).
--
-- p_user is retained in the signature ONLY so the dependent views' call sites
-- (can_play_track(t.id, auth.uid())) still resolve without editing the views.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION can_play_track(p_track UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   UUID := auth.uid();   -- p_user IGNORED; entitlement is always the caller's
  t        RECORD;
  fan_tier UUID;
BEGIN
  SELECT artist_id, is_free, allowed_tier_ids INTO t FROM tracks WHERE id = p_track;
  IF NOT FOUND THEN RETURN false; END IF;
  IF t.is_free THEN RETURN true; END IF;
  IF v_user IS NULL THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM artist_profiles WHERE id = t.artist_id AND user_id = v_user) THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM purchases WHERE fan_id = v_user AND track_id = p_track AND status = 'completed') THEN
    RETURN true;
  END IF;

  SELECT tier_id INTO fan_tier
    FROM subscriptions
   WHERE fan_id = v_user AND artist_id = t.artist_id AND status = 'active'
   LIMIT 1;

  IF fan_tier IS NULL THEN RETURN false; END IF;
  RETURN to_jsonb(t.allowed_tier_ids) ? fan_tier::text;
END;
$$;

CREATE OR REPLACE FUNCTION can_read_community_post(p_post UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   UUID := auth.uid();   -- p_user IGNORED; entitlement is always the caller's
  post     RECORD;
  fan_tier UUID;
BEGIN
  SELECT artist_id, is_free, allowed_tier_ids, is_active INTO post FROM community_posts WHERE id = p_post;
  IF NOT FOUND OR NOT post.is_active THEN RETURN false; END IF;
  IF post.is_free THEN RETURN true; END IF;
  IF v_user IS NULL THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM artist_profiles WHERE id = post.artist_id AND user_id = v_user) THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM community_posts WHERE id = p_post AND author_id = v_user) THEN
    RETURN true;
  END IF;

  SELECT tier_id INTO fan_tier
    FROM subscriptions
   WHERE fan_id = v_user AND artist_id = post.artist_id AND status = 'active'
   LIMIT 1;

  IF fan_tier IS NULL THEN RETURN false; END IF;
  RETURN post.allowed_tier_ids ? fan_tier::text;
END;
$$;

-- Restore EXECUTE, or the views stay broken. Safe now that the functions only
-- ever answer for auth.uid().
GRANT EXECUTE ON FUNCTION can_play_track(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION can_read_community_post(UUID, UUID) TO anon, authenticated;

COMMIT;

-- ============================================================
-- Self-verify. Schema facts + a behaviour check that IS meaningful from this
-- session: with auth.uid() NULL here, can_play_track for a paid track must be
-- false regardless of the p_user passed -- proving the argument is ignored.
-- ============================================================
DO $$
DECLARE
  n INTEGER;
BEGIN
  -- EXECUTE restored to both roles.
  SELECT count(*) INTO n
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE ns.nspname = 'public'
     AND p.proname IN ('can_play_track', 'can_read_community_post')
     AND a.privilege_type = 'EXECUTE'
     AND a.grantee::regrole::text IN ('anon', 'authenticated');
  IF n <> 4 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: expected 4 EXECUTE grants (2 fns x anon+authenticated), found %', n;
  END IF;

  -- The argument must be ignored: pass a random uuid, still get the caller's
  -- answer. As a NULL-auth.uid() session, a paid track is false either way, but a
  -- FREE track is true regardless of p_user, which exercises the code path.
  IF (SELECT can_play_track(id, '11111111-1111-1111-1111-111111111111'::uuid))
       IS DISTINCT FROM
     (SELECT can_play_track(id, NULL))
     FROM tracks WHERE is_free = false LIMIT 1
  THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_play_track still honours p_user (oracle not closed)';
  END IF;

  RAISE NOTICE 'schema-phase2-fix-entitlement-oracle-via-authuid: OK (views restored, oracle closed)';
END $$;
