-- Discount Codes
-- Artists can create promo codes for subscriptions and products

CREATE TABLE IF NOT EXISTS discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value INTEGER NOT NULL, -- percent (0-100) or fixed amount in cents
  applies_to TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'subscription', 'product')),
  tier_id UUID REFERENCES subscription_tiers(id), -- null = all tiers
  product_id UUID REFERENCES products(id), -- null = all products
  max_uses INTEGER, -- null = unlimited
  uses_count INTEGER NOT NULL DEFAULT 0,
  max_uses_per_fan INTEGER DEFAULT 1,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(artist_id, code)
);

-- Track which fans have used which codes
CREATE TABLE IF NOT EXISTS discount_code_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_code_id UUID NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
  fan_id UUID NOT NULL REFERENCES profiles(id),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id),
  stripe_checkout_session_id TEXT,
  amount_saved INTEGER NOT NULL DEFAULT 0, -- cents
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discount_codes_artist ON discount_codes (artist_id, is_active);
CREATE INDEX IF NOT EXISTS idx_discount_codes_lookup ON discount_codes (artist_id, code) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_discount_code_uses_fan ON discount_code_uses (discount_code_id, fan_id);

-- RLS
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_code_uses ENABLE ROW LEVEL SECURITY;

-- Artists can manage their own codes
CREATE POLICY "Artists manage own discount codes"
  ON discount_codes FOR ALL
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- Anyone can read active codes (for checkout validation)
CREATE POLICY "Anyone can read active discount codes"
  ON discount_codes FOR SELECT
  USING (is_active = true);

-- Artists can view uses of their codes
CREATE POLICY "Artists view own discount code uses"
  ON discount_code_uses FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- System inserts uses (via service role in webhooks)
CREATE POLICY "Service role inserts discount code uses"
  ON discount_code_uses FOR INSERT
  WITH CHECK (true);
