-- ─────────────────────────────────────────────────────────────────────────────
-- Voice notes in direct messages (feature: artists can message fans with voice)
--
-- The DM system (dm_conversations / dm_messages) already ships text 1:1 threads
-- and artist broadcast. This adds an optional audio attachment to a message.
-- A voice-only message keeps a short label in the NOT NULL `body` column (set by
-- the API) and carries the audio in these columns. Audio is stored in the same
-- Supabase `audio` bucket that tracks use.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS audio_duration_ms INTEGER;

-- ─── Self-verify ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dm_messages' AND column_name = 'audio_url'
  ) THEN
    RAISE EXCEPTION 'dm_messages.audio_url column missing after migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dm_messages' AND column_name = 'audio_duration_ms'
  ) THEN
    RAISE EXCEPTION 'dm_messages.audio_duration_ms column missing after migration';
  END IF;
END $$;
