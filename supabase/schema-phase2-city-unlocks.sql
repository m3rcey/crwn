-- schema-phase2-city-unlocks.sql
-- City Unlocks: location-based fan goals that unlock a local experience/drop/live
-- when enough local demand is proven. Reuses: proof_of_demand (linked test),
-- artist_squads (city_captains squad — NO separate captains table, per the reuse
-- mitigation), missions (type 'city' already exists), fan_events, notifications,
-- fan_badges (city_captain / city badges).
--
-- PRIVACY: only aggregate city progress is exposed. Fans SELF-SELECT their city on
-- contribution; individual fan locations are never shown. current_value is
-- denormalized (like proof_of_demand.response_count) and recomputed service-side.
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS city_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  unlock_type text NOT NULL DEFAULT 'event' CHECK (unlock_type IN ('event','drop','live','offer','content','custom')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','unlocked','expired','archived')),
  target_city text NOT NULL,
  target_region text,
  target_country text,
  goal_type text NOT NULL DEFAULT 'supporters' CHECK (goal_type IN ('supporters','rsvps','revenue','referrals','shares','votes','custom')),
  goal_value integer NOT NULL DEFAULT 50,
  current_value integer NOT NULL DEFAULT 0,   -- denormalized progress
  deadline timestamptz,
  unlock_message text,                        -- revealed when unlocked
  linked_proof_test_id uuid REFERENCES proof_of_demand(id) ON DELETE SET NULL,
  linked_squad_id uuid REFERENCES artist_squads(id) ON DELETE SET NULL, -- the city_captains squad
  unlock_metadata jsonb NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_city_unlocks_artist ON city_unlocks(artist_id);

CREATE TABLE IF NOT EXISTS city_unlock_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_unlock_id uuid NOT NULL REFERENCES city_unlocks(id) ON DELETE CASCADE,
  fan_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contribution_type text NOT NULL DEFAULT 'support' CHECK (contribution_type IN ('support','rsvp','referral','share','vote','revenue','custom')),
  value integer NOT NULL DEFAULT 1,   -- 1 for a countable action, cents for revenue
  city text,                          -- fan's self-selected city (privacy: aggregate only)
  region text,
  country text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- one "support"/"rsvp"/"vote" per fan per unlock; shares/referrals can repeat
  UNIQUE (city_unlock_id, fan_id, contribution_type)
);

CREATE INDEX IF NOT EXISTS idx_city_contrib_unlock ON city_unlock_contributions(city_unlock_id);

ALTER TABLE city_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE city_unlock_contributions ENABLE ROW LEVEL SECURITY;

-- Unlocks: owner full control; active/unlocked are publicly readable (shareable city link).
DROP POLICY IF EXISTS "Artists manage own city unlocks" ON city_unlocks;
CREATE POLICY "Artists manage own city unlocks" ON city_unlocks
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Read active city unlocks" ON city_unlocks;
CREATE POLICY "Read active city unlocks" ON city_unlocks
  FOR SELECT USING (
    status IN ('active','unlocked')
    OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- Contributions: writes via service role (dedupe + recount). A fan reads their own;
-- the owning artist reads all for their unlocks. NO public read of individual rows
-- (privacy) — aggregate progress comes from city_unlocks.current_value.
DROP POLICY IF EXISTS "Fans read own contributions" ON city_unlock_contributions;
CREATE POLICY "Fans read own contributions" ON city_unlock_contributions
  FOR SELECT USING (fan_id = auth.uid());

DROP POLICY IF EXISTS "Artists read own unlock contributions" ON city_unlock_contributions;
CREATE POLICY "Artists read own unlock contributions" ON city_unlock_contributions
  FOR SELECT USING (
    city_unlock_id IN (SELECT id FROM city_unlocks WHERE artist_id IN
      (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  );

DO $$
BEGIN
  IF to_regclass('public.city_unlocks') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: city_unlocks missing'; END IF;
  IF to_regclass('public.city_unlock_contributions') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: city_unlock_contributions missing'; END IF;
  RAISE NOTICE 'OK: city unlocks tables created';
END $$;

COMMIT;
