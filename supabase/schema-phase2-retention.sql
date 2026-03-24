-- ============================================================================
-- RETENTION FEATURES: Cancellation Reasons + Loyalty Surveys
-- Run in Supabase SQL Editor (not auto-applied)
-- ============================================================================

-- ─── Cancellation Reasons ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cancellation_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Polymorphic: fan canceling artist sub OR artist canceling platform sub
  subscription_id UUID REFERENCES subscriptions(id),         -- fan sub (nullable)
  artist_profile_id UUID REFERENCES artist_profiles(id),     -- platform sub (nullable)
  user_id UUID NOT NULL REFERENCES auth.users(id),           -- who canceled
  reasons TEXT[] NOT NULL DEFAULT '{}',                       -- multi-select reasons
  freeform TEXT,                                              -- optional open text
  context TEXT NOT NULL CHECK (context IN ('fan', 'platform')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cancel_reasons_sub ON cancellation_reasons(subscription_id);
CREATE INDEX IF NOT EXISTS idx_cancel_reasons_artist ON cancellation_reasons(artist_profile_id);
CREATE INDEX IF NOT EXISTS idx_cancel_reasons_context ON cancellation_reasons(context);
CREATE INDEX IF NOT EXISTS idx_cancel_reasons_created ON cancellation_reasons(created_at);

ALTER TABLE cancellation_reasons ENABLE ROW LEVEL SECURITY;

-- Users can insert their own cancellation reasons
CREATE POLICY "Users can insert own cancel reasons"
  ON cancellation_reasons FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Artists can view reasons for their fan subs; admins can view all; users can view own
CREATE POLICY "View cancel reasons"
  ON cancellation_reasons FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      context = 'fan' AND subscription_id IN (
        SELECT id FROM subscriptions WHERE artist_id IN (
          SELECT id FROM artist_profiles WHERE user_id = auth.uid()
        )
      )
    )
    OR auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- ─── Survey Responses ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_type TEXT NOT NULL CHECK (survey_type IN ('loyalty_fan', 'loyalty_artist')),
  respondent_id UUID NOT NULL REFERENCES auth.users(id),
  artist_id UUID REFERENCES artist_profiles(id),  -- NULL for platform surveys
  answers JSONB NOT NULL DEFAULT '{}',
  -- answers shape: { "why_stayed": ["great_content", ...], "favorite": "...", "nps": 9, "freeform": "..." }
  nps_score INT CHECK (nps_score >= 0 AND nps_score <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_survey_type ON survey_responses(survey_type);
CREATE INDEX IF NOT EXISTS idx_survey_artist ON survey_responses(artist_id);
CREATE INDEX IF NOT EXISTS idx_survey_respondent ON survey_responses(respondent_id);
CREATE INDEX IF NOT EXISTS idx_survey_created ON survey_responses(created_at);

ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;

-- Users can submit their own surveys
CREATE POLICY "Users can submit surveys"
  ON survey_responses FOR INSERT
  WITH CHECK (auth.uid() = respondent_id);

-- Artists can view fan surveys for their profile; admins see all; users see own
CREATE POLICY "View survey responses"
  ON survey_responses FOR SELECT
  USING (
    respondent_id = auth.uid()
    OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
    OR auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- ─── Fan digest preference ─────────────────────────────────────────────────
-- Fans can opt into weekly digest instead of real-time marketing emails
-- Per-artist: keeps existing email_marketing flag, adds digest_only flag
ALTER TABLE fan_communication_prefs
  ADD COLUMN IF NOT EXISTS digest_only BOOLEAN DEFAULT FALSE;

-- ─── Add loyalty_survey trigger type to sequences ──────────────────────────

ALTER TABLE sequences DROP CONSTRAINT IF EXISTS sequences_trigger_type_check;
ALTER TABLE sequences ADD CONSTRAINT sequences_trigger_type_check
  CHECK (trigger_type IN (
    'new_subscription', 'new_purchase', 'tier_upgrade',
    'post_purchase_upsell', 'win_back', 'inactive_subscriber',
    'abandoned_cart', 'loyalty_survey'
  ));

-- Add to platform sequences too
ALTER TABLE platform_sequences DROP CONSTRAINT IF EXISTS platform_sequences_trigger_type_check;
ALTER TABLE platform_sequences ADD CONSTRAINT platform_sequences_trigger_type_check
  CHECK (trigger_type IN (
    'new_signup', 'onboarding_incomplete', 'starter_upgrade_nudge',
    'paid_at_risk', 'paid_churned', 'upgrade_abandoned',
    'loyalty_survey'
  ));
