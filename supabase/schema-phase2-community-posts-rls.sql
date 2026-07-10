-- schema-phase2-community-posts-rls.sql
-- Close the paid-community-post leak.
--
-- THE BUG: community_posts' SELECT policy was `is_active = true`. The tier gate
-- lived only in CommunityPostCard.tsx. So any anon-key client could read the
-- body and media URLs of every paid post by querying the table directly.
--
-- THE SHAPE OF THE FIX: RLS is row-level, not column-level. Simply restricting
-- the rows would delete the locked teaser card that drives subscriptions, so the
-- row must stay visible while `content` and the media columns disappear.
--   1. community_posts SELECT is restricted to entitled readers.
--   2. community_posts_feed, a view, exposes every active row to everyone but
--      NULLs out content/media for readers who are not entitled, and reports
--      `can_view` so the client stops deciding entitlement for itself.
--   The view is SECURITY DEFINER (the Postgres default: security_invoker is off),
--   so it reads the base table past RLS and applies its own redaction.
--   3. community_comments on a gated post are gated content too.
--
-- ENTITLEMENT MATCHES THE CLIENT EXACTLY: a post is readable when it is free, or
-- the reader owns the artist page, or the reader holds an ACTIVE subscription on
-- a tier named in allowed_tier_ids. NOTE: unlike community_channels, an EMPTY
-- allowed_tier_ids on a paid POST means nobody, because CommunityPostCard.tsx
-- requires `allowed_tier_ids.includes(tierId)`. Widening that here would silently
-- publish posts the artist believes are locked.
--
-- Apply manually in the Supabase SQL Editor (NOT auto-run). Safe to re-run.

BEGIN;

-- ============================================================
-- Entitlement helper
-- ============================================================
-- SECURITY DEFINER so the policy can read subscriptions/artist_profiles without
-- granting the caller select on them. search_path is pinned: a definer function
-- with a mutable search_path is a privilege-escalation vector.
CREATE OR REPLACE FUNCTION can_read_community_post(p_post UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post RECORD;
  fan_tier UUID;
BEGIN
  SELECT artist_id, is_free, allowed_tier_ids, is_active
    INTO post
    FROM community_posts
   WHERE id = p_post;

  IF NOT FOUND OR NOT post.is_active THEN
    RETURN false;
  END IF;

  -- Free posts are public, matching the public artist page.
  IF post.is_free THEN
    RETURN true;
  END IF;

  IF p_user IS NULL THEN
    RETURN false;
  END IF;

  -- The artist always reads their own posts, gated or not.
  IF EXISTS (
    SELECT 1 FROM artist_profiles
     WHERE id = post.artist_id AND user_id = p_user
  ) THEN
    RETURN true;
  END IF;

  -- The post's author always reads their own post.
  IF EXISTS (
    SELECT 1 FROM community_posts
     WHERE id = p_post AND author_id = p_user
  ) THEN
    RETURN true;
  END IF;

  SELECT tier_id INTO fan_tier
    FROM subscriptions
   WHERE fan_id = p_user
     AND artist_id = post.artist_id
     AND status = 'active'
   LIMIT 1;

  IF fan_tier IS NULL THEN
    RETURN false;
  END IF;

  -- Deliberately NO "empty list means any subscriber" fallback here.
  -- See the header note: the client requires an explicit tier match.
  RETURN post.allowed_tier_ids ? fan_tier::text;
END;
$$;

-- ============================================================
-- Tighten the base table
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read active community posts" ON community_posts;

DROP POLICY IF EXISTS "Entitled readers see community posts" ON community_posts;
CREATE POLICY "Entitled readers see community posts"
  ON community_posts FOR SELECT
  USING (is_active = true AND can_read_community_post(id, auth.uid()));

-- ============================================================
-- The feed view: every active row, redacted when not entitled
-- ============================================================
DROP VIEW IF EXISTS community_posts_feed;
CREATE VIEW community_posts_feed AS
SELECT
  p.id,
  p.artist_id,
  p.author_id,
  p.is_artist_post,
  p.is_free,
  p.allowed_tier_ids,
  p.likes_count,
  p.comments_count,
  p.is_active,
  p.created_at,
  p.updated_at,
  can_read_community_post(p.id, auth.uid()) AS can_view,
  CASE WHEN can_read_community_post(p.id, auth.uid()) THEN p.content       END AS content,
  CASE WHEN can_read_community_post(p.id, auth.uid()) THEN p.media_urls    END AS media_urls,
  CASE WHEN can_read_community_post(p.id, auth.uid()) THEN p.media_types   END AS media_types,
  CASE WHEN can_read_community_post(p.id, auth.uid()) THEN p.thumbnail_url END AS thumbnail_url
FROM community_posts p
WHERE p.is_active = true;

GRANT SELECT ON community_posts_feed TO anon, authenticated;

-- ============================================================
-- Comments on a gated post are gated content too
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read active comments" ON community_comments;

DROP POLICY IF EXISTS "Entitled readers see comments" ON community_comments;
CREATE POLICY "Entitled readers see comments"
  ON community_comments FOR SELECT
  USING (is_active = true AND can_read_community_post(post_id, auth.uid()));

COMMIT;

-- ============================================================
-- Self-verify. A partial apply must fail loudly rather than leave the
-- old `is_active = true` policy publishing paid posts.
-- ============================================================
DO $$
DECLARE
  leaked INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_read_community_post') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_read_community_post() missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'community_posts' AND policyname = 'Anyone can read active community posts'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: the permissive SELECT policy still exists, paid posts remain readable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'community_posts' AND policyname = 'Entitled readers see community posts'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: community_posts SELECT policy missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'community_posts_feed') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: community_posts_feed view missing (the feed would render empty)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'community_comments' AND policyname = 'Anyone can read active comments'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: comments on gated posts remain readable';
  END IF;

  -- The view must never ship content for a row the reader cannot see.
  SELECT count(*) INTO leaked
    FROM community_posts_feed
   WHERE can_view = false AND content IS NOT NULL;
  IF leaked > 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: % redacted rows still carry content', leaked;
  END IF;

  RAISE NOTICE 'schema-phase2-community-posts-rls: OK';
END $$;
