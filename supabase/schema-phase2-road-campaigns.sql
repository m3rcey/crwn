-- schema-phase2-road-campaigns.sql
-- "Road To ___" campaigns: the larger goal/rollout that missions, bounties, city
-- unlocks and squads hang off. This is the CURRENT-MISSION hero on the Movement
-- tab (e.g. "Road to First Music Video", "Road to 100 Supporters").
--
-- Named road_campaigns (NOT campaigns — that table is the email-blast system).
-- Multi-goal by design: goal_type picks what the progress bar tracks.
--   money      -> progress = revenue since started_at (real $); CTA opens checkout
--   others     -> progress = fan contributions of the matching type (tap-to-support),
--                 same denormalized recompute pattern as city_unlocks.
-- Reuses: subscription_tiers/products (linked checkout target), earnings (money
-- progress), fan_events, notifications.
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS road_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  cover_image_url text,
  goal_type text NOT NULL DEFAULT 'supporters' CHECK (goal_type IN (
    'money','supporters','rsvps','referrals','shares','votes','custom'
  )),
  goal_value integer NOT NULL DEFAULT 100,   -- cents when goal_type = money
  current_value integer NOT NULL DEFAULT 0,   -- denormalized (recomputed service-side)
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','reached','archived')),
  deadline timestamptz,
  linked_tier_id uuid,                        -- money goal: tier to checkout
  linked_product_id uuid,                     -- money goal: product to checkout
  cta_label text,                             -- e.g. "Support", "RSVP", "Vote"
  reached_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_road_campaigns_artist ON road_campaigns(artist_id);
CREATE INDEX IF NOT EXISTS idx_road_campaigns_active ON road_campaigns(artist_id, status);

CREATE TABLE IF NOT EXISTS road_campaign_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES road_campaigns(id) ON DELETE CASCADE,
  fan_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contribution_type text NOT NULL DEFAULT 'support' CHECK (contribution_type IN ('support','rsvp','referral','share','vote','custom')),
  value integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, fan_id, contribution_type)
);

CREATE INDEX IF NOT EXISTS idx_road_contrib_campaign ON road_campaign_contributions(campaign_id);

ALTER TABLE road_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE road_campaign_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Artists manage own campaigns" ON road_campaigns;
CREATE POLICY "Artists manage own campaigns" ON road_campaigns
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Read active campaigns" ON road_campaigns;
CREATE POLICY "Read active campaigns" ON road_campaigns
  FOR SELECT USING (
    status IN ('active','reached')
    OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Fans read own campaign contributions" ON road_campaign_contributions;
CREATE POLICY "Fans read own campaign contributions" ON road_campaign_contributions
  FOR SELECT USING (fan_id = auth.uid());

DROP POLICY IF EXISTS "Artists read own campaign contributions" ON road_campaign_contributions;
CREATE POLICY "Artists read own campaign contributions" ON road_campaign_contributions
  FOR SELECT USING (
    campaign_id IN (SELECT id FROM road_campaigns WHERE artist_id IN
      (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  );

DO $$
BEGIN
  IF to_regclass('public.road_campaigns') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: road_campaigns missing'; END IF;
  IF to_regclass('public.road_campaign_contributions') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: road_campaign_contributions missing'; END IF;
  RAISE NOTICE 'OK: road campaigns tables created';
END $$;

COMMIT;
