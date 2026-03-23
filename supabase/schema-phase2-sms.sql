-- SMS Notifications - Phase 4 Marketing Suite
-- Run manually in Supabase SQL Editor

-- Artist phone numbers (Twilio provisioned)
CREATE TABLE artist_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID REFERENCES artist_profiles(id) UNIQUE NOT NULL,
  phone_number TEXT NOT NULL,
  twilio_sid TEXT,
  keyword TEXT NOT NULL UNIQUE,
  auto_reply TEXT DEFAULT 'You''re almost in! Reply YES to confirm you want texts from {artist_name}. Msg&data rates apply. Reply STOP to cancel.',
  is_active BOOLEAN DEFAULT true,
  monthly_send_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fan SMS subscriptions
CREATE TABLE sms_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID REFERENCES artist_profiles(id) NOT NULL,
  fan_id UUID REFERENCES profiles(id),
  phone_number TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'unsubscribed')),
  timezone TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'US',
  opted_in_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  source TEXT DEFAULT 'keyword' CHECK (source IN ('keyword', 'import', 'checkout', 'smart_link')),
  monthly_receive_count INTEGER DEFAULT 0,
  last_received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(artist_id, phone_number)
);

-- Consent audit log (legally required)
CREATE TABLE sms_consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  artist_id UUID REFERENCES artist_profiles(id) NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('keyword_received', 'double_optin_confirmed', 'opted_out', 'import_consent')),
  message_text TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_artist_phone_artist ON artist_phone_numbers(artist_id);
CREATE INDEX idx_artist_phone_keyword ON artist_phone_numbers(keyword);
CREATE INDEX idx_sms_subs_artist_status ON sms_subscribers(artist_id, status);
CREATE INDEX idx_sms_subs_phone ON sms_subscribers(phone_number, artist_id);
CREATE INDEX idx_sms_consent_phone ON sms_consent_log(phone_number, artist_id);
CREATE INDEX idx_sms_subs_monthly ON sms_subscribers(artist_id) WHERE status = 'active' AND monthly_receive_count < 4;

-- RLS
ALTER TABLE artist_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_consent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artists can manage own phone numbers"
  ON artist_phone_numbers FOR ALL
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Artists can view own SMS subscribers"
  ON sms_subscribers FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Artists can view own consent logs"
  ON sms_consent_log FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- Fans can view/manage their own SMS subscriptions
CREATE POLICY "Fans can view own SMS subscriptions"
  ON sms_subscribers FOR SELECT
  USING (fan_id = auth.uid());

CREATE POLICY "Fans can update own SMS subscriptions"
  ON sms_subscribers FOR UPDATE
  USING (fan_id = auth.uid());
