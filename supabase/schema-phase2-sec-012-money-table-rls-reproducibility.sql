-- ============================================================================
-- SEC-012 — make the money/CRM tables' protection REPRODUCIBLE
-- ============================================================================
-- Cybersecurity audit 2026-08-12, docs/CYBERSECURITY_AUDIT_2026-08-12.md
--
-- THE FINDING (a reproducibility bug, not a live leak):
-- 15 money and CRM tables are used heavily by src/ but have NO CREATE TABLE
-- migration anywhere in supabase/. They were created by hand in production.
-- Production is fine TODAY: probes with the public anon key return zero rows for
-- earnings, referrals, recruiters, partner_codes, sync_opportunities, cron_run_log
-- and crm_contacts, so RLS is demonstrably enabled there. But that protection
-- exists ONLY inside the live database. It is not in version control, so:
--   * any rebuild (branch database, PITR restore, a fresh environment) comes up
--     with these tables RLS-OFF and therefore anon-writable, because Supabase
--     bootstraps `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated`;
--   * `npm run verify:migrations` cannot detect the difference, because a table
--     with no migration has no probe line to add.
-- The same class already bit this project once: schema-phase2-money-ledger-rls.sql
-- was written defensively for four tables and the treatment never reached the rest.
--
-- WHAT THIS MIGRATION DOES:
-- Enables RLS idempotently on the money/CRM tables that are accessed ONLY through
-- the service role. It is a no-op against today's production (RLS is already on)
-- and it is what makes a rebuilt database safe. service_role BYPASSES RLS, so every
-- existing server path keeps working unchanged.
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH, and why:
--   * `earnings` (2 browser call sites) and `recruiters` (1) are read from client
--     components, so they need real SELECT policies rather than a bare RLS enable.
--     Both are already RLS-protected in production (anon reads return zero rows),
--     so there is no live exposure. Authoring their policies means deciding the
--     exact intended read scope, which is a product decision and is tracked in
--     TODO.md rather than guessed at here. Enabling RLS on them WITHOUT a policy
--     would silently break an artist's own earnings view, which is a worse outcome
--     than the reproducibility gap it would close.
--   * No CREATE TABLE statements. Writing a speculative schema for a table that
--     already exists in production risks diverging from the real column set. The
--     durable fix is to dump the live definitions into migrations; that is a
--     founder-run task recorded in TODO.md.
--
-- Idempotent, restrictive-only, no data rewritten.
-- ROLLBACK: ALTER TABLE <name> DISABLE ROW LEVEL SECURITY; (per table). Do not,
-- unless a specific legitimate anon/authenticated read is proven to need it.
-- ============================================================================

DO $$
DECLARE
  t text;
  -- Service-role-only tables: verified 0 browser (.tsx) call sites each, so
  -- enabling RLS cannot break a client read.
  service_only text[] := ARRAY[
    'referrals',
    'referral_earnings',
    'recruiter_payouts',
    'partner_codes',
    'artist_referrals',
    'fan_payouts',
    'milestones',
    'sync_opportunities',
    'cron_run_log',
    'listening_history',
    -- The five CRM tables from schema-phase2-crm-contacts.sql, whose line 85 asserts
    -- "No RLS needed - these tables are only accessed via admin API routes using
    -- service role client". That reasoning is inverted: how the APPLICATION reaches
    -- a table says nothing about who else can. Supabase grants anon and authenticated
    -- full privileges by default, so a table with no RLS is reachable directly over
    -- the Data API by anyone holding the public anon key, which ships in the bundle.
    -- These hold prospect names, emails and outreach history.
    'crm_contacts',
    'crm_lists',
    'crm_outreaches',
    'crm_outreach_sends',
    'crm_outreach_unsubscribes'
  ];
BEGIN
  FOREACH t IN ARRAY service_only LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      -- Belt and braces: strip the Data API roles' default table grants. RLS alone
      -- is the control, but a table with neither RLS nor a revoke is the exact
      -- shape this finding is about.
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
      RAISE NOTICE 'SEC-012: RLS enabled and Data API grants revoked on %', t;
    ELSE
      RAISE NOTICE 'SEC-012: table % not present, skipped', t;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------
-- Self-verify. Non-vacuous: asserts the actual relrowsecurity flag and the actual
-- privilege, not the mere existence of a policy row.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  service_only text[] := ARRAY[
    'referrals','referral_earnings','recruiter_payouts','partner_codes',
    'artist_referrals','fan_payouts','milestones','sync_opportunities',
    'cron_run_log','listening_history','crm_contacts','crm_lists',
    'crm_outreaches','crm_outreach_sends','crm_outreach_unsubscribes'
  ];
BEGIN
  FOREACH t IN ARRAY service_only LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', t)::regclass) THEN
        RAISE EXCEPTION 'MIGRATION FAILED: RLS is not enabled on public.% (SEC-012)', t;
      END IF;
      IF has_table_privilege('anon', format('public.%I', t), 'SELECT')
         OR has_table_privilege('anon', format('public.%I', t), 'INSERT') THEN
        RAISE EXCEPTION 'MIGRATION FAILED: anon still holds grants on public.% (SEC-012)', t;
      END IF;
    END IF;
  END LOOP;
  RAISE NOTICE 'SEC-012 verified: service-role-only money/CRM tables are RLS-enabled and revoked from the Data API roles.';
END $$;
