-- schema-phase2-missions.sql
-- Artist-created fan missions (a trackable action toward a goal). Money-light:
-- earning missions reference the artist-wide Share/Clip promotion, not per-mission rates.
-- Apply manually in the Supabase SQL Editor.
BEGIN;

CREATE TABLE IF NOT EXISTS missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('share','clip','referral','subscribe','rsvp','vote','live','city','comment','presave','custom')),
  target_kind text NOT NULL DEFAULT 'none' CHECK (target_kind IN ('none','offer','tier','product','track','album','live','campaign','demand_test','smart_link')),
  target_id uuid,
  target_label text,
  goal_count integer NOT NULL DEFAULT 100,
  manual_count integer NOT NULL DEFAULT 0,
  reward_type text NOT NULL DEFAULT 'points' CHECK (reward_type IN ('points','badge','credits','access','commission','custom')),
  reward_detail text,
  deadline timestamptz,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','subscribers','free')),
  title text NOT NULL,
  description text,
  cta text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missions_artist ON missions(artist_id);

ALTER TABLE missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active missions" ON missions;
CREATE POLICY "Public read active missions" ON missions
  FOR SELECT USING (
    status = 'active'
    OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Artists manage own missions" ON missions;
CREATE POLICY "Artists manage own missions" ON missions
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

DO $$
BEGIN
  IF to_regclass('public.missions') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: missions missing'; END IF;
  RAISE NOTICE 'OK: missions table created';
END $$;

COMMIT;
