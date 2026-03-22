-- AI Artist Manager: ai_insights table
-- Stores AI-generated and rule-based insights for artists

CREATE TABLE ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'revenue', 'churn', 'vip_fan', 'booking_reminder', 'content_nudge', 'weekly_digest'
  priority TEXT NOT NULL DEFAULT 'normal', -- 'urgent', 'high', 'normal', 'low'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  action_type TEXT, -- 'link' or null
  action_url TEXT,
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- Artists can view their own insights
CREATE POLICY "Artists can view own insights" ON ai_insights
  FOR SELECT USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- Artists can update their own insights (dismiss, mark read)
CREATE POLICY "Artists can update own insights" ON ai_insights
  FOR UPDATE USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- Indexes
CREATE INDEX idx_ai_insights_artist_active ON ai_insights(artist_id, is_dismissed, created_at DESC);
CREATE INDEX idx_ai_insights_expiry ON ai_insights(expires_at) WHERE is_dismissed = false;
