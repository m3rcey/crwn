-- Albums Feature Migration

-- Add columns to albums table
ALTER TABLE albums ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

-- Add album_id to tracks table
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS album_id UUID REFERENCES albums(id) ON DELETE SET NULL;

-- Create album_tracks table for ordering (if not exists)
CREATE TABLE IF NOT EXISTS album_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(album_id, track_id)
);

-- Enable RLS on album_tracks if not enabled
ALTER TABLE album_tracks ENABLE ROW LEVEL SECURITY;

-- Drop old policies and create new ones
DROP POLICY IF EXISTS "Anyone can view active albums" ON albums;
CREATE POLICY "Anyone can view published albums" ON albums FOR SELECT USING (
  is_active = true AND is_published = true
);

DROP POLICY IF EXISTS "Artists can view own albums" ON albums;
CREATE POLICY "Artists can CRUD own albums" ON albums FOR ALL USING (
  auth.uid() IN (SELECT user_id FROM artist_profiles WHERE id = artist_id)
);

-- Album tracks policies
DROP POLICY IF EXISTS "Anyone can view album tracks" ON album_tracks;
CREATE POLICY "Anyone can view album tracks" ON album_tracks FOR SELECT USING (true);

DROP POLICY IF EXISTS "Artists can manage album tracks" ON album_tracks;
CREATE POLICY "Artists can manage album tracks" ON album_tracks FOR ALL USING (
  auth.uid() IN (
    SELECT ap.user_id 
    FROM album_tracks at 
    JOIN albums a ON a.id = at.album_id 
    JOIN artist_profiles ap ON ap.id = a.artist_id 
    WHERE at.album_id = album_tracks.album_id
  )
);

-- Indexes
DROP INDEX IF EXISTS idx_album_tracks_album;
CREATE INDEX idx_album_tracks_album ON album_tracks(album_id);
DROP INDEX IF EXISTS idx_albums_slug;
CREATE INDEX idx_albums_slug ON albums(slug);
DROP INDEX IF EXISTS idx_tracks_album;
CREATE INDEX idx_tracks_album ON tracks(album_id);
