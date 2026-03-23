-- Lead Scoring for fan_contacts
-- Adds lead_score column and tracking for score calculation

-- Add lead score columns to fan_contacts
ALTER TABLE fan_contacts
  ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_score_updated_at TIMESTAMPTZ;

-- Index for sorting by lead score
CREATE INDEX IF NOT EXISTS idx_fan_contacts_lead_score
  ON fan_contacts (artist_id, lead_score DESC);
