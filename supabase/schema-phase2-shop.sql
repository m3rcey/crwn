-- CRWN Phase 2: Shop - Digital Products, Experiences & Bundles

-- 1. Products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  type TEXT NOT NULL CHECK (type IN ('digital', 'experience', 'bundle')),
  price INTEGER NOT NULL DEFAULT 0,
  access_level TEXT CHECK (access_level IN ('free', 'subscriber', 'public')) DEFAULT 'public',
  delivery_type TEXT CHECK (delivery_type IN ('instant', 'scheduled', 'custom')) DEFAULT 'instant',
  file_url TEXT,
  duration_minutes INTEGER,
  max_quantity INTEGER,
  quantity_sold INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bundle items table
CREATE TABLE IF NOT EXISTS bundle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bundle_id, product_id)
);

-- 3. Purchases table
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT,
  amount INTEGER NOT NULL,
  status TEXT CHECK (status IN ('pending', 'completed', 'refunded')) DEFAULT 'pending',
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE bundle_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Products policies
CREATE POLICY "Artists can create products" ON products FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM artist_profiles WHERE id = artist_id));
CREATE POLICY "Artists can update own products" ON products FOR UPDATE USING (auth.uid() IN (SELECT user_id FROM artist_profiles WHERE id = artist_id));
CREATE POLICY "Artists can delete own products" ON products FOR DELETE USING (auth.uid() IN (SELECT user_id FROM artist_profiles WHERE id = artist_id));
CREATE POLICY "Anyone can view active products" ON products FOR SELECT USING (is_active = true);

-- Bundle items policies
CREATE POLICY "Artists can manage bundle items" ON bundle_items FOR ALL USING (
  auth.uid() IN (
    SELECT ap.user_id FROM bundle_items bi
    JOIN products p ON p.id = bi.bundle_id
    JOIN artist_profiles ap ON ap.id = p.artist_id
    WHERE bi.bundle_id = bundle_items.bundle_id
  )
);
CREATE POLICY "Anyone can view bundle items" ON bundle_items FOR SELECT USING (true);

-- Purchases policies
CREATE POLICY "Users can view own purchases" ON purchases FOR SELECT USING (auth.uid() = fan_id);
CREATE POLICY "Artists can view sales" ON purchases FOR SELECT USING (
  auth.uid() IN (SELECT user_id FROM artist_profiles WHERE id = artist_id)
);

-- Indexes
CREATE INDEX idx_products_artist ON products(artist_id);
CREATE INDEX idx_products_type ON products(type);
CREATE INDEX idx_bundle_items_bundle ON bundle_items(bundle_id);
CREATE INDEX idx_purchases_fan ON purchases(fan_id);
CREATE INDEX idx_purchases_product ON purchases(product_id);
CREATE INDEX idx_purchases_artist ON purchases(artist_id);
