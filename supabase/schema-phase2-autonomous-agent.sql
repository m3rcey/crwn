-- Autonomous Agent: add columns to track autonomous (cron-triggered) runs
-- Applied manually via Supabase SQL Editor

-- Add scope and autonomous flag to existing agent_action_log
ALTER TABLE agent_action_log
  ADD COLUMN IF NOT EXISTS is_autonomous BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS scope TEXT,
  ADD COLUMN IF NOT EXISTS diagnosis_summary TEXT;

-- Autonomous run log: one row per autonomous analysis cycle
CREATE TABLE IF NOT EXISTS autonomous_run_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL,
  diagnosis_summary TEXT,
  severity TEXT, -- 'critical' | 'warning' | 'info'
  actions_recommended INT DEFAULT 0,
  actions_auto_executed INT DEFAULT 0,
  actions_escalated INT DEFAULT 0,
  outcome TEXT, -- short description of what improved
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE autonomous_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read autonomous run log" ON autonomous_run_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Index for fast stats queries
CREATE INDEX IF NOT EXISTS idx_autonomous_run_log_created ON autonomous_run_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_action_log_autonomous ON agent_action_log(is_autonomous, created_at DESC);
