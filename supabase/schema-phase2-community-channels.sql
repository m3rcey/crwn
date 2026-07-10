-- schema-phase2-community-channels.sql
-- Discord-style chat channels inside an artist's community.
--
-- This sits ALONGSIDE community_posts (the existing feed, which keeps video
-- posting). Posts are long-form and threaded; channels are fast, flat chat.
--
-- Access model matches the rest of the app: is_free + allowed_tier_ids (JSONB
-- array of tier uuids). A channel is readable when it is free, or when the
-- viewer holds an ACTIVE subscription on a listed tier, or when the viewer owns
-- the artist profile.
--
-- Unlike community_posts (whose SELECT policy is just `is_active = true`, with
-- tier gating done client-side), channel messages are gated in RLS. Realtime
-- replays RLS on every row it pushes, so a client-side check alone would leak
-- paid chat to any subscriber of the realtime channel.
--
-- Apply manually in the Supabase SQL Editor (NOT auto-run). Safe to re-run.

BEGIN;

-- ============================================================
-- community_channels
-- ============================================================
CREATE TABLE IF NOT EXISTS community_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  -- Access control (mirrors community_posts / tracks / albums).
  is_free BOOLEAN NOT NULL DEFAULT true,
  allowed_tier_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Announce-only channels: the artist posts, fans read.
  artist_only_posting BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_channels_slug_unique UNIQUE (artist_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_community_channels_artist
  ON community_channels(artist_id, position);

-- ============================================================
-- community_channel_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS community_channel_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_channel_messages_channel
  ON community_channel_messages(channel_id, created_at DESC);

-- ============================================================
-- Access helper
-- ============================================================
-- SECURITY DEFINER so the policy can read subscriptions/artist_profiles without
-- granting the caller direct select on them. search_path is pinned: a definer
-- function with a mutable search_path is a privilege-escalation vector.
CREATE OR REPLACE FUNCTION can_read_community_channel(p_channel UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chan RECORD;
  fan_tier UUID;
BEGIN
  SELECT artist_id, is_free, allowed_tier_ids, is_active
    INTO chan
    FROM community_channels
   WHERE id = p_channel;

  IF NOT FOUND OR NOT chan.is_active THEN
    RETURN false;
  END IF;

  -- Free channels are public, matching the public artist page.
  IF chan.is_free THEN
    RETURN true;
  END IF;

  IF p_user IS NULL THEN
    RETURN false;
  END IF;

  -- The artist always reads their own channels.
  IF EXISTS (
    SELECT 1 FROM artist_profiles
     WHERE id = chan.artist_id AND user_id = p_user
  ) THEN
    RETURN true;
  END IF;

  SELECT tier_id INTO fan_tier
    FROM subscriptions
   WHERE fan_id = p_user
     AND artist_id = chan.artist_id
     AND status = 'active'
   LIMIT 1;

  IF fan_tier IS NULL THEN
    RETURN false;
  END IF;

  -- An explicit tier list gates to those tiers. An EMPTY list on a paid channel
  -- means "any active subscriber", matching how the composer writes tracks and
  -- albums (is_free=false with no tiers picked = subscribers only).
  IF jsonb_array_length(chan.allowed_tier_ids) = 0 THEN
    RETURN true;
  END IF;

  RETURN chan.allowed_tier_ids ? fan_tier::text;
END;
$$;

-- Can this user POST in the channel? Read access, plus the announce-only rule.
CREATE OR REPLACE FUNCTION can_post_community_channel(p_channel UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chan RECORD;
BEGIN
  IF p_user IS NULL THEN
    RETURN false;
  END IF;

  IF NOT can_read_community_channel(p_channel, p_user) THEN
    RETURN false;
  END IF;

  SELECT artist_id, artist_only_posting INTO chan
    FROM community_channels WHERE id = p_channel;

  IF NOT chan.artist_only_posting THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM artist_profiles
     WHERE id = chan.artist_id AND user_id = p_user
  );
END;
$$;

-- ============================================================
-- RLS: channels
-- ============================================================
ALTER TABLE community_channels ENABLE ROW LEVEL SECURITY;

-- The channel LIST is public (names only, no messages) so a fan can see a
-- locked channel and know what upgrading buys them.
DROP POLICY IF EXISTS "Anyone can list active channels" ON community_channels;
CREATE POLICY "Anyone can list active channels"
  ON community_channels FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Artists manage their own channels" ON community_channels;
CREATE POLICY "Artists manage their own channels"
  ON community_channels FOR ALL
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- ============================================================
-- RLS: messages
-- ============================================================
ALTER TABLE community_channel_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read channel messages" ON community_channel_messages;
CREATE POLICY "Members read channel messages"
  ON community_channel_messages FOR SELECT
  USING (is_deleted = false AND can_read_community_channel(channel_id, auth.uid()));

DROP POLICY IF EXISTS "Members post channel messages" ON community_channel_messages;
CREATE POLICY "Members post channel messages"
  ON community_channel_messages FOR INSERT
  WITH CHECK (author_id = auth.uid() AND can_post_community_channel(channel_id, auth.uid()));

-- Soft delete: the author removes their own, the artist moderates any.
DROP POLICY IF EXISTS "Author or artist can moderate messages" ON community_channel_messages;
CREATE POLICY "Author or artist can moderate messages"
  ON community_channel_messages FOR UPDATE
  USING (
    author_id = auth.uid()
    OR channel_id IN (
      SELECT c.id FROM community_channels c
      JOIN artist_profiles a ON a.id = c.artist_id
      WHERE a.user_id = auth.uid()
    )
  );

COMMIT;

-- ============================================================
-- Realtime: stream message inserts to subscribed clients.
-- RLS above is replayed per row, so a locked channel never reaches a fan
-- who does not hold the tier.
-- ============================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE community_channel_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Self-verify: a partial apply must fail loudly rather than leave the
-- messages table readable without the gating function existing.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'community_channels') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: community_channels missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'community_channel_messages') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: community_channel_messages missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_read_community_channel') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_read_community_channel() missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_post_community_channel') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_post_community_channel() missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'community_channel_messages' AND policyname = 'Members read channel messages'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: message SELECT policy missing (paid chat would be readable by anyone)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'community_channel_messages' AND policyname = 'Members post channel messages'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: message INSERT policy missing';
  END IF;

  RAISE NOTICE 'schema-phase2-community-channels: OK';
END $$;
