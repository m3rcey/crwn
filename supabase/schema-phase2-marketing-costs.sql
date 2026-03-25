-- ============================================================================
-- ARTIST MARKETING COSTS: Unit Economics cost tracking
-- Run in Supabase SQL Editor (not auto-applied)
-- ============================================================================

CREATE TABLE IF NOT EXISTS artist_marketing_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'instagram_ads', 'facebook_ads', 'tiktok_ads', 'google_ads',
    'playlist_pitching', 'pr_campaign', 'music_video',
    'influencer', 'merch_promo', 'other'
  )),
  custom_label TEXT,               -- freeform name for 'other' category
  amount INTEGER NOT NULL,         -- cents, consistent with all other prices
  spend_date DATE NOT NULL,        -- the date the spend applies to
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artist_mktg_costs_artist ON artist_marketing_costs(artist_id);
CREATE INDEX IF NOT EXISTS idx_artist_mktg_costs_date ON artist_marketing_costs(spend_date);
CREATE INDEX IF NOT EXISTS idx_artist_mktg_costs_category ON artist_marketing_costs(category);

ALTER TABLE artist_marketing_costs ENABLE ROW LEVEL SECURITY;

-- Artists can manage their own costs
DO $$ BEGIN
  CREATE POLICY "Artists can insert own marketing costs"
    ON artist_marketing_costs FOR INSERT
    WITH CHECK (
      artist_id IN (
        SELECT id FROM artist_profiles WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Artists can view own marketing costs"
    ON artist_marketing_costs FOR SELECT
    USING (
      artist_id IN (
        SELECT id FROM artist_profiles WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Artists can update own marketing costs"
    ON artist_marketing_costs FOR UPDATE
    USING (
      artist_id IN (
        SELECT id FROM artist_profiles WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Artists can delete own marketing costs"
    ON artist_marketing_costs FOR DELETE
    USING (
      artist_id IN (
        SELECT id FROM artist_profiles WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admin full access
DO $$ BEGIN
  CREATE POLICY "Admin full access marketing costs"
    ON artist_marketing_costs FOR ALL
    USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
