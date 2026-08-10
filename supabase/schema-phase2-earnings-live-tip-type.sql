-- schema-phase2-earnings-live-tip-type.sql
-- Add 'live_tip' to the earnings.type allowlist.
--
-- BUG THIS FIXES (found 2026-08-06 by the Money Model measurement audit):
-- schema-phase2-earnings-type-check.sql constrained earnings.type to six values
-- (subscription, purchase, booking, live_ticket, refund, dispute) and claimed that
-- was "the complete set inserted anywhere in the codebase". It was not:
-- webhookHandlers.ts handleTipCheckout inserts type='live_tip' (src/lib/
-- webhookHandlers.ts, the live-tips Phase 1 build). With the constraint applied,
-- every live-tip earnings insert is rejected, and because the handler reads
-- `{ data: earning }` and only continues `if (earning)`, the failure is SILENT:
-- the tip row in live_tips still updates, the fan is charged, but the artist's
-- GMV, platform-fee revenue, and net earnings never record the tip. Exactly the
-- class of silent money loss the type-check migration was written to prevent for
-- refunds.
--
-- Safe ordering: widening a CHECK can never invalidate existing rows.
-- Apply manually in the Supabase SQL Editor. Idempotent; safe to re-run.

BEGIN;

ALTER TABLE earnings DROP CONSTRAINT IF EXISTS earnings_type_check;
ALTER TABLE earnings ADD CONSTRAINT earnings_type_check
  CHECK (type IN ('subscription', 'purchase', 'booking', 'live_ticket', 'live_tip', 'refund', 'dispute'));

DO $$
DECLARE bad INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'earnings_type_check' AND conrelid = 'public.earnings'::regclass
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: earnings_type_check missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'earnings_type_check'
      AND conrelid = 'public.earnings'::regclass
      AND pg_get_constraintdef(oid) LIKE '%live_tip%'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: earnings_type_check does not include live_tip';
  END IF;

  SELECT count(*) INTO bad FROM earnings
   WHERE type NOT IN ('subscription','purchase','booking','live_ticket','live_tip','refund','dispute');
  IF bad > 0 THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: % earnings rows outside the allowlist', bad;
  END IF;

  RAISE NOTICE 'OK: earnings_type_check now includes live_tip.';
END $$;

COMMIT;
