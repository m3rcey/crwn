-- Livestreaming ("Listening Sessions") schema for CRWN
-- Tier-gated live broadcasts with slot caps + persisted chat.
-- Mirrors RLS shape of schema-booking.sql. Apply manually in Supabase SQL Editor.

-- ============================================================
-- live_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  -- tier gating (mirrors booking_is_free / booking_allowed_tier_ids)
  is_free BOOLEAN NOT NULL DEFAULT false,
  allowed_tier_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- viewer slot cap
  max_slots INTEGER NOT NULL DEFAULT 50,
  -- lifecycle
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  -- provider abstraction (LiveKit today, swappable)
  provider TEXT NOT NULL DEFAULT 'livekit',
  room_name TEXT NOT NULL UNIQUE,
  -- reserved for paid "tickets" (v1 leaves NULL, no checkout built)
  price INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT live_sessions_status_chk CHECK (status IN ('scheduled', 'live', 'ended'))
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_artist
  ON live_sessions(artist_id, status, is_active);
CREATE INDEX IF NOT EXISTS idx_live_sessions_scheduled
  ON live_sessions(scheduled_at);

ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;

-- Public read for active sessions
CREATE POLICY "Anyone can view active live sessions"
  ON live_sessions FOR SELECT
  USING (is_active = true);

-- Artist manages their own sessions (FOR ALL also gives owner the
-- soft-delete SELECT override when is_active = false)
CREATE POLICY "Artists can manage their own live sessions"
  ON live_sessions FOR ALL
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- ============================================================
-- live_session_participants (slot tracking + v2 stage roles)
-- ============================================================
CREATE TABLE IF NOT EXISTS live_session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- v2-ready role: broadcaster (artist), viewer (v1 default), stage (v2 on-stage fan)
  role TEXT NOT NULL DEFAULT 'viewer',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT live_participant_role_chk CHECK (role IN ('broadcaster', 'viewer', 'stage')),
  CONSTRAINT live_participant_unique UNIQUE (session_id, user_id)
);

-- Active viewer slot count = rows WHERE left_at IS NULL AND role = 'viewer'
CREATE INDEX IF NOT EXISTS idx_live_participants_active
  ON live_session_participants(session_id) WHERE left_at IS NULL;

ALTER TABLE live_session_participants ENABLE ROW LEVEL SECURITY;

-- Users see their own participant rows
CREATE POLICY "Users see their own participant rows"
  ON live_session_participants FOR SELECT
  USING (user_id = auth.uid());

-- Artists see participants of their own sessions
CREATE POLICY "Artists see participants of their sessions"
  ON live_session_participants FOR SELECT
  USING (session_id IN (
    SELECT id FROM live_sessions
    WHERE artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  ));
-- NOTE: INSERT/UPDATE performed by the service-role token route only (no client write policy).

-- ============================================================
-- live_session_messages (live chat, persisted)
-- ============================================================
CREATE TABLE IF NOT EXISTS live_session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_messages_session
  ON live_session_messages(session_id, created_at);

ALTER TABLE live_session_messages ENABLE ROW LEVEL SECURITY;

-- Read non-deleted messages (canonical write/gate is the API; this enables Realtime reads)
CREATE POLICY "Read non-deleted live messages"
  ON live_session_messages FOR SELECT
  USING (is_deleted = false);

-- Defense-in-depth: a user may only insert messages as themselves.
-- The canonical post path is the gated /api/live/chat route (tier + live checks).
CREATE POLICY "Users post their own live messages"
  ON live_session_messages FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Author or session-owning artist can soft-delete (moderation)
CREATE POLICY "Artist or author can delete live messages"
  ON live_session_messages FOR UPDATE
  USING (
    user_id = auth.uid()
    OR session_id IN (
      SELECT id FROM live_sessions
      WHERE artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
    )
  );
