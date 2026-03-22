-- Artist Page Visit Tracking
-- Tracks unique daily visitors per artist page for revenue-per-visitor metrics

CREATE TABLE IF NOT EXISTS artist_page_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visitor_hash TEXT NOT NULL, -- hashed IP+UA, no PII stored
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(artist_id, visit_date, visitor_hash)
);

-- Index for fast per-artist daily aggregation
CREATE INDEX IF NOT EXISTS idx_artist_page_visits_artist_date ON artist_page_visits(artist_id, visit_date);

-- RLS
ALTER TABLE artist_page_visits ENABLE ROW LEVEL SECURITY;

-- Artists can read their own visit data
CREATE POLICY "Artists read own page visits" ON artist_page_visits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM artist_profiles ap
      WHERE ap.id = artist_page_visits.artist_id AND ap.user_id = auth.uid()
    )
  );

-- Service role handles inserts (from tracking API, bypasses RLS)
