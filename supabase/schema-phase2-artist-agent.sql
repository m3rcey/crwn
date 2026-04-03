-- Artist AI Agent: Actions & Autonomous Run History
-- Run manually in Supabase SQL Editor

-- Pending/executed actions the AI agent recommends for each artist
CREATE TABLE artist_agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id),
  action_type TEXT NOT NULL,
  action_label TEXT NOT NULL,
  action_description TEXT,
  action_params JSONB DEFAULT '{}',
  risk TEXT NOT NULL DEFAULT 'low' CHECK (risk IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'auto_executed', 'approved', 'rejected', 'executed', 'failed')),
  result_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  executed_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX idx_artist_agent_actions_artist ON artist_agent_actions(artist_id, status);
CREATE INDEX idx_artist_agent_actions_pending ON artist_agent_actions(status, created_at) WHERE status = 'pending';

-- Autonomous run log per artist
CREATE TABLE artist_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id),
  diagnosis_summary TEXT,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('critical', 'warning', 'info')),
  actions_recommended INTEGER DEFAULT 0,
  actions_auto_executed INTEGER DEFAULT 0,
  actions_escalated INTEGER DEFAULT 0,
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_artist_agent_runs_artist ON artist_agent_runs(artist_id, created_at DESC);

-- RLS
ALTER TABLE artist_agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_agent_runs ENABLE ROW LEVEL SECURITY;

-- Artists can view their own actions
CREATE POLICY "artists_view_own_actions" ON artist_agent_actions
  FOR SELECT USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- Artists can update (approve/reject) their own pending actions
CREATE POLICY "artists_update_own_actions" ON artist_agent_actions
  FOR UPDATE USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- Service role can insert/update (agent execution)
CREATE POLICY "service_manage_actions" ON artist_agent_actions
  FOR ALL USING (true) WITH CHECK (true);

-- Artists can view their own run history
CREATE POLICY "artists_view_own_runs" ON artist_agent_runs
  FOR SELECT USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- Service role can insert runs
CREATE POLICY "service_insert_runs" ON artist_agent_runs
  FOR INSERT WITH CHECK (true);
