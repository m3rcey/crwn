-- VOD (recorded livestream) support for CRWN — Clip-to-Subscribe keystone.
-- Adds recording columns to live_sessions. LiveKit Egress records each live room
-- straight to R2; the egress webhook (/api/live/egress-webhook) flips vod_status
-- to 'ready' and writes the file location. Apply manually in Supabase SQL Editor.

ALTER TABLE live_sessions
  -- recording lifecycle: none -> recording -> processing -> ready | failed
  ADD COLUMN IF NOT EXISTS vod_status TEXT NOT NULL DEFAULT 'none',
  -- LiveKit egress id, used to correlate the async egress webhook back to the session
  ADD COLUMN IF NOT EXISTS vod_egress_id TEXT,
  -- R2 object key (used to mint signed download URLs)
  ADD COLUMN IF NOT EXISTS vod_key TEXT,
  -- public URL (convenience; canonical retrieval is a signed URL via /api/live/vod)
  ADD COLUMN IF NOT EXISTS vod_url TEXT,
  ADD COLUMN IF NOT EXISTS vod_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS vod_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS vod_ready_at TIMESTAMPTZ,
  -- 'live' = real-time LiveKit broadcast (recorded via egress).
  -- 'prerecorded' = artist uploads a video; the file IS the VOD, ready immediately.
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'live',
  -- only meaningful for prerecorded: 'public' = fans can watch (tier-gated),
  -- 'private' = owner-only (e.g. raw footage handed to a clipper, never published).
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

-- guard the lifecycle values (drop-then-add so re-running is idempotent)
ALTER TABLE live_sessions DROP CONSTRAINT IF EXISTS live_sessions_vod_status_chk;
ALTER TABLE live_sessions ADD CONSTRAINT live_sessions_vod_status_chk
  CHECK (vod_status IN ('none', 'recording', 'processing', 'ready', 'failed'));

ALTER TABLE live_sessions DROP CONSTRAINT IF EXISTS live_sessions_source_type_chk;
ALTER TABLE live_sessions ADD CONSTRAINT live_sessions_source_type_chk
  CHECK (source_type IN ('live', 'prerecorded'));

ALTER TABLE live_sessions DROP CONSTRAINT IF EXISTS live_sessions_visibility_chk;
ALTER TABLE live_sessions ADD CONSTRAINT live_sessions_visibility_chk
  CHECK (visibility IN ('public', 'private'));

-- webhook looks the session up by egress id
CREATE INDEX IF NOT EXISTS idx_live_sessions_vod_egress
  ON live_sessions(vod_egress_id);

-- ============================================================
-- live_session_messages: tier-prioritized chat
-- Denormalize the sender's tier at post time so the chat UI can badge/highlight
-- higher tiers without a per-message subscription lookup on read.
-- rank: 0 = free/no sub, 1..N = artist's active tiers ordered by price ascending,
--       99 = the artist (owner).
-- ============================================================
ALTER TABLE live_session_messages
  ADD COLUMN IF NOT EXISTS sender_tier_rank INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sender_tier_name TEXT;

-- Restrict public read to non-private sessions so private prerecorded uploads are
-- invisible to fans. The owner still reads their own (private included) via the
-- existing "Artists can manage their own live sessions" FOR ALL policy.
DROP POLICY IF EXISTS "Anyone can view active live sessions" ON live_sessions;
CREATE POLICY "Anyone can view active public live sessions"
  ON live_sessions FOR SELECT
  USING (is_active = true AND visibility = 'public');

-- Notes:
--   * vod_url/vod_status are exposed on read by the policy above (public sessions only).
--   * The egress webhook + prerecorded watch route write/read via the service-role
--     client, bypassing RLS.
