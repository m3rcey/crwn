-- Abandoned Cart Tracking + Sequence Trigger
-- Adds abandoned_cart trigger type and tracks expired checkout sessions

-- Expand the trigger_type check constraint to include abandoned_cart
ALTER TABLE sequences DROP CONSTRAINT IF EXISTS sequences_trigger_type_check;
ALTER TABLE sequences ADD CONSTRAINT sequences_trigger_type_check
  CHECK (trigger_type IN (
    'new_subscription',
    'new_purchase',
    'tier_upgrade',
    'post_purchase_upsell',
    'win_back',
    'inactive_subscriber',
    'abandoned_cart'
  ));

-- Track abandoned checkouts so we don't re-enroll the same fan
CREATE TABLE IF NOT EXISTS abandoned_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id uuid NOT NULL REFERENCES auth.users(id),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id),
  checkout_type text NOT NULL CHECK (checkout_type IN ('subscription', 'product', 'booking')),
  product_id uuid REFERENCES products(id),
  tier_id uuid REFERENCES subscription_tiers(id),
  stripe_session_id text,
  recovered boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_checkouts_fan_artist
  ON abandoned_checkouts(fan_id, artist_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_checkouts_created
  ON abandoned_checkouts(created_at);

-- RLS
ALTER TABLE abandoned_checkouts ENABLE ROW LEVEL SECURITY;

-- Artists can view their own abandoned checkouts
CREATE POLICY "artists_view_own_abandoned" ON abandoned_checkouts
  FOR SELECT USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- Service role can insert (webhook)
CREATE POLICY "service_insert_abandoned" ON abandoned_checkouts
  FOR INSERT WITH CHECK (true);

-- Service role can update (mark recovered)
CREATE POLICY "service_update_abandoned" ON abandoned_checkouts
  FOR UPDATE USING (true);
