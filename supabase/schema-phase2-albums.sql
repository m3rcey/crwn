-- CRWN Phase 2: Albums and Playlists Schema

-- 1. Albums table
CREATE TABLE IF NOT EXISTS albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  album_art_url TEXT,
  release_date DATE DEFAULT CURRENT_DATE,
  access_level TEXT CHECK (access_level IN ('free', 'subscriber')) DEFAULT 'free',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Album tracks junction table
CREATE TABLE IF NOT EXISTS album_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  track_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(album_id, track_id)
);

-- 3. Playlists table
CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Playlist tracks junction table
CREATE TABLE IF NOT EXISTS playlist_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(playlist_id, track_id)
);

-- Enable RLS
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_tracks ENABLE ROW LEVEL SECURITY;

-- Albums policies
CREATE POLICY "Artists can create albums" ON albums FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM artist_profiles WHERE id = artist_id));
CREATE POLICY "Artists can update own albums" ON albums FOR UPDATE USING (auth.uid() IN (SELECT user_id FROM artist_profiles WHERE id = artist_id));
CREATE POLICY "Artists can delete own albums" ON albums FOR DELETE USING (auth.uid() IN (SELECT user_id FROM artist_profiles WHERE id = artist_id));
CREATE POLICY "Anyone can view active albums" ON albums FOR SELECT USING (is_active = true);

-- Album tracks policies
CREATE POLICY "Artists can manage album tracks" ON album_tracks FOR ALL USING (
  auth.uid() IN (
    SELECT ap.user_id 
    FROM album_tracks at 
    JOIN albums a ON a.id = at.album_id 
    JOIN artist_profiles ap ON ap.id = a.artist_id 
    WHERE at.album_id = album_tracks.album_id
  )
);
CREATE POLICY "Anyone can view album tracks" ON album_tracks FOR SELECT USING (true);

-- Playlists policies
CREATE POLICY "Users can create playlists" ON playlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own playlists" ON playlists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own playlists" ON playlists FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can view own playlists" ON playlists FOR SELECT USING (auth.uid() = user_id OR is_public = true);

-- Playlist tracks policies
CREATE POLICY "Users can manage own playlist tracks" ON playlist_tracks FOR ALL USING (
  auth.uid() IN (
    SELECT p.user_id 
    FROM playlist_tracks pt 
    JOIN playlists p ON p.id = pt.playlist_id 
    WHERE pt.playlist_id = playlist_tracks.playlist_id
  )
);
CREATE POLICY "Anyone can view playlist tracks" ON playlist_tracks FOR SELECT USING (true);

-- Indexes for performance
CREATE INDEX idx_albums_artist ON albums(artist_id);
CREATE INDEX idx_album_tracks_album ON album_tracks(album_id);
CREATE INDEX idx_playlists_user ON playlists(user_id);
CREATE INDEX idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
