-- Add artist playlist columns to playlists table
-- Run this migration to enable artist playlists feature

-- Add artist playlist columns if they don't exist
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES artist_profiles(id) ON DELETE CASCADE;
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS is_artist_playlist BOOLEAN DEFAULT false;
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT true;
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS allowed_tier_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS price INTEGER DEFAULT NULL;
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Index for fetching artist playlists
CREATE INDEX IF NOT EXISTS idx_playlists_artist ON playlists(artist_id) WHERE is_artist_playlist = true;

-- Update existing RLS policies for artist playlists
-- First, drop existing policies if they exist (run manually if needed)
-- Then create new policies

-- Artist can manage their own playlists (both fan and artist)
DROP POLICY IF EXISTS "Artists can manage their own playlists" ON playlists;
CREATE POLICY "Artists can manage their own playlists" 
  ON playlists FOR ALL 
  USING (auth.uid() = user_id OR auth.uid() IN (SELECT user_id FROM artist_profiles WHERE id = artist_id));

-- Public can read active artist playlists
DROP POLICY IF EXISTS "Anyone can view artist playlists" ON playlists;
CREATE POLICY "Anyone can view artist playlists" 
  ON playlists FOR SELECT 
  USING (is_active = true AND is_artist_playlist = true);

-- Playlist tracks junction table (if not already existing)
CREATE TABLE IF NOT EXISTS playlist_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(playlist_id, track_id)
);

-- Enable RLS on playlist_tracks
ALTER TABLE playlist_tracks ENABLE ROW LEVEL SECURITY;

-- Playlist tracks policies
DROP POLICY IF EXISTS "Anyone can view playlist tracks" ON playlist_tracks;
CREATE POLICY "Anyone can view playlist tracks" ON playlist_tracks FOR SELECT USING (true);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
