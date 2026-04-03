-- Agent Outcome Tracking & Coordination
-- Run manually in Supabase SQL Editor

-- ─── Outcome Tracking ───────────────────────────────────────────────────────
-- Add columns to artist_agent_actions for before/after metric snapshots

ALTER TABLE artist_agent_actions
  ADD COLUMN IF NOT EXISTS baseline_metrics JSONB,
  ADD COLUMN IF NOT EXISTS outcome_metrics JSONB,
  ADD COLUMN IF NOT EXISTS outcome_measured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_delta JSONB;

-- baseline_metrics: snapshot at execution time (e.g. { mrr: 5000, churnRate: 4.2, activeSubs: 12 })
-- outcome_metrics: snapshot 7 days after execution
-- outcome_delta: computed diff (e.g. { mrr: +200, churnRate: -0.8, activeSubs: +2 })
-- outcome_measured_at: when the 7-day measurement was taken

-- Index for the outcome measurement cron: find executed actions needing measurement
CREATE INDEX IF NOT EXISTS idx_agent_actions_needs_outcome
  ON artist_agent_actions(executed_at, outcome_measured_at)
  WHERE status IN ('auto_executed', 'executed') AND outcome_measured_at IS NULL AND executed_at IS NOT NULL;

-- ─── Agent Coordination ─────────────────────────────────────────────────────
-- Prevents conflicting concurrent actions across agents

CREATE TABLE IF NOT EXISTS agent_coordination (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL,           -- 'platform', 'artist'
  agent_scope TEXT,                    -- 'growth', 'retention', 'artist_manager', etc.
  target_id UUID,                      -- artist_id or null for platform-wide
  action_type TEXT NOT NULL,           -- the action being performed
  lock_key TEXT NOT NULL,              -- dedup key: e.g. 'adjust_tier_price:tier_uuid'
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'expired')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',
  outcome_metrics JSONB
);

CREATE INDEX IF NOT EXISTS idx_agent_coordination_active
  ON agent_coordination(lock_key, status)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_agent_coordination_target
  ON agent_coordination(target_id, started_at DESC);

-- RLS
ALTER TABLE agent_coordination ENABLE ROW LEVEL SECURITY;

-- Service role manages coordination (no client access needed)
CREATE POLICY "service_manage_coordination" ON agent_coordination
  FOR ALL USING (true) WITH CHECK (true);

-- ─── Outcome History View (for feeding back into AI prompts) ────────────────
-- Aggregates past action outcomes per artist for the AI to learn from

CREATE OR REPLACE VIEW artist_action_outcomes AS
SELECT
  artist_id,
  action_type,
  action_label,
  action_description,
  risk,
  status,
  baseline_metrics,
  outcome_metrics,
  outcome_delta,
  executed_at,
  outcome_measured_at,
  -- Score: positive = good outcome, negative = bad
  CASE
    WHEN outcome_delta IS NOT NULL THEN
      COALESCE((outcome_delta->>'mrr')::numeric, 0) +
      COALESCE((outcome_delta->>'activeSubs')::numeric, 0) * 100 -
      COALESCE((outcome_delta->>'churnRate')::numeric, 0) * 500
    ELSE NULL
  END AS outcome_score
FROM artist_agent_actions
WHERE status IN ('auto_executed', 'executed')
  AND outcome_measured_at IS NOT NULL
ORDER BY executed_at DESC;

-- Note: Action dedup (no duplicate action_type per artist within 7 days) is
-- enforced in application code in the ai-manager cron, not via index, because
-- the 7-day sliding window doesn't map cleanly to a partial unique index.
