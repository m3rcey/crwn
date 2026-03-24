-- Agent Action Log: tracks all AI-suggested actions executed by admin
-- Applied manually via Supabase SQL Editor

CREATE TABLE IF NOT EXISTS agent_action_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id) NOT NULL,
  action_type TEXT NOT NULL,
  action_label TEXT NOT NULL,
  action_params JSONB DEFAULT '{}',
  result TEXT NOT NULL, -- 'success' | 'failed'
  result_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_action_log ENABLE ROW LEVEL SECURITY;

-- Admins can read the action log
CREATE POLICY "Admins can read action log" ON agent_action_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Service role inserts (from API routes) bypass RLS, so no INSERT policy needed
