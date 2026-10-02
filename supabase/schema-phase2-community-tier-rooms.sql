-- schema-phase2-community-tier-rooms.sql
-- Tier rooms: the community tab becomes the artist's fulfillment floor.
--
-- THE PRODUCT (founder, 2026-10-02). One room per membership rung (Bronze, Silver, Gold,
-- Platinum). The artist posts into a room; that rung and every rung above it get the full
-- post. Everyone else stands at the rope: a video shows its thumbnail, play button and
-- caption; a photo shows its caption and a blurred copy; a text post shows only that it
-- exists. Non-members see like and comment COUNTS, never the comments.
--
-- WHAT THIS MIGRATION DOES
--   1. community_channels.tier_id  ties a room to the rung it belongs to (one per rung).
--   2. community_posts.channel_id  files a post in a room. Room access DECIDES the post.
--   3. community_posts.media_previews  the public teaser for each image (a tiny, pre-blurred
--      copy made at upload). Never the original: a CSS blur over the real photo is removed
--      by anyone with devtools in one click.
--   4. can_read_community_post delegates to the room when the post is in one.
--   5. can_read_community_channel / can_post_community_channel stop honouring a
--      caller-supplied p_user (the same oracle fix can_read_community_post already had).
--   6. WRITES are now entitlement-checked: a post can only be filed in a room the caller may
--      post in, and a comment or a like only lands on a post the caller can read. Before
--      this, any signed-in user could comment on a locked post they could not see.
--   7. community_posts_feed exposes the teaser fields for room posts and nothing else.
--
-- WHERE THE BYTES LIVE. A room post's photos and videos are uploaded to the PRIVATE R2
-- bucket and `media_urls` holds the object KEY, not a link. The view returns that key only
-- to an entitled reader, and /api/community/media signs it (one hour) after re-reading the
-- view as the caller. The thumbnail and the blurred previews stay in the public
-- community-media bucket on purpose: they are the sign on the door.
--
-- SAFETY NET FOR A DELETED ROOM. channel_id is ON DELETE SET NULL, so a deleted room drops
-- its posts back to their own is_free / allowed_tier_ids. The composer therefore writes
-- every room post as is_free = false with the room's tier list, so a deleted room leaves
-- its posts locked to the same people instead of publishing them.
--
-- Production state when this was written (2026-10-02, service-role read): 15 posts, none
-- gated with media, one open chat channel. Nothing existing changes meaning: every current
-- post has channel_id NULL and keeps the old rule exactly.
--
-- Apply manually in the Supabase SQL Editor (NOT auto-run). Safe to re-run.

BEGIN;

-- ============================================================
-- 1-3. Columns
-- ============================================================
ALTER TABLE community_channels
  ADD COLUMN IF NOT EXISTS tier_id UUID REFERENCES subscription_tiers(id) ON DELETE SET NULL;

-- One room per rung per artist. Partial, so ordinary chat channels (tier_id NULL) are free.
CREATE UNIQUE INDEX IF NOT EXISTS community_channels_one_room_per_tier
  ON community_channels(artist_id, tier_id) WHERE tier_id IS NOT NULL;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES community_channels(id) ON DELETE SET NULL;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS media_previews JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_community_posts_channel
  ON community_posts(channel_id, created_at DESC) WHERE channel_id IS NOT NULL;

-- ============================================================
-- 5. Channel oracles answer for the CALLER only
-- ============================================================
-- p_user stays in the signature so the existing message policies still resolve. It is
-- ignored: a direct RPC caller can no longer ask "can user X read this room".
CREATE OR REPLACE FUNCTION can_read_community_channel(p_channel UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   UUID := auth.uid();   -- p_user IGNORED
  chan     RECORD;
  fan_tier UUID;
BEGIN
  SELECT artist_id, is_free, allowed_tier_ids, is_active
    INTO chan FROM community_channels WHERE id = p_channel;
  IF NOT FOUND OR NOT chan.is_active THEN RETURN false; END IF;
  IF chan.is_free THEN RETURN true; END IF;
  IF v_user IS NULL THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM artist_profiles WHERE id = chan.artist_id AND user_id = v_user) THEN
    RETURN true;
  END IF;

  SELECT tier_id INTO fan_tier
    FROM subscriptions
   WHERE fan_id = v_user AND artist_id = chan.artist_id AND status = 'active'
   LIMIT 1;
  IF fan_tier IS NULL THEN RETURN false; END IF;

  -- Unchanged channel semantics: an EMPTY list on a paid channel means any active member.
  -- Tier rooms always carry an explicit list, so this branch never decides a room.
  IF jsonb_array_length(COALESCE(chan.allowed_tier_ids, '[]'::jsonb)) = 0 THEN RETURN true; END IF;
  RETURN chan.allowed_tier_ids ? fan_tier::text;
END;
$$;

CREATE OR REPLACE FUNCTION can_post_community_channel(p_channel UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();   -- p_user IGNORED
  chan   RECORD;
BEGIN
  IF v_user IS NULL THEN RETURN false; END IF;
  IF NOT can_read_community_channel(p_channel, v_user) THEN RETURN false; END IF;

  SELECT artist_id, artist_only_posting INTO chan FROM community_channels WHERE id = p_channel;
  IF NOT chan.artist_only_posting THEN RETURN true; END IF;

  RETURN EXISTS (SELECT 1 FROM artist_profiles WHERE id = chan.artist_id AND user_id = v_user);
END;
$$;

-- ============================================================
-- 4. A post in a room is decided by the room
-- ============================================================
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
  SELECT artist_id, author_id, channel_id, is_free, allowed_tier_ids, is_active
    INTO post FROM community_posts WHERE id = p_post;
  IF NOT FOUND OR NOT post.is_active THEN RETURN false; END IF;

  -- The artist and the author always read the post, room or not.
  IF v_user IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM artist_profiles WHERE id = post.artist_id AND user_id = v_user) THEN
      RETURN true;
    END IF;
    IF post.author_id = v_user THEN RETURN true; END IF;
  END IF;

  -- Filed in a room: the room is the whole answer, BEFORE is_free, so a room post can
  -- never be published by a stray is_free = true.
  IF post.channel_id IS NOT NULL THEN
    RETURN can_read_community_channel(post.channel_id, v_user);
  END IF;

  -- Not in a room: the original rule, unchanged.
  IF post.is_free THEN RETURN true; END IF;
  IF v_user IS NULL THEN RETURN false; END IF;

  SELECT tier_id INTO fan_tier
    FROM subscriptions
   WHERE fan_id = v_user AND artist_id = post.artist_id AND status = 'active'
   LIMIT 1;
  IF fan_tier IS NULL THEN RETURN false; END IF;
  RETURN post.allowed_tier_ids ? fan_tier::text;
END;
$$;

-- ============================================================
-- 6. Writes are entitlement-checked
-- ============================================================
-- May the caller file a post for this artist in this channel? No channel is the existing
-- wall post (unchanged). A channel must belong to the SAME artist, and the caller must be
-- allowed to post in it (tier rooms are artist-only, so only the artist can).
CREATE OR REPLACE FUNCTION community_post_write_ok(p_artist UUID, p_channel UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_channel IS NULL THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM community_channels WHERE id = p_channel AND artist_id = p_artist) THEN
    RETURN false;
  END IF;
  RETURN can_post_community_channel(p_channel, auth.uid());
END;
$$;

-- Policy functions are checked against the QUERYING role's EXECUTE (the V11 lesson), so
-- every function a policy or the view calls is granted to both browser roles. All of them
-- answer only for auth.uid(), which is what makes the grant safe.
GRANT EXECUTE ON FUNCTION can_read_community_channel(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION can_post_community_channel(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION can_read_community_post(UUID, UUID)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION community_post_write_ok(UUID, UUID)    TO anon, authenticated;

DROP POLICY IF EXISTS "Authenticated users can create community posts" ON community_posts;
CREATE POLICY "Authenticated users can create community posts"
  ON community_posts FOR INSERT
  WITH CHECK (auth.uid() = author_id AND community_post_write_ok(artist_id, channel_id));

-- The old policy had no WITH CHECK, so an author could move their own post into any room.
DROP POLICY IF EXISTS "Authors can update own community posts" ON community_posts;
CREATE POLICY "Authors can update own community posts"
  ON community_posts FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id AND community_post_write_ok(artist_id, channel_id));

DROP POLICY IF EXISTS "Authenticated users can create comments" ON community_comments;
CREATE POLICY "Authenticated users can create comments"
  ON community_comments FOR INSERT
  WITH CHECK (auth.uid() = author_id AND can_read_community_post(post_id, auth.uid()));

-- FOR ALL keeps unlike (DELETE) working on your own rows; the WITH CHECK stops a like on a
-- post the caller cannot read.
DROP POLICY IF EXISTS "Authenticated users can like posts" ON community_post_likes;
CREATE POLICY "Authenticated users can like posts"
  ON community_post_likes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND can_read_community_post(post_id, auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can like comments" ON community_comment_likes;
CREATE POLICY "Authenticated users can like comments"
  ON community_comment_likes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM community_comments c
       WHERE c.id = comment_id AND can_read_community_post(c.post_id, auth.uid())
    )
  );

-- ============================================================
-- 7. The feed view: full post for members, teaser for the rope
-- ============================================================
-- Teaser fields (media_types, thumbnail_url, media_previews, and the caption of a MEDIA
-- post) are exposed for ROOM posts only. A legacy gated post outside a room never agreed
-- to show its thumbnail, so it stays fully redacted exactly as before. The caption of a
-- room TEXT post is the post itself and is never exposed.
DROP VIEW IF EXISTS community_posts_feed;
CREATE VIEW community_posts_feed AS
SELECT
  p.id,
  p.artist_id,
  p.author_id,
  p.channel_id,
  p.is_artist_post,
  p.is_free,
  p.allowed_tier_ids,
  p.likes_count,
  p.comments_count,
  p.is_active,
  p.created_at,
  p.updated_at,
  a.ok AS can_view,
  CASE
    WHEN a.ok THEN p.content
    WHEN p.channel_id IS NOT NULL
     AND jsonb_array_length(COALESCE(p.media_types, '[]'::jsonb)) > 0 THEN p.content
  END AS content,
  CASE WHEN a.ok THEN p.media_urls END AS media_urls,
  CASE WHEN a.ok OR p.channel_id IS NOT NULL THEN p.media_types END AS media_types,
  CASE WHEN a.ok OR p.channel_id IS NOT NULL THEN p.thumbnail_url END AS thumbnail_url,
  CASE WHEN a.ok OR p.channel_id IS NOT NULL THEN p.media_previews END AS media_previews
FROM community_posts p
CROSS JOIN LATERAL (SELECT can_read_community_post(p.id, auth.uid()) AS ok) a
WHERE p.is_active = true;

GRANT SELECT ON community_posts_feed TO anon, authenticated;

COMMIT;

-- ============================================================
-- Self-verify. Runs as the SQL editor (auth.uid() NULL), which is exactly the signed-out
-- visitor at the rope.
-- ============================================================
DO $$
DECLARE
  n INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'community_channels' AND column_name = 'tier_id') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: community_channels.tier_id missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'community_posts' AND column_name = 'channel_id') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: community_posts.channel_id missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'community_posts' AND column_name = 'media_previews') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: community_posts.media_previews missing';
  END IF;
  IF to_regclass('public.community_channels_one_room_per_tier') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: one-room-per-tier index missing';
  END IF;
  IF to_regprocedure('public.community_post_write_ok(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: community_post_write_ok() missing';
  END IF;

  -- The oracles must read auth.uid(), not the argument.
  SELECT count(*) INTO n FROM pg_proc
   WHERE proname IN ('can_read_community_channel', 'can_post_community_channel', 'can_read_community_post')
     AND prosrc LIKE '%v_user%:= auth.uid()%';
  IF n <> 3 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: expected 3 caller-only community oracles, found %', n;
  END IF;

  -- Every function a policy calls is executable by both browser roles.
  SELECT count(*) INTO n
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   CROSS JOIN LATERAL aclexplode(p.proacl) acl
   WHERE ns.nspname = 'public'
     AND p.proname IN ('can_read_community_channel', 'can_post_community_channel',
                       'can_read_community_post', 'community_post_write_ok')
     AND acl.privilege_type = 'EXECUTE'
     AND acl.grantee::regrole::text IN ('anon', 'authenticated');
  IF n <> 8 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: expected 8 EXECUTE grants (4 fns x anon+authenticated), found %', n;
  END IF;

  -- The write policies carry their checks.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_posts'
                  AND policyname = 'Authenticated users can create community posts'
                  AND with_check LIKE '%community_post_write_ok%') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: post INSERT policy does not check the room';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_posts'
                  AND policyname = 'Authors can update own community posts'
                  AND with_check LIKE '%community_post_write_ok%') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: post UPDATE policy does not check the room';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_comments'
                  AND policyname = 'Authenticated users can create comments'
                  AND with_check LIKE '%can_read_community_post%') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: comment INSERT is not entitlement-checked';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_post_likes'
                  AND policyname = 'Authenticated users can like posts'
                  AND with_check LIKE '%can_read_community_post%') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: post likes are not entitlement-checked';
  END IF;

  -- The view never ships a body or media to the rope.
  SELECT count(*) INTO n FROM community_posts_feed WHERE can_view = false AND media_urls IS NOT NULL;
  IF n > 0 THEN RAISE EXCEPTION 'MIGRATION FAILED: % locked rows still carry media', n; END IF;

  SELECT count(*) INTO n FROM community_posts_feed
   WHERE can_view = false AND content IS NOT NULL
     AND (channel_id IS NULL OR jsonb_array_length(COALESCE(media_types, '[]'::jsonb)) = 0);
  IF n > 0 THEN RAISE EXCEPTION 'MIGRATION FAILED: % locked text posts still carry content', n; END IF;

  SELECT count(*) INTO n FROM community_posts_feed
   WHERE can_view = false AND channel_id IS NULL
     AND (thumbnail_url IS NOT NULL OR media_previews IS NOT NULL);
  IF n > 0 THEN RAISE EXCEPTION 'MIGRATION FAILED: % locked non-room posts expose a teaser', n; END IF;

  RAISE NOTICE 'schema-phase2-community-tier-rooms: OK';
END $$;
