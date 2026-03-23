-- Saved Audience Segments
-- Stores reusable filter combinations that artists can name and apply to campaigns

CREATE TABLE IF NOT EXISTS saved_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  -- filters shape: { tier?: string, location?: string, engagement?: string, lifecycle?: string, minSpend?: number }
  fan_count integer DEFAULT 0, -- cached count, updated on save/refresh
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_segments_artist
  ON saved_segments(artist_id);

ALTER TABLE saved_segments ENABLE ROW LEVEL SECURITY;

-- Artists can manage their own segments
CREATE POLICY "artists_manage_own_segments" ON saved_segments
  FOR ALL USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );
