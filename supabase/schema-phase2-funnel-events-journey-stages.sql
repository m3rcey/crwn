-- Widen the funnel_events stage CHECK to the twenty canonical stages (adds call_requested,
-- stripe_connected, fans_imported, fan_invited, first_paid_conversion).
--
-- Two cases:
--   * funnel_events was NEVER applied: run schema-phase2-funnel-events.sql (it already
--     contains all twenty stages), then this file is a no-op you can still run safely.
--   * funnel_events WAS applied with the fifteen-stage CHECK: this file replaces the CHECK.
--     Inserts of the five new stages fail silently (by recorder design) until it runs.
--
-- Safe to run more than once.

DO $$
BEGIN
  IF to_regclass('public.funnel_events') IS NULL THEN
    RAISE NOTICE 'funnel_events does not exist yet. Run schema-phase2-funnel-events.sql first; nothing to do here.';
    RETURN;
  END IF;

  ALTER TABLE funnel_events DROP CONSTRAINT IF EXISTS funnel_events_stage_check;
  ALTER TABLE funnel_events ADD CONSTRAINT funnel_events_stage_check CHECK (stage IN (
    'page_viewed',
    'calculator_started',
    'calculator_completed',
    'result_revealed',
    'assumptions_changed',
    'email_submitted',
    'signup_clicked',
    'account_created',
    'email_verified',
    'setup_started',
    'setup_completed',
    'builder_opened',
    'builder_published',
    'rise_mode_started',
    'mission_completed',
    'call_requested',
    'stripe_connected',
    'fans_imported',
    'fan_invited',
    'first_paid_conversion'
  ));
END $$;

-- ---------------------------------------------------------------------------
-- Self-verify (fails LOUDLY when the table exists but the CHECK was not widened)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  def text;
BEGIN
  IF to_regclass('public.funnel_events') IS NULL THEN
    RAISE NOTICE 'SKIPPED: funnel_events not created yet.';
    RETURN;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conname = 'funnel_events_stage_check' AND conrelid = 'public.funnel_events'::regclass;

  IF def IS NULL OR position('first_paid_conversion' in def) = 0 THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: funnel_events_stage_check does not include the journey stages';
  END IF;

  RAISE NOTICE 'OK: funnel_events accepts all twenty stages';
END $$;
