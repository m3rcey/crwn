-- CRWN Database Schema - Ticket 5 Update
-- Add subscription_tiers and subscriptions tables

-- Subscription tiers table (artist-created tiers)
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price INTEGER NOT NULL, -- Price in cents
  description TEXT,
  access_config JSONB DEFAULT '{}',
  stripe_price_id TEXT,
  stripe_product_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on subscription_tiers
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscription_tiers
CREATE POLICY "Subscription tiers are viewable by everyone" 
  ON subscription_tiers FOR SELECT 
  USING (true);

CREATE POLICY "Artists can manage their own tiers" 
  ON subscription_tiers FOR ALL 
  USING (
    auth.uid() IN (
      SELECT user_id FROM artist_profiles WHERE id = subscription_tiers.artist_id
    )
  );

-- Subscriptions table (fan subscriptions to artists)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES subscription_tiers(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'incomplete' CHECK (status IN ('incomplete', 'active', 'past_due', 'canceled', 'paused')),
  started_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fan_id, artist_id)
);

-- Enable RLS on subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscriptions
CREATE POLICY "Users can view own subscriptions" 
  ON subscriptions FOR SELECT 
  USING (auth.uid() = fan_id);

CREATE POLICY "Users can view subscriptions to their artist profile" 
  ON subscriptions FOR SELECT 
  USING (
    auth.uid() IN (
      SELECT user_id FROM artist_profiles WHERE id = subscriptions.artist_id
    )
  );

-- System can insert/update subscriptions (for webhooks)
CREATE POLICY "System can manage subscriptions" 
  ON subscriptions FOR ALL 
  USING (true)
  WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_subscription_tiers_artist_id ON subscription_tiers(artist_id);
CREATE INDEX idx_subscriptions_fan_id ON subscriptions(fan_id);
CREATE INDEX idx_subscriptions_artist_id ON subscriptions(artist_id);
CREATE INDEX idx_subscriptions_tier_id ON subscriptions(tier_id);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Function to check if user is subscribed to artist
CREATE OR REPLACE FUNCTION is_subscribed_to_artist(p_fan_id UUID, p_artist_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM subscriptions 
    WHERE fan_id = p_fan_id 
    AND artist_id = p_artist_id 
    AND status = 'active'
    AND (canceled_at IS NULL OR current_period_end > NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's active subscription for an artist
CREATE OR REPLACE FUNCTION get_active_subscription(p_fan_id UUID, p_artist_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  tier_id UUID,
  tier_name TEXT,
  status TEXT,
  current_period_end TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as subscription_id,
    s.tier_id,
    st.name as tier_name,
    s.status,
    s.current_period_end
  FROM subscriptions s
  JOIN subscription_tiers st ON s.tier_id = st.id
  WHERE s.fan_id = p_fan_id
  AND s.artist_id = p_artist_id
  AND s.status = 'active'
  AND (s.canceled_at IS NULL OR s.current_period_end > NOW())
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at
CREATE TRIGGER update_subscription_tiers_updated_at
  BEFORE UPDATE ON subscription_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
