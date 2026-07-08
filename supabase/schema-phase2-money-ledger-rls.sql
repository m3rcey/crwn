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
-- ============================================================================

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

  -- 2) No permissive (USING true) read policy may expose a ledger table.
  SELECT tablename || '.' || policyname INTO bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('referrals','referral_earnings','fan_payouts','processed_webhook_events')
    AND qual = 'true'
  LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Permissive USING(true) policy exposes a money ledger: %', bad;
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
