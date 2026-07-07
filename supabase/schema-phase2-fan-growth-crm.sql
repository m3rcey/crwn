-- schema-phase2-fan-growth-crm.sql
-- Fan Growth CRM: the artist-facing layer that turns the audience into a
-- workable pipeline. The fan LIST + scores are already computed live by
-- /api/audience (engagement, lifecycle, churn_risk, upgrade_likelihood) and
-- segments reuse saved_segments. This migration only adds the two things that
-- were genuinely missing: per-fan NOTES and an artist->fan ACTION log.
-- (No fan_growth_scores snapshot table in v1 — scores are computed live; add a
-- snapshot/materialized layer only when fan counts make live recompute slow.)
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS fan_growth_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  fan_id uuid NOT NULL, -- profiles.id OR fan_contacts.id (leads) — not FK'd so leads work too
  note text NOT NULL,
  created_by uuid, -- artist user id
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fan_growth_notes_lookup ON fan_growth_notes(artist_id, fan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fan_growth_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  fan_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'message','award_badge','invite_squad','assign_mission','reward',
    'commission_boost','thank','tag','custom'
  )),
  status text NOT NULL DEFAULT 'done' CHECK (status IN ('pending','done','failed')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','playbook')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fan_growth_actions_lookup ON fan_growth_actions(artist_id, fan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fan_growth_actions_type ON fan_growth_actions(artist_id, action_type);

ALTER TABLE fan_growth_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fan_growth_actions ENABLE ROW LEVEL SECURITY;

-- Only the owning artist may read/write notes & actions in their world.
-- (Writes go through the service role in /api/crm, which also does the ownership
-- check; these policies protect against any direct client access.)
DROP POLICY IF EXISTS "Artists manage own fan notes" ON fan_growth_notes;
CREATE POLICY "Artists manage own fan notes" ON fan_growth_notes
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Artists manage own fan actions" ON fan_growth_actions;
CREATE POLICY "Artists manage own fan actions" ON fan_growth_actions
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

DO $$
BEGIN
  IF to_regclass('public.fan_growth_notes') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fan_growth_notes missing';
  END IF;
  IF to_regclass('public.fan_growth_actions') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fan_growth_actions missing';
  END IF;
  RAISE NOTICE 'OK: fan_growth_notes + fan_growth_actions created';
END $$;

COMMIT;
