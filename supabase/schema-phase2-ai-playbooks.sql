-- schema-phase2-ai-playbooks.sql
-- AI Playbooks: rule-based (NO LLM) multi-step campaign templates. The catalog
-- lives in code (src/lib/playbooks.ts), like the existing /action-plan rules — no
-- ai_playbooks table needed. This migration persists RUNS and their STEPS.
-- Every step starts 'pending' and requires explicit artist approval; executing an
-- approved step creates a real row via the shipped systems (squads/bounties/city
-- unlocks/missions). Message/post steps are drafts the artist sends elsewhere —
-- nothing is ever auto-published/sent.
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS artist_playbook_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  playbook_id text NOT NULL,          -- catalog id from src/lib/playbooks.ts
  playbook_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused','completed','cancelled')),
  goal_metadata jsonb NOT NULL DEFAULT '{}',
  current_step integer NOT NULL DEFAULT 0,
  created_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playbook_runs_artist ON artist_playbook_runs(artist_id);

CREATE TABLE IF NOT EXISTS artist_playbook_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES artist_playbook_runs(id) ON DELETE CASCADE,
  step_index integer NOT NULL DEFAULT 0,
  step_type text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','executed','skipped','failed')),
  generated_payload jsonb NOT NULL DEFAULT '{}',
  executed_resource_type text,
  executed_resource_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playbook_steps_run ON artist_playbook_steps(run_id);

ALTER TABLE artist_playbook_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_playbook_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Artists manage own playbook runs" ON artist_playbook_runs;
CREATE POLICY "Artists manage own playbook runs" ON artist_playbook_runs
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Artists manage own playbook steps" ON artist_playbook_steps;
CREATE POLICY "Artists manage own playbook steps" ON artist_playbook_steps
  FOR ALL USING (
    run_id IN (SELECT id FROM artist_playbook_runs WHERE artist_id IN
      (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    run_id IN (SELECT id FROM artist_playbook_runs WHERE artist_id IN
      (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  );

DO $$
BEGIN
  IF to_regclass('public.artist_playbook_runs') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: artist_playbook_runs missing'; END IF;
  IF to_regclass('public.artist_playbook_steps') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: artist_playbook_steps missing'; END IF;
  RAISE NOTICE 'OK: ai playbooks tables created';
END $$;

COMMIT;
