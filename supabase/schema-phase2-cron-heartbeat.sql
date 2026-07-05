-- Cron heartbeat: one row per completed cron run, written UNCONDITIONALLY.
-- Run manually in Supabase SQL Editor.
--
-- Why this exists: the agent-health check used to infer "did the AI manager
-- run?" from the COUNT of artist_agent_runs, but that table only fills for
-- Pro-tier artists WITH activity. Pre-PMF that count is legitimately zero, so
-- the check fired a daily false "[CRITICAL] AI Manager has not run in 24+ hours"
-- even though the cron ran fine. Liveness must be measured by the cron logging
-- its own completion, not by per-artist side effects.

CREATE TABLE IF NOT EXISTS cron_heartbeat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job TEXT NOT NULL,        -- e.g. 'ai-manager'
  detail TEXT,              -- short summary of what the run did
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cron_heartbeat_job_created
  ON cron_heartbeat(job, created_at DESC);

ALTER TABLE cron_heartbeat ENABLE ROW LEVEL SECURITY;

-- Admins can read; the service-role client (crons) bypasses RLS to insert.
DROP POLICY IF EXISTS "Admins can read cron heartbeat" ON cron_heartbeat;
CREATE POLICY "Admins can read cron heartbeat" ON cron_heartbeat
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Self-verify: fail loudly if this migration half-applied ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'cron_heartbeat'
  ) THEN
    RAISE EXCEPTION 'cron_heartbeat table was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_cron_heartbeat_job_created'
  ) THEN
    RAISE EXCEPTION 'idx_cron_heartbeat_job_created index missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cron_heartbeat' AND policyname = 'Admins can read cron heartbeat'
  ) THEN
    RAISE EXCEPTION 'cron_heartbeat read policy missing';
  END IF;
END $$;
