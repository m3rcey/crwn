-- Audience Tab - Indexes for fan aggregation queries
-- Run manually in Supabase SQL Editor

-- Earnings: fast lookup by artist + fan, with location data
CREATE INDEX IF NOT EXISTS idx_earnings_artist_fan ON earnings(artist_id, fan_id);
CREATE INDEX IF NOT EXISTS idx_earnings_artist_fan_city ON earnings(artist_id, fan_id) WHERE fan_city IS NOT NULL;

-- Subscriptions: fast lookup by artist with status
CREATE INDEX IF NOT EXISTS idx_subscriptions_artist_status ON subscriptions(artist_id, status);

-- Play history: fast lookup by track for engagement scoring
CREATE INDEX IF NOT EXISTS idx_play_history_track_user ON play_history(track_id, user_id);

-- Referrals: fast count by artist + referrer
CREATE INDEX IF NOT EXISTS idx_referrals_artist_referrer ON referrals(artist_id, referrer_fan_id) WHERE status = 'active';

-- Community engagement: fast lookup for comment/like counts
CREATE INDEX IF NOT EXISTS idx_community_comments_post_author ON community_comments(post_id, author_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_community_post_likes_post_user ON community_post_likes(post_id, user_id);
