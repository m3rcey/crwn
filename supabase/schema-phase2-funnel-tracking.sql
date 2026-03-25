-- Funnel Tracking: acquisition source, activation milestones, referral clicks
-- Run in Supabase SQL Editor

-- 1. Acquisition source on artist_profiles
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS acquisition_source text DEFAULT 'organic'
    CHECK (acquisition_source IN ('organic', 'recruiter', 'partner', 'founding'));

-- 2. Activation milestones JSONB on artist_profiles
-- Structure: { onboarding_completed, first_track_uploaded, tiers_created, stripe_connected, first_subscriber }
-- Each value is an ISO timestamp string
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS activation_milestones jsonb DEFAULT '{}'::jsonb;

-- 3. Referral clicks table
CREATE TABLE IF NOT EXISTS referral_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code text NOT NULL,
  visitor_hash text NOT NULL,
  clicked_at timestamptz DEFAULT now(),
  converted boolean DEFAULT false,
  converted_user_id uuid REFERENCES auth.users(id),
  source_type text DEFAULT 'recruiter'
    CHECK (source_type IN ('recruiter', 'partner')),
  UNIQUE(referral_code, visitor_hash)
);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_code ON referral_clicks(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_converted ON referral_clicks(converted);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_date ON referral_clicks(clicked_at);

ALTER TABLE referral_clicks ENABLE ROW LEVEL SECURITY;

-- Admin-only read access; service role inserts bypass RLS
CREATE POLICY "admin_read_referral_clicks" ON referral_clicks
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- 4. Backfill acquisition_source from existing data
-- Founding artists
UPDATE artist_profiles SET acquisition_source = 'founding'
  WHERE is_founding_artist = true AND acquisition_source = 'organic';

-- Partner-referred artists (recruiter is a partner)
UPDATE artist_profiles ap SET acquisition_source = 'partner'
  WHERE ap.recruited_by IS NOT NULL
  AND ap.acquisition_source = 'organic'
  AND EXISTS (
    SELECT 1 FROM recruiters r
    WHERE r.referral_code = ap.recruited_by AND r.is_partner = true
  );

-- Recruiter-referred artists (non-partner recruiters)
UPDATE artist_profiles SET acquisition_source = 'recruiter'
  WHERE recruited_by IS NOT NULL
  AND acquisition_source = 'organic';

-- 5. Backfill activation_milestones from existing data
-- onboarding_completed: if they have a phone number, they completed onboarding
UPDATE artist_profiles ap SET activation_milestones =
  jsonb_set(COALESCE(ap.activation_milestones, '{}'::jsonb), '{onboarding_completed}',
    to_jsonb(to_char(ap.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
  WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.id = ap.user_id AND p.phone IS NOT NULL)
  AND (ap.activation_milestones IS NULL OR NOT ap.activation_milestones ? 'onboarding_completed');

-- first_track_uploaded: earliest track created_at
UPDATE artist_profiles ap SET activation_milestones =
  jsonb_set(COALESCE(ap.activation_milestones, '{}'::jsonb), '{first_track_uploaded}',
    to_jsonb(to_char(earliest.min_created, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
  FROM (SELECT artist_id, MIN(created_at) as min_created FROM tracks GROUP BY artist_id) earliest
  WHERE earliest.artist_id = ap.id
  AND (ap.activation_milestones IS NULL OR NOT ap.activation_milestones ? 'first_track_uploaded');

-- tiers_created: earliest subscription_tier created_at
UPDATE artist_profiles ap SET activation_milestones =
  jsonb_set(COALESCE(ap.activation_milestones, '{}'::jsonb), '{tiers_created}',
    to_jsonb(to_char(earliest.min_created, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
  FROM (SELECT artist_id, MIN(created_at) as min_created FROM subscription_tiers GROUP BY artist_id) earliest
  WHERE earliest.artist_id = ap.id
  AND (ap.activation_milestones IS NULL OR NOT ap.activation_milestones ? 'tiers_created');

-- stripe_connected: if stripe_connect_id exists, use profile created_at as proxy
UPDATE artist_profiles ap SET activation_milestones =
  jsonb_set(COALESCE(ap.activation_milestones, '{}'::jsonb), '{stripe_connected}',
    to_jsonb(to_char(ap.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
  WHERE ap.stripe_connect_id IS NOT NULL
  AND (ap.activation_milestones IS NULL OR NOT ap.activation_milestones ? 'stripe_connected');

-- first_subscriber: earliest subscription for this artist
UPDATE artist_profiles ap SET activation_milestones =
  jsonb_set(COALESCE(ap.activation_milestones, '{}'::jsonb), '{first_subscriber}',
    to_jsonb(to_char(earliest.min_started, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
  FROM (SELECT artist_id, MIN(started_at) as min_started FROM subscriptions GROUP BY artist_id) earliest
  WHERE earliest.artist_id = ap.id
  AND (ap.activation_milestones IS NULL OR NOT ap.activation_milestones ? 'first_subscriber');
