-- Email Attribution & Tracking Gaps Fix
-- Fixes the Big 5: revenue attribution, sequence tracking, unsubscribe attribution, suppression visibility
-- Run manually in Supabase SQL Editor

-- ============================================================
-- 1. SEQUENCE SEND TRACKING (mirrors campaign_sends for sequences)
-- ============================================================
-- Gives sequences the same open/click tracking that campaigns have.

CREATE TABLE IF NOT EXISTS sequence_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES sequence_enrollments(id) ON DELETE CASCADE NOT NULL,
  sequence_id UUID REFERENCES sequences(id) ON DELETE CASCADE NOT NULL,
  step_number INTEGER NOT NULL,
  fan_id UUID REFERENCES profiles(id) NOT NULL,
  artist_id UUID REFERENCES artist_profiles(id) NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'opened', 'clicked', 'bounced', 'failed')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  resend_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sequence_sends_enrollment ON sequence_sends(enrollment_id, step_number);
CREATE INDEX IF NOT EXISTS idx_sequence_sends_sequence ON sequence_sends(sequence_id, status);
CREATE INDEX IF NOT EXISTS idx_sequence_sends_fan ON sequence_sends(fan_id);
CREATE INDEX IF NOT EXISTS idx_sequence_sends_resend_id ON sequence_sends(resend_message_id);

ALTER TABLE sequence_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artists can view own sequence sends"
  ON sequence_sends FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- ============================================================
-- 2. UNSUBSCRIBE EVENT LOG
-- ============================================================
-- Records which campaign/sequence triggered each unsubscribe.

CREATE TABLE IF NOT EXISTS unsubscribe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id UUID REFERENCES profiles(id) NOT NULL,
  artist_id UUID REFERENCES artist_profiles(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('campaign', 'sequence', 'global', 'spam_complaint')),
  source_id UUID, -- campaign_id or sequence_id that triggered it
  campaign_send_id UUID, -- the specific send record
  scope TEXT NOT NULL CHECK (scope IN ('artist', 'global')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unsub_events_campaign ON unsubscribe_events(source_id, source_type);
CREATE INDEX IF NOT EXISTS idx_unsub_events_artist ON unsubscribe_events(artist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unsub_events_fan ON unsubscribe_events(fan_id);

ALTER TABLE unsubscribe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artists can view own unsubscribe events"
  ON unsubscribe_events FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admin can view all unsubscribe events"
  ON unsubscribe_events FOR SELECT
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- ============================================================
-- 3. SEQUENCE CONVERSION TRACKING
-- ============================================================
-- Records whether the target action happened after sequence completion.

CREATE TABLE IF NOT EXISTS sequence_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES sequence_enrollments(id) ON DELETE CASCADE NOT NULL,
  sequence_id UUID REFERENCES sequences(id) ON DELETE CASCADE NOT NULL,
  fan_id UUID REFERENCES profiles(id) NOT NULL,
  artist_id UUID REFERENCES artist_profiles(id) NOT NULL,
  trigger_type TEXT NOT NULL, -- the sequence trigger_type
  converted BOOLEAN DEFAULT false,
  conversion_action TEXT, -- what they did: 'subscribed', 'upgraded', 'purchased', 'resubscribed'
  conversion_at TIMESTAMPTZ,
  attribution_window_end TIMESTAMPTZ NOT NULL, -- when we stop checking
  checked_at TIMESTAMPTZ, -- last time the cron checked
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seq_conversions_pending
  ON sequence_conversions(attribution_window_end, converted)
  WHERE converted = false;
CREATE INDEX IF NOT EXISTS idx_seq_conversions_sequence ON sequence_conversions(sequence_id);
CREATE INDEX IF NOT EXISTS idx_seq_conversions_artist ON sequence_conversions(artist_id);

ALTER TABLE sequence_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artists can view own sequence conversions"
  ON sequence_conversions FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admin can view all sequence conversions"
  ON sequence_conversions FOR SELECT
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- ============================================================
-- 4. SOURCE ATTRIBUTION ON EARNINGS
-- ============================================================
-- Add campaign/sequence attribution columns to earnings table.

ALTER TABLE earnings
  ADD COLUMN IF NOT EXISTS source_campaign_id UUID REFERENCES campaigns(id),
  ADD COLUMN IF NOT EXISTS source_sequence_id UUID REFERENCES sequences(id),
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

CREATE INDEX IF NOT EXISTS idx_earnings_source_campaign ON earnings(source_campaign_id)
  WHERE source_campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_earnings_source_sequence ON earnings(source_sequence_id)
  WHERE source_sequence_id IS NOT NULL;

-- ============================================================
-- 5. ADMIN VIEW FOR SUPPRESSIONS
-- ============================================================
-- Already has admin SELECT policy. Add a summary view for dashboard.

CREATE OR REPLACE VIEW email_suppression_summary AS
SELECT
  reason,
  source,
  COUNT(*) as total,
  MIN(created_at) as earliest,
  MAX(created_at) as latest,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7_days,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_30_days
FROM email_suppressions
GROUP BY reason, source;

-- Grant access to the view
GRANT SELECT ON email_suppression_summary TO authenticated;
