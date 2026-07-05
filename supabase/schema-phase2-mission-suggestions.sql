-- schema-phase2-mission-suggestions.sql
-- Fan-proposed missions. SUGGESTIONS by default — never auto-published. Fans cannot
-- set commission or guarantee rewards; the artist sets the real reward on approval.
-- Apply manually in the Supabase SQL Editor.
BEGIN;

CREATE TABLE IF NOT EXISTS mission_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  suggested_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('share','clip','referral','subscribe','rsvp','vote','live','city','comment','presave','custom')),
  target_kind text NOT NULL DEFAULT 'none' CHECK (target_kind IN ('none','offer','tier','product','track','album','live','campaign','demand_test','smart_link')),
  target_id uuid,
  target_label text,
  goal_count integer NOT NULL DEFAULT 100,
  title text NOT NULL,
  note text,                       -- the fan's pitch/description
  suggested_reward text,           -- aspirational only; NOT binding. Artist sets the real reward on approve.
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note text,
  reviewed_at timestamptz,
  converted_mission_id uuid REFERENCES missions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mission_suggestions_artist ON mission_suggestions(artist_id, status);
CREATE INDEX IF NOT EXISTS idx_mission_suggestions_fan ON mission_suggestions(suggested_by);

ALTER TABLE mission_suggestions ENABLE ROW LEVEL SECURITY;

-- Reads: the fan who suggested it, or the artist it was suggested to.
-- Writes go through the service-role API only (rate-limit + dedupe + ownership check).
DROP POLICY IF EXISTS "Read own or artist mission_suggestions" ON mission_suggestions;
CREATE POLICY "Read own or artist mission_suggestions" ON mission_suggestions
  FOR SELECT USING (
    suggested_by = auth.uid()
    OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

DO $$
BEGIN
  IF to_regclass('public.mission_suggestions') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: mission_suggestions missing'; END IF;
  RAISE NOTICE 'OK: mission_suggestions table created';
END $$;

COMMIT;
