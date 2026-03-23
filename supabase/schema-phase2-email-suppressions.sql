-- Email Suppression List (Global)
-- Hard bounces and spam complaints suppress emails across ALL artists.
-- This protects deliverability for the entire platform.

CREATE TABLE IF NOT EXISTS email_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('hard_bounce', 'spam_complaint')),
  bounce_message text,
  source text, -- which system triggered it: 'campaign', 'sequence', 'outreach'
  created_at timestamptz DEFAULT now(),
  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_email_suppressions_email
  ON email_suppressions(email);

-- RLS: only service role can read/write (webhook + senders)
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;

-- Admin can view (for the admin dashboard)
CREATE POLICY "admin_view_suppressions" ON email_suppressions
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'admin'
    )
  );

-- Add resend_message_id to campaign_sends for webhook matching
ALTER TABLE campaign_sends
  ADD COLUMN IF NOT EXISTS resend_message_id text;

CREATE INDEX IF NOT EXISTS idx_campaign_sends_resend_id
  ON campaign_sends(resend_message_id);

-- Add bounce_reason to campaign_sends
ALTER TABLE campaign_sends
  ADD COLUMN IF NOT EXISTS bounce_reason text;
