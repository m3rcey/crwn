-- Add thumbnail_url column to community_posts for video thumbnail selection
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
