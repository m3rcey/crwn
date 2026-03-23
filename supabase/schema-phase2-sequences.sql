-- Welcome Sequences - Phase 3 Marketing Suite
-- Run manually in Supabase SQL Editor

-- Sequence definitions
CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID REFERENCES artist_profiles(id) NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT DEFAULT 'new_subscription' CHECK (trigger_type IN ('new_subscription', 'new_purchase', 'tier_upgrade')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ordered steps within a sequence
CREATE TABLE sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES sequences(id) ON DELETE CASCADE NOT NULL,
  step_number INTEGER NOT NULL,
  delay_days INTEGER NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fan enrollments in sequences
CREATE TABLE sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES sequences(id) ON DELETE CASCADE NOT NULL,
  fan_id UUID REFERENCES profiles(id) NOT NULL,
  artist_id UUID REFERENCES artist_profiles(id) NOT NULL,
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'canceled')),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  next_send_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_sequences_artist_active ON sequences(artist_id, is_active);
CREATE INDEX idx_sequence_steps_sequence ON sequence_steps(sequence_id, step_number);
CREATE INDEX idx_enrollments_due ON sequence_enrollments(next_send_at, status) WHERE status = 'active';
CREATE INDEX idx_enrollments_sequence ON sequence_enrollments(sequence_id, status);
CREATE INDEX idx_enrollments_fan ON sequence_enrollments(fan_id, sequence_id);

-- RLS
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artists can manage own sequences"
  ON sequences FOR ALL
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Artists can manage own sequence steps"
  ON sequence_steps FOR ALL
  USING (sequence_id IN (
    SELECT id FROM sequences WHERE artist_id IN (
      SELECT id FROM artist_profiles WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Artists can view own enrollments"
  ON sequence_enrollments FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));
