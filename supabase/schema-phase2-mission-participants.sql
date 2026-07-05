-- schema-phase2-mission-participants.sql
-- Fan ↔ mission link. A fan JOINS a mission (commitment); real completion tracking
-- is a later phase (no event source exists yet), so status is 'joined' by default.
-- Apply manually in the Supabase SQL Editor.
BEGIN;

CREATE TABLE IF NOT EXISTS mission_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  fan_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'joined' CHECK (status IN ('joined','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, fan_id)
);

CREATE INDEX IF NOT EXISTS idx_mission_participants_mission ON mission_participants(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_participants_fan ON mission_participants(fan_id);

ALTER TABLE mission_participants ENABLE ROW LEVEL SECURITY;

-- Reads: the fan themselves, or the artist who owns the mission. Writes via service-role API only.
DROP POLICY IF EXISTS "Read own or artist mission_participants" ON mission_participants;
CREATE POLICY "Read own or artist mission_participants" ON mission_participants
  FOR SELECT USING (
    fan_id = auth.uid()
    OR mission_id IN (
      SELECT id FROM missions
      WHERE artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
    )
  );

DO $$
BEGIN
  IF to_regclass('public.mission_participants') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: mission_participants missing'; END IF;
  RAISE NOTICE 'OK: mission_participants table created';
END $$;

COMMIT;
