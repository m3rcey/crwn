-- schema-phase2-dm-broadcast-controls.sql
-- Broadcast controls for direct messages.
--
-- Adds two flags to dm_messages:
--   is_broadcast      — this message was fanned out to a segment, not typed 1:1.
--                       Used to render an "Announcement" chip in the thread.
--   replies_disabled  — the artist sent this as announce-only. While the newest
--                       message in a conversation carries this flag, the fan's
--                       composer is locked. The lock is per-message, not
--                       per-conversation: the next repliable message from the
--                       artist re-opens the thread, and thread history stays
--                       readable throughout.
--
-- Enforcement lives in POST /api/messages (server-side). The disabled composer
-- in MessageThread is a courtesy, not the gate.
--
-- Apply manually in the Supabase SQL Editor (NOT auto-run). Safe to re-run.

BEGIN;

ALTER TABLE dm_messages
  ADD COLUMN IF NOT EXISTS is_broadcast BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE dm_messages
  ADD COLUMN IF NOT EXISTS replies_disabled BOOLEAN NOT NULL DEFAULT false;

-- The reply gate reads the newest message of a conversation on every fan send,
-- so keep that lookup on an index rather than a sequential scan of the thread.
CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_latest
  ON dm_messages(conversation_id, created_at DESC);

COMMIT;

-- ============================================================
-- Self-verify: a partial apply must fail loudly here rather than
-- silently leave the reply gate reading a column that never landed.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dm_messages' AND column_name = 'is_broadcast'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: dm_messages.is_broadcast missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dm_messages' AND column_name = 'replies_disabled'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: dm_messages.replies_disabled missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'dm_messages' AND indexname = 'idx_dm_messages_conversation_latest'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: idx_dm_messages_conversation_latest missing';
  END IF;

  RAISE NOTICE 'schema-phase2-dm-broadcast-controls: OK';
END $$;
