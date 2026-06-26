-- Direct Messaging schema for CRWN
-- Tier-gated 1:1 DMs between a fan and an artist, plus artist broadcast-to-tier.
-- Gating is driven by the `direct_messaging` benefit on a tier (tier_benefits row).
-- Mirrors RLS + realtime shape of schema-phase2-livestreams.sql.
-- Apply manually in the Supabase SQL Editor (NOT auto-run).

-- ============================================================
-- dm_conversations  (one row per fan<->artist pair)
-- ============================================================
CREATE TABLE IF NOT EXISTS dm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  fan_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- denormalized for inbox rendering / sorting
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_preview TEXT,
  last_sender_is_artist BOOLEAN NOT NULL DEFAULT false,
  fan_unread INTEGER NOT NULL DEFAULT 0,
  artist_unread INTEGER NOT NULL DEFAULT 0,
  -- priority sorting: 0 = no/free sub, 1..N = tiers by price ascending
  fan_tier_rank INTEGER NOT NULL DEFAULT 0,
  fan_tier_name TEXT,
  -- artist volume control
  muted_by_artist BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT dm_conversations_unique UNIQUE (artist_id, fan_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_conversations_artist
  ON dm_conversations(artist_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_fan
  ON dm_conversations(fan_id, last_message_at DESC);

ALTER TABLE dm_conversations ENABLE ROW LEVEL SECURITY;

-- Fan sees their own conversations
DROP POLICY IF EXISTS "Fans see their own conversations" ON dm_conversations;
CREATE POLICY "Fans see their own conversations"
  ON dm_conversations FOR SELECT
  USING (fan_id = auth.uid());

-- Artist sees conversations on their artist profile
DROP POLICY IF EXISTS "Artists see their conversations" ON dm_conversations;
CREATE POLICY "Artists see their conversations"
  ON dm_conversations FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- All writes go through the API (service-role admin client); no client INSERT/UPDATE policies.

-- ============================================================
-- dm_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- true = artist authored, false = fan authored
  sender_is_artist BOOLEAN NOT NULL DEFAULT false,
  body TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation
  ON dm_messages(conversation_id, created_at);

ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;

-- Participants (the fan, or the owning artist) can read messages in a conversation.
-- This drives both the initial load and the realtime subscription, so it must
-- cover every reader the client subscribes as.
DROP POLICY IF EXISTS "Participants can read conversation messages" ON dm_messages;
CREATE POLICY "Participants can read conversation messages"
  ON dm_messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM dm_conversations
      WHERE fan_id = auth.uid()
         OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
    )
  );

-- All inserts/soft-deletes go through the API (service-role admin client).

-- ============================================================
-- Realtime: stream message inserts + conversation updates to clients
-- ============================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE dm_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE dm_conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Notifications: allow the 'direct_message' type.
-- The original CHECK only listed a handful of types but the app already emits
-- more (earning, milestone, live_session, cashout...). Drop the stale CHECK so
-- the type column accepts any app-defined type, including 'direct_message'.
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
