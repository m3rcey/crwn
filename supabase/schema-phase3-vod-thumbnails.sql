-- Phase 3 — VOD cover thumbnails
-- Adds an optional cover image to recorded live sessions. The image is either a
-- custom upload chosen by the artist, or an auto-grabbed frame from a prerecorded
-- upload (captured client-side at upload time). Both are stored in R2; the row
-- keeps the object key (for future signed access) and the public URL (for the card).
-- Null means the recording card falls back to a placeholder.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run (idempotent).

ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS vod_thumbnail_key TEXT,
  ADD COLUMN IF NOT EXISTS vod_thumbnail_url TEXT;

-- Self-verify: fail loudly if the columns did not land, so a partial apply
-- errors in the editor instead of silently half-landing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_sessions' AND column_name = 'vod_thumbnail_key'
  ) THEN
    RAISE EXCEPTION 'Migration failed: live_sessions.vod_thumbnail_key missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_sessions' AND column_name = 'vod_thumbnail_url'
  ) THEN
    RAISE EXCEPTION 'Migration failed: live_sessions.vod_thumbnail_url missing';
  END IF;
END $$;
