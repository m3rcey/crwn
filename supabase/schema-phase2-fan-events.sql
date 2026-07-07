-- schema-phase2-fan-events.sql
-- Shared fan-action event log. This is the "completion source" that Missions,
-- Squads, Clip Bounties and City Unlocks all read from to know what a fan
-- actually DID (share, clip, refer, subscribe, rsvp, join live, contribute to a
-- city, etc). Append-only. Emitted best-effort from existing code paths via
-- src/lib/fanEvents.ts (recordFanEvent) so money flows never break if it fails.
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS fan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  fan_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'share','clip','referral','subscribe','purchase','rsvp','vote',
    'live_join','comment','like','presave','city_contribution',
    'bounty_submit','mission_join','custom'
  )),
  -- where the event came from, e.g. 'referral_link','clipper_link','community','live','proof_of_demand','mission'
  source text,
  -- what the event points at, mirrors missions.target_kind vocabulary + new kinds
  ref_kind text CHECK (ref_kind IS NULL OR ref_kind IN (
    'mission','offer','tier','product','track','album','live','demand_test',
    'smart_link','campaign','city_unlock','bounty','squad'
  )),
  ref_id uuid,
  -- generic magnitude: 1 for a countable action, or cents for a revenue-bearing event
  value integer NOT NULL DEFAULT 1,
  city text,
  region text,
  country text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fan_events_artist_created ON fan_events(artist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fan_events_fan ON fan_events(fan_id);
CREATE INDEX IF NOT EXISTS idx_fan_events_artist_type ON fan_events(artist_id, event_type);
CREATE INDEX IF NOT EXISTS idx_fan_events_ref ON fan_events(ref_kind, ref_id);

ALTER TABLE fan_events ENABLE ROW LEVEL SECURITY;

-- Artist reads events for their own world
DROP POLICY IF EXISTS "Artists read own fan events" ON fan_events;
CREATE POLICY "Artists read own fan events" ON fan_events
  FOR SELECT USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- Fan reads their own event history
DROP POLICY IF EXISTS "Fans read own events" ON fan_events;
CREATE POLICY "Fans read own events" ON fan_events
  FOR SELECT USING (fan_id = auth.uid());

-- Only the service role inserts (via recordFanEvent in API routes / webhooks)
DROP POLICY IF EXISTS "Service role inserts fan events" ON fan_events;
CREATE POLICY "Service role inserts fan events" ON fan_events
  FOR INSERT WITH CHECK (true);

DO $$
BEGIN
  IF to_regclass('public.fan_events') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fan_events missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fan_events' AND policyname = 'Fans read own events'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fan_events RLS policy missing';
  END IF;
  RAISE NOTICE 'OK: fan_events table + RLS created';
END $$;

COMMIT;
