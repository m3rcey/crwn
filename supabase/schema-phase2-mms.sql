-- MMS Support: add media_url to campaigns and campaign_sends
-- Run in Supabase SQL Editor

-- Track media URL on campaign records (for MMS campaigns)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS media_url TEXT;

-- Track media URL per individual send (for future per-recipient media)
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS media_url TEXT;

-- Index for quick MMS campaign lookups
CREATE INDEX IF NOT EXISTS idx_campaigns_media ON campaigns (artist_id) WHERE media_url IS NOT NULL;
