-- Optional release metadata on tracks (DistroKid-style "airtight catalog" fields).
-- All optional / nullable; defaults keep every existing track unchanged.

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS genre TEXT,
  ADD COLUMN IF NOT EXISTS record_label TEXT,
  ADD COLUMN IF NOT EXISTS isrc TEXT,
  ADD COLUMN IF NOT EXISTS explicit BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT false;
