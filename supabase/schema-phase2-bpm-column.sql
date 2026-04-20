-- ============================================================
-- Add BPM column to tracks for Glide intelligent transitions
--
-- Purpose: Store detected BPM per track. Populated on upload via
--          web-audio-beat-detector. Used by the Glide crossfade
--          system for future tempo-aware blending.
--
-- RUN IN:  Supabase SQL Editor
-- SAFE TO RE-RUN: Yes — IF NOT EXISTS.
-- ============================================================

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS bpm REAL;

-- Optional: index if we ever filter/sort by BPM.
-- CREATE INDEX IF NOT EXISTS tracks_bpm_idx ON tracks (bpm);
