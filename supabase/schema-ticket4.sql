-- CRWN Database Schema - Ticket 4 Update
-- Add play_history and favorites tables

-- Play history table
CREATE TABLE IF NOT EXISTS play_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  played_at TIMESTAMPTZ DEFAULT NOW(),
  duration_played INTEGER, -- seconds played
  completed BOOLEAN DEFAULT false
);

-- Enable RLS on play_history
ALTER TABLE play_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for play_history
CREATE POLICY "Users can view own play history" 
  ON play_history FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own play history" 
  ON play_history FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Favorites/liked tracks table
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, track_id)
);

-- Enable RLS on favorites
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for favorites
CREATE POLICY "Users can view own favorites" 
  ON favorites FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own favorites" 
  ON favorites FOR ALL 
  USING (auth.uid() = user_id);

-- Queue table (for persistent queue across sessions)
CREATE TABLE IF NOT EXISTS user_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  track_ids UUID[] DEFAULT '{}',
  current_index INTEGER DEFAULT 0,
  shuffle_enabled BOOLEAN DEFAULT false,
  repeat_mode TEXT DEFAULT 'off' CHECK (repeat_mode IN ('off', 'all', 'one')),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS on user_queues
ALTER TABLE user_queues ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_queues
CREATE POLICY "Users can manage own queue" 
  ON user_queues FOR ALL 
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_play_history_user_id ON play_history(user_id);
CREATE INDEX idx_play_history_track_id ON play_history(track_id);
CREATE INDEX idx_play_history_played_at ON play_history(played_at DESC);
CREATE INDEX idx_favorites_user_id ON favorites(user_id);
CREATE INDEX idx_favorites_track_id ON favorites(track_id);

-- Function to toggle favorite (insert if not exists, delete if exists)
CREATE OR REPLACE FUNCTION toggle_favorite(p_user_id UUID, p_track_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM favorites WHERE user_id = p_user_id AND track_id = p_track_id
  ) INTO v_exists;
  
  IF v_exists THEN
    DELETE FROM favorites WHERE user_id = p_user_id AND track_id = p_track_id;
    RETURN false; -- Now unfavorited
  ELSE
    INSERT INTO favorites (user_id, track_id) VALUES (p_user_id, p_track_id);
    RETURN true; -- Now favorited
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
