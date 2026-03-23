-- Platform CRM — CRWN managing artists as customers
-- Pipeline stages, lead scoring, automated sequences, admin notes

-- ─── Pipeline stage + lead score on artist_profiles ──────────────────────────

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS pipeline_stage text DEFAULT 'onboarding'
    CHECK (pipeline_stage IN ('signed_up', 'onboarding', 'free', 'paid', 'at_risk', 'churned')),
  ADD COLUMN IF NOT EXISTS platform_lead_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_lead_score_updated_at timestamptz;

-- ─── Platform sequences (CRWN → artist emails) ──────────────────────────────

CREATE TABLE IF NOT EXISTS platform_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'new_signup',
    'onboarding_incomplete',
    'starter_upgrade_nudge',
    'paid_at_risk',
    'paid_churned',
    'upgrade_abandoned'
  )),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES platform_sequences(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  delay_days integer NOT NULL DEFAULT 0,
  subject text NOT NULL,
  body text NOT NULL,
  UNIQUE(sequence_id, step_number)
);

CREATE TABLE IF NOT EXISTS platform_sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES platform_sequences(id) ON DELETE CASCADE,
  artist_user_id uuid NOT NULL REFERENCES auth.users(id),
  current_step integer DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'canceled')),
  next_send_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_enrollments_status
  ON platform_sequence_enrollments(status, next_send_at);
CREATE INDEX IF NOT EXISTS idx_platform_enrollments_artist
  ON platform_sequence_enrollments(artist_user_id);

-- ─── Admin notes on artists ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS artist_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artist_notes_artist
  ON artist_notes(artist_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE platform_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_notes ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "admin_manage_platform_sequences" ON platform_sequences
  FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

CREATE POLICY "admin_manage_platform_steps" ON platform_sequence_steps
  FOR ALL USING (
    sequence_id IN (SELECT id FROM platform_sequences)
    AND auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

CREATE POLICY "admin_manage_platform_enrollments" ON platform_sequence_enrollments
  FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

CREATE POLICY "admin_manage_artist_notes" ON artist_notes
  FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
