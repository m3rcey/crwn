-- Prospect Nurture — long-term email nurture for email-only calculator leads.
--
-- A lead who completes a CRWN calculator, asks for the result by email, but does NOT create an
-- account, enters this sequence. The CONTENT lives in code (src/lib/prospectNurture), versioned in
-- git like the quest catalog and the loss engine; these tables hold only ENROLLMENT STATE and a
-- per-email SEND LEDGER for idempotency and behavioral attribution.
--
-- Why new tables instead of extending platform_sequence_enrollments: that table keys on
-- artist_user_id NOT NULL (an account holder) and its step model is a flat subject/body. An
-- email-only lead has no auth user, and this sequence needs phases, calculator modules and a
-- version. The existing structure cannot hold either, so this is additive, not parallel: it reuses
-- the same Resend sender, the same email_suppressions gate, the same daily cron scheduler, the same
-- lead_magnet_leads / lead_magnet_results tables, and the same recordLmEvent analytics sink.
--
-- Manual apply order: this file is standalone. It depends only on lead_magnet_leads,
-- lead_magnet_results and email_suppressions, which are already live. Apply any time.
-- Rollback: DROP TABLE prospect_nurture_sends, prospect_nurture_enrollments; the suppression CHECK
-- change is additive and safe to leave.

-- ─── 1. Additive: allow an "unsubscribe" suppression reason ──────────────────────────────────────
-- A marketing unsubscribe becomes a global suppression, so it overrides EVERY marketing send
-- (campaigns, artist sequences, prospect nurture) through the one isEmailSuppressed() gate.
ALTER TABLE email_suppressions DROP CONSTRAINT IF EXISTS email_suppressions_reason_check;
ALTER TABLE email_suppressions
  ADD CONSTRAINT email_suppressions_reason_check
  CHECK (reason IN ('hard_bounce', 'spam_complaint', 'unsubscribe'));

-- ─── 2. Enrollment state (one row per active prospect nurture) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS prospect_nurture_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The email-only lead this nurture belongs to. Cascade so deleting a lead cleans up its nurture.
  lead_id uuid NOT NULL REFERENCES lead_magnet_leads(id) ON DELETE CASCADE,
  -- Denormalized normalized email: fast suppression lookups and the dedup key without a join.
  email text NOT NULL,
  -- The calculator that generated the lead. Drives the calculator-specific module + CTA.
  tool_slug text NOT NULL,
  -- The specific stored result used for personalization (real numbers only, from result_data).
  result_id uuid REFERENCES lead_magnet_results(id) ON DELETE SET NULL,
  -- The code-defined sequence version this enrollment renders against. Historical sends are not
  -- rewritten when the code changes; a new enrollment picks up the new version.
  sequence_version integer NOT NULL DEFAULT 1,
  phase text,
  -- Index into the code-defined ordered email list. 0 = nothing nurture-side sent yet (the
  -- transactional result email is sent separately by the capture route and is not counted here).
  current_step integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'canceled', 'paused')),
  next_send_at timestamptz,
  last_sent_at timestamptz,
  -- Why the enrollment left: account_created | unsubscribed | suppressed | completed | admin.
  exit_reason text,
  -- Opaque one-click unsubscribe token (per enrollment). Never a raw email in a URL.
  unsub_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The scheduler scans (status, next_send_at). Keep it a covering-ish index.
CREATE INDEX IF NOT EXISTS idx_prospect_nurture_due
  ON prospect_nurture_enrollments(status, next_send_at);
CREATE INDEX IF NOT EXISTS idx_prospect_nurture_lead
  ON prospect_nurture_enrollments(lead_id);
-- Unsubscribe route looks up by token.
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospect_nurture_unsub
  ON prospect_nurture_enrollments(unsub_token);
-- DEDUP: at most one ACTIVE nurture per email. A second calculator refreshes the existing active
-- enrollment (in code) instead of opening an overlapping high-frequency sequence.
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospect_nurture_one_active
  ON prospect_nurture_enrollments(email)
  WHERE status = 'active';

-- ─── 3. Send ledger (idempotency + behavioral attribution) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS prospect_nurture_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES prospect_nurture_enrollments(id) ON DELETE CASCADE,
  -- The code-defined email id (e.g. 'core.p1.recap'). UNIQUE per enrollment = a step can never be
  -- sent twice even if the cron runs twice in a day or retries mid-batch.
  email_id text NOT NULL,
  sequence_version integer NOT NULL DEFAULT 1,
  -- The Resend message id, so the signed webhook can attribute opens/clicks/bounces back here.
  resend_message_id text,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  opened_at timestamptz,
  clicked_at timestamptz,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, email_id)
);

CREATE INDEX IF NOT EXISTS idx_prospect_nurture_sends_enrollment
  ON prospect_nurture_sends(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_prospect_nurture_sends_resend
  ON prospect_nurture_sends(resend_message_id);

-- ─── 4. RLS: service role does the work; admins can read for the dashboard ───────────────────────
ALTER TABLE prospect_nurture_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_nurture_sends ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policy = no browser access at all. The cron and admin API use the
-- service-role client, which bypasses RLS. Admins read through the service-role admin API
-- (requireAdmin), so a SELECT policy is a belt-and-suspenders convenience for the SQL editor only.
CREATE POLICY "admin_read_prospect_nurture_enrollments" ON prospect_nurture_enrollments
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
CREATE POLICY "admin_read_prospect_nurture_sends" ON prospect_nurture_sends
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- ─── 5. Self-verify: fail LOUD in the SQL editor if any piece half-applied ───────────────────────
DO $$
BEGIN
  IF to_regclass('public.prospect_nurture_enrollments') IS NULL THEN
    RAISE EXCEPTION 'prospect_nurture_enrollments table missing';
  END IF;
  IF to_regclass('public.prospect_nurture_sends') IS NULL THEN
    RAISE EXCEPTION 'prospect_nurture_sends table missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prospect_nurture_enrollments' AND column_name = 'unsub_token'
  ) THEN
    RAISE EXCEPTION 'prospect_nurture_enrollments.unsub_token missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_prospect_nurture_one_active'
  ) THEN
    RAISE EXCEPTION 'dedup index idx_prospect_nurture_one_active missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prospect_nurture_sends_enrollment_id_email_id_key'
  ) THEN
    RAISE EXCEPTION 'idempotency UNIQUE (enrollment_id, email_id) missing';
  END IF;
  -- The suppression CHECK must now accept 'unsubscribe'.
  BEGIN
    PERFORM 1;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'email_suppressions_reason_check'
        AND pg_get_constraintdef(oid) LIKE '%unsubscribe%'
    ) THEN
      RAISE EXCEPTION 'email_suppressions reason CHECK does not include unsubscribe';
    END IF;
  END;
  RAISE NOTICE 'prospect-nurture schema verified';
END $$;
