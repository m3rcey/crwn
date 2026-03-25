-- Pre-Save Campaigns: extend smart_links with presave fields
-- Run manually in Supabase SQL Editor

-- Add presave columns to smart_links
ALTER TABLE smart_links ADD COLUMN IF NOT EXISTS link_type TEXT DEFAULT 'standard' CHECK (link_type IN ('standard', 'presave'));
ALTER TABLE smart_links ADD COLUMN IF NOT EXISTS release_date DATE;
ALTER TABLE smart_links ADD COLUMN IF NOT EXISTS artwork_url TEXT;
ALTER TABLE smart_links ADD COLUMN IF NOT EXISTS spotify_url TEXT;
ALTER TABLE smart_links ADD COLUMN IF NOT EXISTS apple_music_url TEXT;
ALTER TABLE smart_links ADD COLUMN IF NOT EXISTS youtube_url TEXT;
ALTER TABLE smart_links ADD COLUMN IF NOT EXISTS soundcloud_url TEXT;
ALTER TABLE smart_links ADD COLUMN IF NOT EXISTS tidal_url TEXT;
ALTER TABLE smart_links ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

-- Index for finding presave campaigns that need release-day notifications
CREATE INDEX IF NOT EXISTS idx_smart_links_presave_release
  ON smart_links (release_date)
  WHERE link_type = 'presave' AND is_active = true AND notified_at IS NULL;
