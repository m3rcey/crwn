-- schema-phase2-community-posts-rls-enable.sql
--
-- FOLLOW-UP to schema-phase2-community-posts-rls.sql, which did NOT close the leak.
--
-- WHAT WENT WRONG (twice):
--
-- 1. That migration wrote the right policies, but a policy on a table with RLS
--    DISABLED does nothing. `schema-community.sql` line 57 enables RLS on
--    community_posts, yet on the live database it was off, so every policy on
--    that table was decorative. Confirmed from outside with the anon key: paid
--    post bodies came back from /rest/v1/community_posts?is_free=eq.false.
--
-- 2. Once RLS was switched on, this file's own verification found TWO permissive
--    SELECT policies on community_posts. Postgres ORs permissive policies
--    together, so a second `USING (is_active = true)` style policy re-opens the
--    leak no matter how strict ours is. That second policy exists ONLY in the
--    live database; no migration in this repo creates it. It was added out of
--    band (dashboard). We therefore cannot drop it by name: we discover it.
--
-- WHY THE ORIGINAL SELF-VERIFY MISSED ALL THIS: its DO block ran as the
-- migration's superuser, which BYPASSES RLS, so its "no row leaks content" check
-- was made from a seat entitled to everything and passed vacuously. A
-- verification that cannot fail is not a verification. This file asserts
-- pg_class.relrowsecurity and the policy COUNT instead: facts about the schema,
-- not observations from a privileged session.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

-- ============================================================
-- 1. Turn on the switch that makes Postgres consult the policies at all.
-- ============================================================
ALTER TABLE community_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Remove any permissive SELECT policy that is not ours.
--
-- A permissive FOR ALL policy also grants SELECT, but dropping it would take
-- INSERT/UPDATE/DELETE with it. That is not a call a migration should make
-- silently, so we refuse and name it instead.
-- ============================================================
DO $$
DECLARE
  pol RECORD;
  dropped INTEGER := 0;
BEGIN
  FOR pol IN
    SELECT tablename, policyname, cmd
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('community_posts', 'community_comments')
       AND permissive = 'PERMISSIVE'
       AND cmd = 'ALL'
  LOOP
    RAISE EXCEPTION
      'REFUSING TO CONTINUE: % has a permissive FOR ALL policy %, which grants SELECT. Dropping it would also remove write access. Inspect it and decide by hand.',
      pol.tablename, quote_literal(pol.policyname);
  END LOOP;

  FOR pol IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND permissive = 'PERMISSIVE'
       AND cmd = 'SELECT'
       AND (
         (tablename = 'community_posts'    AND policyname <> 'Entitled readers see community posts')
         OR
         (tablename = 'community_comments' AND policyname <> 'Entitled readers see comments')
       )
  LOOP
    RAISE NOTICE 'dropping stray permissive SELECT policy % on %', quote_literal(pol.policyname), pol.tablename;
    EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
    dropped := dropped + 1;
  END LOOP;

  RAISE NOTICE 'dropped % stray SELECT polic(y/ies)', dropped;
END $$;

-- ============================================================
-- 3. Self-verify. Assert the SWITCH and the COUNT, not behaviour observed
--    from a superuser session.
-- ============================================================
DO $$
DECLARE
  posts_rls    BOOLEAN;
  comments_rls BOOLEAN;
  n            INTEGER;
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

  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'community_posts'
     AND cmd = 'SELECT' AND permissive = 'PERMISSIVE';
  IF n <> 1 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: community_posts has % permissive SELECT policies, expected exactly 1 (they are OR-ed)', n;
  END IF;

  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'community_comments'
     AND cmd = 'SELECT' AND permissive = 'PERMISSIVE';
  IF n <> 1 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: community_comments has % permissive SELECT policies, expected exactly 1', n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'community_posts' AND policyname = 'Entitled readers see community posts'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: the entitled-readers policy is missing; run schema-phase2-community-posts-rls.sql first';
  END IF;

  RAISE NOTICE 'schema-phase2-community-posts-rls-enable: OK (RLS on, exactly 1 SELECT policy per table)';
END $$;

-- ============================================================
-- 4. Show what survives, so the result is inspected rather than assumed.
-- ============================================================
SELECT tablename, policyname, cmd, permissive
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('community_posts', 'community_comments')
 ORDER BY tablename, cmd, policyname;

-- ============================================================
-- 5. THEN VERIFY FROM OUTSIDE. The SQL editor is a superuser seat and cannot
--    see what an anonymous visitor sees. RLS does not apply to it.
--
--   curl -s "$SUPABASE_URL/rest/v1/community_posts?select=id,content&is_free=eq.false" \
--        -H "apikey: $ANON_KEY"
--
-- Expect []. Anything else means paid posts are still readable.
-- ============================================================
