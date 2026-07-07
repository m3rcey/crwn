-- schema-phase2-calendar-reminders.sql
-- Phase 4 of the Promise/My-CRWN Calendar: reminder DEDUP ledger.
--
-- Vercel Hobby only allows DAILY crons, so reminders can't honour sub-day offsets
-- (7d/3d/1h before). The model instead: a daily dispatch reminds a user ONCE about
-- an item when it first enters the "due soon" window (or is overdue, for artists).
-- This table is the idempotency guard — one row per (user, subject, channel) means
-- a re-run (or the next day) never re-sends the same reminder.
--
-- Dispatch runs inside the existing daily `sequences` cron (no new cron entry).
-- The `notifications` type CHECK already accepts new types in prod (verified), so
-- no change there.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS calendar_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- What the reminder is about. subject_id points at the projected/real row
  -- (fulfillment_events.id, live_sessions.id, …); subject_type disambiguates.
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app','email')),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','skipped')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- The dedup key: remind each user about each subject on each channel at most once.
  UNIQUE (user_id, subject_type, subject_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_calendar_reminders_user ON calendar_reminders(user_id);

ALTER TABLE calendar_reminders ENABLE ROW LEVEL SECURITY;

-- Users can see their own reminder history; inserts happen via the service-role
-- cron (which bypasses RLS), so no INSERT policy is needed.
DROP POLICY IF EXISTS "Users read own calendar reminders" ON calendar_reminders;
CREATE POLICY "Users read own calendar reminders" ON calendar_reminders
  FOR SELECT USING (user_id = auth.uid());

DO $$
BEGIN
  IF to_regclass('public.calendar_reminders') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: calendar_reminders missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calendar_reminders'
      AND policyname = 'Users read own calendar reminders'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: calendar_reminders RLS policy missing';
  END IF;
  RAISE NOTICE 'OK: calendar_reminders created';
END $$;

COMMIT;
