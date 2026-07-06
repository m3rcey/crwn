-- schema-phase2-vod-markers.sql
-- Live Clip Controls (markers-only): an artist marks noteworthy MOMENTS on a VOD.
-- No video cutting — markers guide clippers, who clip off-platform via the existing
-- clipper rail. Apply manually in the Supabase SQL Editor.
BEGIN;

CREATE TABLE IF NOT EXISTS vod_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_seconds integer NOT NULL DEFAULT 0,
  end_seconds integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vod_markers_session ON vod_markers(session_id);
CREATE INDEX IF NOT EXISTS idx_vod_markers_artist ON vod_markers(artist_id);

ALTER TABLE vod_markers ENABLE ROW LEVEL SECURITY;

-- Artist manages markers for sessions they own. (Markers are artist-facing; clippers
-- see the resulting clip MISSION, not the raw markers.)
DROP POLICY IF EXISTS "Artists manage own vod_markers" ON vod_markers;
CREATE POLICY "Artists manage own vod_markers" ON vod_markers
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

DO $$
BEGIN
  IF to_regclass('public.vod_markers') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: vod_markers missing'; END IF;
  RAISE NOTICE 'OK: vod_markers table created';
END $$;

COMMIT;
