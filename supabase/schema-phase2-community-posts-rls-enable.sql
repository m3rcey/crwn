-- schema-phase2-community-posts-rls-enable.sql
--
-- FOLLOW-UP to schema-phase2-community-posts-rls.sql, which did NOT close the leak.
--
-- WHAT WENT WRONG: that migration wrote the right policies, but a policy on a
-- table with RLS DISABLED does nothing. `schema-community.sql` line 57 has
-- `ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY`, but on the live
-- database RLS is off, so every policy on it has always been decorative.
-- Verified from outside with the anon key: paid post bodies came back from
-- /rest/v1/community_posts?is_free=eq.false.
--
-- WHY THE SELF-VERIFY MISSED IT: the DO block ran as the migration's superuser,
-- which BYPASSES RLS. Its "no rows leak content" check queried the view as a
-- user who is entitled to everything, so it passed vacuously. A verification
-- that cannot fail is not a verification. The block below checks
-- pg_class.relrowsecurity directly, which is a fact about the table rather than
-- an observation made from a privileged seat.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

-- The policies already exist (from the previous migration). Turn on the switch
-- that makes the database consult them at all.
ALTER TABLE community_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ============================================================
-- Self-verify: assert the SWITCH, not the behaviour observed from a
-- superuser session. relrowsecurity is what Postgres actually consults.
-- ============================================================
DO $$
DECLARE
  posts_rls    BOOLEAN;
  comments_rls BOOLEAN;
  sel_policies INTEGER;
BEGIN
  SELECT relrowsecurity INTO posts_rls
    FROM pg_class WHERE relname = 'community_posts' AND relnamespace = 'public'::regnamespace;
  SELECT relrowsecurity INTO comments_rls
    FROM pg_class WHERE relname = 'community_comments' AND relnamespace = 'public'::regnamespace;

  IF NOT COALESCE(posts_rls, false) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: RLS still disabled on community_posts, every policy on it is decorative';
  END IF;

  IF NOT COALESCE(comments_rls, false) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: RLS still disabled on community_comments';
  END IF;

  -- With RLS on, exactly one permissive SELECT policy must exist. Postgres ORs
  -- permissive policies together, so a stray second one would re-open the leak.
  SELECT count(*) INTO sel_policies
    FROM pg_policies
   WHERE tablename = 'community_posts' AND cmd = 'SELECT' AND permissive = 'PERMISSIVE';

  IF sel_policies <> 1 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: community_posts has % permissive SELECT policies, expected exactly 1 (they are OR-ed, so any extra one re-opens the leak)', sel_policies;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'community_posts' AND policyname = 'Entitled readers see community posts'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: the entitled-readers policy is missing; run schema-phase2-community-posts-rls.sql first';
  END IF;

  RAISE NOTICE 'schema-phase2-community-posts-rls-enable: OK (RLS on, 1 SELECT policy)';
END $$;

-- ============================================================
-- AFTER RUNNING THIS, verify from OUTSIDE the database. The SQL editor is a
-- superuser seat and cannot see what an anonymous visitor sees:
--
--   curl -s "$SUPABASE_URL/rest/v1/community_posts?select=id,content&is_free=eq.false" \
--        -H "apikey: $ANON_KEY"
--
-- Expect []. Anything else means paid posts are still readable.
-- ============================================================
