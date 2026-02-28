-- CRWN Database Schema - Ticket 3 Update
-- Add artist_profiles, tracks, playlists tables

-- Artist profiles table (for artists who upgrade from fan)
CREATE TABLE IF NOT EXISTS artist_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  banner_url TEXT,
  tagline TEXT,
  stripe_connect_id TEXT,
  tier_config JSONB DEFAULT '[]',
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on artist_profiles
ALTER TABLE artist_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for artist_profiles
CREATE POLICY "Artist profiles are viewable by everyone" 
  ON artist_profiles FOR SELECT 
  USING (true);

CREATE POLICY "Artists can insert their own profile" 
  ON artist_profiles FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Artists can update own profile" 
  ON artist_profiles FOR UPDATE 
  USING (auth.uid() = user_id);

-- Tracks table
CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  audio_url_128 TEXT, -- Stream quality
  audio_url_320 TEXT, -- Premium quality
  duration INTEGER, -- Duration in seconds
  access_level TEXT NOT NULL DEFAULT 'free' CHECK (access_level IN ('free', 'subscriber', 'purchase')),
  price INTEGER, -- Price in cents (for purchase-only)
  album_art_url TEXT,
  release_date DATE DEFAULT CURRENT_DATE,
  play_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on tracks
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tracks
CREATE POLICY "Tracks are viewable by everyone" 
  ON tracks FOR SELECT 
  USING (true);

CREATE POLICY "Artists can insert their own tracks" 
  ON tracks FOR INSERT 
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM artist_profiles WHERE id = tracks.artist_id
    )
  );

CREATE POLICY "Artists can update own tracks" 
  ON tracks FOR UPDATE 
  USING (
    auth.uid() IN (
      SELECT user_id FROM artist_profiles WHERE id = tracks.artist_id
    )
  );

CREATE POLICY "Artists can delete own tracks" 
  ON tracks FOR DELETE 
  USING (
    auth.uid() IN (
      SELECT user_id FROM artist_profiles WHERE id = tracks.artist_id
    )
  );

-- Playlists table
CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  track_ids UUID[] DEFAULT '{}',
  access_level TEXT NOT NULL DEFAULT 'free' CHECK (access_level IN ('free', 'subscriber', 'purchase')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on playlists
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;

-- RLS Policies for playlists
CREATE POLICY "Playlists are viewable by everyone" 
  ON playlists FOR SELECT 
  USING (true);

CREATE POLICY "Artists can manage their own playlists" 
  ON playlists FOR ALL 
  USING (
    auth.uid() IN (
      SELECT user_id FROM artist_profiles WHERE id = playlists.artist_id
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_artist_profiles_slug ON artist_profiles(slug);
CREATE INDEX IF NOT EXISTS idx_artist_profiles_user_id ON artist_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_tracks_artist_id ON tracks(artist_id);
CREATE INDEX IF NOT EXISTS idx_tracks_access_level ON tracks(access_level);
CREATE INDEX IF NOT EXISTS idx_playlists_artist_id ON playlists(artist_id);

-- Function to increment play count
CREATE OR REPLACE FUNCTION increment_play_count(track_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE tracks SET play_count = play_count + 1 WHERE id = track_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create updated_at triggers for new tables
CREATE TRIGGER update_artist_profiles_updated_at
  BEFORE UPDATE ON artist_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tracks_updated_at
  BEFORE UPDATE ON tracks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_playlists_updated_at
  BEFORE UPDATE ON playlists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
