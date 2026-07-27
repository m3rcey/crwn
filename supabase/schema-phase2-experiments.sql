-- ===========================================================================
-- Holistic experience experimentation foundation.
--
-- Two tables. Neither can change platform behavior: experiment BEHAVIOR is prebuilt code
-- (src/lib/experiments/registry.ts), and these rows only carry operational state + measured events.
--
--   1. experiments        - operational record of a prebuilt config (status/allocation/conclusion).
--                           Admin-managed only.
--   2. experiment_events  - the append-only measurement sink for a running experiment (assignment,
--                           exposure, and journey events tagged with experience + variant). Written
--                           ONLY by the service-role track route; readable ONLY by admins.
--
-- Application order: apply after schema-phase2-funnel-events.sql / opportunity-ledger.sql exist
-- (this file does not depend on them, but the analytics that read it join their aggregates).
-- Rollback: DROP TABLE experiment_events, experiments; (no data migration to reverse).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. experiments (operational state for a prebuilt, code-defined config)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- references EXPERIMENT_CONFIGS[].key in code; behavior is never stored here.
  key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','running','paused','completed','archived')),
  -- variantKey -> whole-number percent. Server re-derives assignment; this is the allocation only.
  allocation jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  start_at timestamptz,
  end_at timestamptz,
  config_version text NOT NULL DEFAULT '1',
  conclusion text,
  winner_variant text,
  notes text,
  stop_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. experiment_events (measurement sink; service-role write, admin read)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS experiment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aid text NOT NULL,                                  -- durable, non-PII anonymous id
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  artist_id uuid REFERENCES artist_profiles(id) ON DELETE SET NULL,
  experiment_key text NOT NULL,
  experience_key text NOT NULL,
  variant_key text,                                   -- NULL = holdout
  config_version text NOT NULL DEFAULT '1',
  event_name text NOT NULL,                           -- taxonomy event, or 'assigned'/'exposed'
  tool_key text,
  opportunity_key text,
  source_video text,
  campaign text,
  keyword text,
  lead_magnet text,
  -- ONLY set for actual-basis outcome events (e.g. first_dollar), refund-netted upstream. Never a
  -- projection. NULL for every non-financial event.
  value_cents bigint,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- Deterministic key so a retried/duplicate exposure collapses (ON CONFLICT DO NOTHING).
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exp_events_experiment ON experiment_events (experiment_key, event_name);
CREATE INDEX IF NOT EXISTS idx_exp_events_variant ON experiment_events (experience_key, variant_key);
CREATE INDEX IF NOT EXISTS idx_exp_events_aid ON experiment_events (aid);
CREATE INDEX IF NOT EXISTS idx_exp_events_occurred ON experiment_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_exp_events_user ON experiment_events (user_id);

-- ---------------------------------------------------------------------------
-- RLS: admin-only. No public or authenticated-user access. Service-role (used by the track route
-- and the admin analytics routes) bypasses RLS, so there is NO insert policy on purpose.
-- ---------------------------------------------------------------------------
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_experiments" ON experiments;
CREATE POLICY "admin_all_experiments" ON experiments
  FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

DROP POLICY IF EXISTS "admin_read_experiment_events" ON experiment_events;
CREATE POLICY "admin_read_experiment_events" ON experiment_events
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- ---------------------------------------------------------------------------
-- Self-verification: fail loudly on a partial apply rather than silently half-landing.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.experiments') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: experiments table missing';
  END IF;
  IF to_regclass('public.experiment_events') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: experiment_events table missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'experiment_events' AND column_name = 'dedupe_key'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: experiment_events.dedupe_key missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'experiments' AND policyname = 'admin_all_experiments'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: experiments admin RLS policy missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'experiment_events' AND policyname = 'admin_read_experiment_events'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: experiment_events admin RLS policy missing';
  END IF;
  RAISE NOTICE 'schema-phase2-experiments.sql applied cleanly.';
END $$;
