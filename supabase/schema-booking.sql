-- Booking/Calendly schema for CRWN

-- Add booking columns to artist_profiles
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS calendly_url TEXT DEFAULT NULL;
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS booking_enabled BOOLEAN DEFAULT false;
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS booking_is_free BOOLEAN DEFAULT false;
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS booking_allowed_tier_ids JSONB DEFAULT '[]'::jsonb;

-- Booking sessions table for shop 1-on-1 products
CREATE TABLE IF NOT EXISTS booking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  price INTEGER NOT NULL DEFAULT 0,
  calendly_event_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE booking_sessions ENABLE ROW LEVEL SECURITY;

-- Public read for active sessions
CREATE POLICY "Anyone can view active booking sessions"
  ON booking_sessions FOR SELECT
  USING (is_active = true);

-- Artist can manage their own sessions
CREATE POLICY "Artists can manage their own booking sessions"
  ON booking_sessions FOR ALL
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_booking_sessions_artist ON booking_sessions(artist_id, is_active);

-- Booking purchases table
CREATE TABLE IF NOT EXISTS booking_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_session_id UUID NOT NULL REFERENCES booking_sessions(id),
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id),
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  amount INTEGER NOT NULL,
  platform_fee INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE booking_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own purchases"
  ON booking_purchases FOR SELECT
  USING (buyer_id = auth.uid());

CREATE POLICY "Artists can view purchases for their sessions"
  ON booking_purchases FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_booking_purchases_buyer ON booking_purchases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_booking_purchases_artist ON booking_purchases(artist_id);
