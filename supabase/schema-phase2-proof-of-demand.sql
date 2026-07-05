-- schema-phase2-proof-of-demand.sql
-- Proof of Demand: artists validate an idea before launching. Money-free (RSVP/vote/
-- waitlist + a NON-BINDING price interest signal that is never charged).
-- Apply manually in the Supabase SQL Editor.
BEGIN;

CREATE TABLE IF NOT EXISTS proof_of_demand (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  image_url text,
  signal_type text NOT NULL DEFAULT 'rsvp' CHECK (signal_type IN ('rsvp','vote','waitlist')),
  goal_count integer NOT NULL DEFAULT 50,
  deadline timestamptz,
  unlock_message text,
  test_price integer,                       -- optional non-binding price in cents; NEVER charged
  test_promoter_interest boolean NOT NULL DEFAULT false,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','subscribers','free')),
  response_count integer NOT NULL DEFAULT 0,        -- denormalized for public progress bar
  promoter_yes_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','succeeded','archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proof_of_demand_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES proof_of_demand(id) ON DELETE CASCADE,
  fan_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  response_value text,
  would_promote boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (test_id, fan_id)
);

CREATE INDEX IF NOT EXISTS idx_pod_artist ON proof_of_demand(artist_id);
CREATE INDEX IF NOT EXISTS idx_pod_responses_test ON proof_of_demand_responses(test_id);

ALTER TABLE proof_of_demand ENABLE ROW LEVEL SECURITY;
ALTER TABLE proof_of_demand_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active proof_of_demand" ON proof_of_demand;
CREATE POLICY "Public read active proof_of_demand" ON proof_of_demand
  FOR SELECT USING (
    status = 'active'
    OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Artists manage own proof_of_demand" ON proof_of_demand;
CREATE POLICY "Artists manage own proof_of_demand" ON proof_of_demand
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- Responses inserted via the service-role API only (dedupe + recount), so no client INSERT policy.
DROP POLICY IF EXISTS "Read own or artist responses" ON proof_of_demand_responses;
CREATE POLICY "Read own or artist responses" ON proof_of_demand_responses
  FOR SELECT USING (
    fan_id = auth.uid()
    OR test_id IN (
      SELECT id FROM proof_of_demand
      WHERE artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
    )
  );

DO $$
BEGIN
  IF to_regclass('public.proof_of_demand') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: proof_of_demand missing'; END IF;
  IF to_regclass('public.proof_of_demand_responses') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: proof_of_demand_responses missing'; END IF;
  RAISE NOTICE 'OK: proof of demand tables created';
END $$;

COMMIT;
