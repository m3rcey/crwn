-- schema-phase2-earnings-type-check.sql
-- Widen earnings.type to the full set the app actually inserts.
--
-- BUG THIS FIXES (found 2026-07-07 by the refund-clawback verification):
-- The original earnings_type_check predates the refund/dispute/booking/live_ticket
-- earnings writers, so it only permitted the early types. Any refund handler insert
-- (type='refund') was rejected with:
--     new row for relation "earnings" violates check constraint "earnings_type_check"
-- Because handleChargeRefunded returns early when the negative-earning insert fails,
-- this silently broke EVERY refund/dispute reversal — one-time purchases, subscription
-- renewals, AND initial subscriptions — not just the initial-sub gap the refund
-- resolver was added for. It was never noticed because a real refund had not fired
-- against prod (data is mostly seed/mock). The resolver itself works; the table
-- constraint was the blocker.
--
-- The six values below are the complete set inserted anywhere in the codebase
-- (verified by scanning every `.from('earnings').insert(...)` site). Existing prod
-- earnings use only 'subscription' and 'purchase', both retained, so no existing row
-- is invalidated (ADD CONSTRAINT would fail loudly if one were).
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
-- ROLLBACK: ALTER TABLE earnings DROP CONSTRAINT IF EXISTS earnings_type_check;
--           ALTER TABLE earnings ADD CONSTRAINT earnings_type_check
--             CHECK (type IN ('subscription','purchase'));
BEGIN;

ALTER TABLE earnings DROP CONSTRAINT IF EXISTS earnings_type_check;
ALTER TABLE earnings ADD CONSTRAINT earnings_type_check
  CHECK (type IN ('subscription','purchase','booking','live_ticket','refund','dispute'));

DO $$
DECLARE bad int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'earnings_type_check' AND conrelid = 'public.earnings'::regclass
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: earnings_type_check missing';
  END IF;

  -- No existing row may fall outside the new allowlist (defensive; the ADD above
  -- would already have failed, but make the guarantee explicit).
  SELECT count(*) INTO bad FROM earnings
   WHERE type NOT IN ('subscription','purchase','booking','live_ticket','refund','dispute');
  IF bad > 0 THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: % earnings rows have a type outside the new allowlist', bad;
  END IF;

  RAISE NOTICE 'OK: earnings_type_check now allows subscription/purchase/booking/live_ticket/refund/dispute';
END $$;

COMMIT;
