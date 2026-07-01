-- schema-phase2-onboarding-nudge.sql
-- Adds a send-once marker so the daily onboarding-reminder cron
-- (/api/cron/onboarding-reminder) emails each incomplete signup exactly once.
--
-- A signup that never finishes /welcome keeps profiles.onboarding_completed = false.
-- The cron finds those, emails a founder note with the Cal.com booking link, and
-- stamps onboarding_nudge_sent_at so the next run skips them.
--
-- Apply in the Supabase SQL Editor.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_nudge_sent_at TIMESTAMPTZ;

-- Self-verify: fail loudly if the column did not land.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'onboarding_nudge_sent_at'
  ) THEN
    RAISE EXCEPTION 'onboarding_nudge_sent_at column did not install on profiles';
  END IF;
END $$;
