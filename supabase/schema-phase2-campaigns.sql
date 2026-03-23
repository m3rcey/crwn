-- Email Campaigns - Phase 2 Marketing Suite
-- Run manually in Supabase SQL Editor

-- Campaign definitions
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID REFERENCES artist_profiles(id) NOT NULL,
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  filters JSONB DEFAULT '{}',
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual send records for tracking opens/clicks
CREATE TABLE campaign_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  fan_id UUID REFERENCES profiles(id) NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'opened', 'clicked', 'bounced', 'failed')),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fan communication preferences (per-artist opt-out)
CREATE TABLE fan_communication_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id UUID REFERENCES profiles(id) NOT NULL,
  artist_id UUID REFERENCES artist_profiles(id) NOT NULL,
  email_marketing BOOLEAN DEFAULT true,
  sms_marketing BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fan_id, artist_id)
);

-- Indexes
CREATE INDEX idx_campaigns_artist_status ON campaigns(artist_id, status);
CREATE INDEX idx_campaigns_artist_created ON campaigns(artist_id, created_at DESC);
CREATE INDEX idx_campaign_sends_campaign ON campaign_sends(campaign_id, status);
CREATE INDEX idx_campaign_sends_fan ON campaign_sends(fan_id);
CREATE INDEX idx_fan_comm_prefs_lookup ON fan_communication_prefs(fan_id, artist_id);

-- RLS policies
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE fan_communication_prefs ENABLE ROW LEVEL SECURITY;

-- Campaigns: artists can manage their own
CREATE POLICY "Artists can view own campaigns"
  ON campaigns FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Artists can insert own campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Artists can update own campaigns"
  ON campaigns FOR UPDATE
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Artists can delete own draft campaigns"
  ON campaigns FOR DELETE
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()) AND status = 'draft');

-- Campaign sends: artists can view sends for their campaigns
CREATE POLICY "Artists can view own campaign sends"
  ON campaign_sends FOR SELECT
  USING (campaign_id IN (
    SELECT id FROM campaigns WHERE artist_id IN (
      SELECT id FROM artist_profiles WHERE user_id = auth.uid()
    )
  ));

-- Fan communication prefs: fans can manage their own, artists can read for their fans
CREATE POLICY "Fans can manage own prefs"
  ON fan_communication_prefs FOR ALL
  USING (fan_id = auth.uid());

CREATE POLICY "Artists can read prefs for their fans"
  ON fan_communication_prefs FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));
