-- ============================================================================
-- Money-ledger hardening  (security audit H3 + M3)
-- ============================================================================
-- Four money tables were created directly in prod and never had a checked-in
-- migration, so their RLS state was unverifiable:
--   referrals, referral_earnings, fan_payouts, processed_webhook_events
--
-- The app reads/writes them ONLY via the service-role client in API routes and
-- webhooks (verified: no browser-client reads anywhere in src/). Enabling RLS
-- with no permissive policy therefore denies anon/authenticated access while
-- the service role keeps bypassing RLS — closing any accidental public read.
--
-- Also adds the UNIQUE(event_id) index that the Stripe webhook now relies on to
-- claim events atomically (prevents double-processing earnings on redelivery).
--
-- Idempotent + defensive: only touches tables that exist. Applies cleanly even
-- if RLS is already on.
--
-- Also drops any PERMISSIVE (USING true / WITH CHECK true) policy on these
-- tables that is reachable by a non-service role. service_role bypasses RLS, so
-- such a policy grants nothing it needs — but if it defaulted to PUBLIC (no TO
-- clause) it silently exposes the ledger to every authenticated user. Verified
-- no session/browser client reads these tables, so dropping is safe.
-- ============================================================================

-- Drop permissive policies reachable by non-service roles -----------------
DO $$
DECLARE
  tbl text;
  pol record;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['referrals','referral_earnings','fan_payouts','processed_webhook_events']
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN CONTINUE; END IF;
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
        AND (qual = 'true' OR with_check = 'true')
        AND roles <> ARRAY['service_role']::name[]
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
      RAISE NOTICE 'Dropped permissive policy %.% (was reachable by non-service roles)', tbl, pol.policyname;
    END LOOP;
  END LOOP;
END $$;

-- referrals ------------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.referrals') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- referral_earnings ----------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.referral_earnings') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.referral_earnings ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- fan_payouts ----------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.fan_payouts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.fan_payouts ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- processed_webhook_events ---------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.processed_webhook_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY';
    -- Atomic idempotency: the webhook inserts (event_id) as its claim and treats
    -- a unique-violation as "already processed".
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uniq_processed_webhook_event_id
             ON public.processed_webhook_events (event_id)';
  END IF;
END $$;

-- ============================================================================
-- Self-verify — fail LOUDLY if anything is off, per repo migration convention.
-- ============================================================================
DO $$
DECLARE
  t   text;
  bad text;
BEGIN
  -- 1) RLS must be enabled on every ledger table that exists.
  FOR t IN SELECT unnest(ARRAY[
             'referrals','referral_earnings','fan_payouts','processed_webhook_events'])
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      IF NOT (SELECT relrowsecurity FROM pg_class
              WHERE oid = ('public.' || t)::regclass) THEN
        RAISE EXCEPTION 'RLS not enabled on public.%', t;
      END IF;
    END IF;
  END LOOP;

  -- 2) No permissive (USING/WITH CHECK true) policy reachable by a NON-service
  --    role may remain. A policy scoped strictly TO service_role is harmless
  --    (service_role bypasses RLS anyway), so it is not flagged.
  SELECT tablename || '.' || policyname INTO bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('referrals','referral_earnings','fan_payouts','processed_webhook_events')
    AND (qual = 'true' OR with_check = 'true')
    AND roles <> ARRAY['service_role']::name[]
  LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Permissive policy still exposes a money ledger to non-service roles: %', bad;
  END IF;

  -- 3) The webhook idempotency unique index must exist (if the table exists).
  IF to_regclass('public.processed_webhook_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'processed_webhook_events'
         AND indexname = 'uniq_processed_webhook_event_id') THEN
    RAISE EXCEPTION 'Missing uniq_processed_webhook_event_id on processed_webhook_events';
  END IF;

  RAISE NOTICE 'money-ledger-rls: OK (RLS enabled + idempotency index verified)';
END $$;
