-- Platform sequence send ledger.
--
-- WHY THIS EXISTS
-- The post-signup lifecycle sequences have been emailing real artists since 2026-04-01 and left no
-- record of it. The cron incremented `platform_sequence_enrollments.current_step` and sent. That is
-- the ONLY trace: 20 enrollments sitting at steps 1 to 3, which is 45 emails to real artists with no
-- recipient, no subject, no timestamp, no delivered/bounced/opened/clicked, and no way to tell one
-- send from another. The signed Resend webhook could not attribute anything back, because there was
-- nothing to attribute TO and the cron set no identifying header.
--
-- This is deliberately a COPY of `prospect_nurture_sends` (schema-phase2-prospect-nurture.sql), not
-- a new design. That table already proves the shape works end to end: insert before send, unique key
-- for idempotency, resend_message_id for webhook attribution, status ladder for outcome. Copying it
-- means the webhook, the admin reader and the mental model are all the same for both systems.
--
-- WHAT IT DOES NOT DO
-- It stores no email BODY. The copy lives in `platform_sequence_steps` and is versionless; snapshotting
-- it per send would double the storage of the drift problem rather than fix it. `step_number` points
-- at the step that was current when the send happened, which is what a report needs.

-- ─── 1. The ledger ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_sequence_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL
    REFERENCES platform_sequence_enrollments(id) ON DELETE CASCADE,
  -- Denormalized so "how did the no_stripe sequence perform" is one query, not a three-table join.
  -- The enrollment cascades, so this can never outlive its parent and go stale.
  sequence_id uuid NOT NULL
    REFERENCES platform_sequences(id) ON DELETE CASCADE,
  -- The step that was sent. UNIQUE per enrollment below, so a step can never be sent twice even if
  -- the cron runs twice in a day, retries mid-batch, or crashes between the send and the advance.
  step_number integer NOT NULL,
  -- The Resend message id, so the signed webhook can attribute opens/clicks/bounces back here.
  resend_message_id text,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  opened_at timestamptz,
  clicked_at timestamptz,
  sent_at timestamptz NOT NULL DEFAULT now(),
  -- The idempotency guard. The cron INSERTs before it sends and treats a unique violation as
  -- "already sent", which is what makes a duplicate send structurally impossible rather than
  -- merely unlikely.
  UNIQUE (enrollment_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_platform_sequence_sends_enrollment
  ON platform_sequence_sends(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_platform_sequence_sends_sequence
  ON platform_sequence_sends(sequence_id);
-- The webhook looks a send up by Resend's message id on every delivered/opened/clicked event.
CREATE INDEX IF NOT EXISTS idx_platform_sequence_sends_resend
  ON platform_sequence_sends(resend_message_id);
CREATE INDEX IF NOT EXISTS idx_platform_sequence_sends_sent_at
  ON platform_sequence_sends(sent_at DESC);

-- ─── 2. RLS: service role does the work, admins may read ────────────────────────────────────────
-- No anon/authenticated policy = no browser access at all. The cron and the admin API both use the
-- service-role client, which bypasses RLS. The admin SELECT policy is a convenience for the SQL
-- editor, and matches the two prospect-nurture tables exactly.
ALTER TABLE platform_sequence_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_platform_sequence_sends" ON platform_sequence_sends;
CREATE POLICY "admin_read_platform_sequence_sends" ON platform_sequence_sends
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- ─── 3. Self-verify ─────────────────────────────────────────────────────────────────────────────
-- A partial apply must error loudly here rather than silently half-landing. Each assertion checks
-- the property the code actually depends on, not merely that a name exists.
DO $$
DECLARE
  v_cols integer;
  v_unique integer;
BEGIN
  IF to_regclass('public.platform_sequence_sends') IS NULL THEN
    RAISE EXCEPTION 'platform_sequence_sends was not created';
  END IF;

  -- Every column the cron and the webhook write.
  SELECT count(*) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'platform_sequence_sends'
    AND column_name IN ('id', 'enrollment_id', 'sequence_id', 'step_number',
                        'resend_message_id', 'status', 'opened_at', 'clicked_at', 'sent_at');
  IF v_cols <> 9 THEN
    RAISE EXCEPTION 'platform_sequence_sends is missing columns: expected 9, found %', v_cols;
  END IF;

  -- The idempotency guard. Without this the cron's "unique violation means already sent" read is
  -- false, and a retry sends a duplicate to a real artist.
  SELECT count(*) INTO v_unique
  FROM pg_constraint
  WHERE conrelid = 'public.platform_sequence_sends'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 2;
  IF v_unique < 1 THEN
    RAISE EXCEPTION 'platform_sequence_sends is missing the UNIQUE (enrollment_id, step_number) guard';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'platform_sequence_sends' AND rowsecurity
  ) THEN
    RAISE EXCEPTION 'platform_sequence_sends does not have RLS enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'platform_sequence_sends'
      AND policyname = 'admin_read_platform_sequence_sends'
  ) THEN
    RAISE EXCEPTION 'admin_read_platform_sequence_sends policy is missing';
  END IF;

  RAISE NOTICE 'platform_sequence_sends: table, 9 columns, unique guard, RLS and admin read policy all present.';
END $$;
