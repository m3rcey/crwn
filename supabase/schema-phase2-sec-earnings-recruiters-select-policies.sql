-- ============================================================================
-- SEC-012 follow-up — explicit least-privilege SELECT for `earnings` and `recruiters`
-- ============================================================================
-- Cybersecurity audit 2026-08-12, docs/CYBERSECURITY_AUDIT_2026-08-12.md
--
-- WHY THESE TWO WERE LEFT OUT OF schema-phase2-sec-012-money-table-rls-reproducibility.sql
-- That migration enabled RLS on 15 money/CRM tables that are reached ONLY through the
-- service role, where a bare "ENABLE ROW LEVEL SECURITY" with no policy is exactly right.
-- `earnings` and `recruiters` were excluded because a grep showed .tsx call sites, and a
-- bare enable there would have silently emptied an artist's own payouts screen. Authoring
-- their policies means deciding the intended read scope, which is what this migration does.
--
-- WHAT THIS IS AND IS NOT. It is a REPRODUCIBILITY fix, not a live-leak fix. Probed against
-- production with the public anon key on 2026-08-12:
--     GET /rest/v1/earnings?select=id&limit=1    -> HTTP 200  []
--     GET /rest/v1/recruiters?select=id&limit=1  -> HTTP 200  []
-- Empty arrays, not 42501, so RLS is demonstrably ON in the live database today and the
-- anon table grant is still in place. But that protection exists only inside that database.
-- No CREATE TABLE and no RLS statement for either table is in version control, so a branch
-- database, a PITR restore or a fresh environment comes up with them RLS-OFF and therefore
-- readable and writable by anyone holding the anon key, which ships in the client bundle.
--
-- ---------------------------------------------------------------------------------------
-- THE EVIDENCE BEHIND EACH POLICY
-- ---------------------------------------------------------------------------------------
-- `earnings` has exactly TWO browser readers (every other one of the ~45 call sites is a
-- service-role API route, cron or lib):
--
--   1. src/components/artist/PayoutDashboard.tsx:80
--        .from('earnings').select('*').eq('artist_id', <own artist_profiles.id>)
--      The artist's own payouts screen. Ownership is artist_profiles.user_id = auth.uid().
--
--   2. src/app/(main)/profile/notifications/page.tsx:41
--        .from('earnings').select('artist_id, artist:artist_profiles(...)').eq('fan_id', user.id)
--      A FAN listing the artists they have a money relationship with, so the per-artist
--      notification preference list includes one-time buyers and not only subscribers.
--      This is the fan's own transaction record.
--
-- So `earnings` needs two SELECT policies, and nothing else. There are ZERO browser writes
-- (all inserts are in src/lib/webhookHandlers.ts and sibling service-role paths), so
-- INSERT/UPDATE/DELETE are revoked from both Data API roles.
--
-- `recruiters` has ZERO browser call sites. The audit counted one because the grep was by
-- file extension: src/app/join/[code]/page.tsx IS a .tsx file, but it is a SERVER component
-- that reads through `supabaseAdmin`, built with SUPABASE_SERVICE_ROLE_KEY (lines 6-9), which
-- bypasses RLS entirely. Every other reader is an API route on the same client, and a
-- recruiter reads their own row through /api/recruit/dashboard, which derives identity from
-- the session and never from a caller-supplied id. `recruiters` therefore gets the same
-- treatment as the SEC-012 fifteen: RLS on, Data API grants revoked, and NO policy at all.
-- A recruiter row carries stripe_connect_id, total_earned, partner_flat_fee and
-- partner_recurring_rate; there is no read of it that belongs in a browser.
--
-- ---------------------------------------------------------------------------------------
-- WHY A SECURITY DEFINER HELPER AND NOT AN INLINE SUBQUERY
-- ---------------------------------------------------------------------------------------
-- artist_profiles has REVOKED columns (stripe_connect_id, platform_stripe_customer_id,
-- platform_stripe_subscription_id, is_approved). Naming one revoked column fails the WHOLE
-- statement with 42501, and that applies inside a policy expression too, so an inline
-- `EXISTS (SELECT 1 FROM artist_profiles ...)` policy is one future column revoke away from
-- 42501-ing every read of `earnings`. A SECURITY DEFINER function runs as its owner and is
-- immune to the caller's column privileges. This is the precedent set by
-- user_passes_artist_gate() and owns_subscription_tier(), and it is followed here on purpose.
--
-- EXECUTE is revoked FROM PUBLIC **and** BY NAME from anon. `REVOKE ... FROM PUBLIC` alone
-- does not remove Supabase's per-role grants, which is precisely the defect that left
-- check_rate_limit and redeem_invite anon-executable (SEC-002 / SEC-011).
--
-- ---------------------------------------------------------------------------------------
-- WHAT AN ARTIST / FAN / RECRUITER CAN READ AFTER THIS
-- ---------------------------------------------------------------------------------------
--   Artist (authenticated, from the browser): every column of every `earnings` row whose
--     artist_id belongs to an artist_profiles row they own. The payouts screen is unchanged.
--   Fan (authenticated, from the browser): `earnings` rows where fan_id = their own user id,
--     i.e. their own purchases and subscriptions. This is what the notification-preferences
--     page needs, and the row is a record of money they themselves paid.
--   Anyone (anon): NOTHING from either table. Both browser readers require a signed-in user,
--     so the anon grant has no legitimate consumer.
--   Recruiter: NOTHING directly. Their dashboard keeps working because
--     /api/recruit/dashboard reads with the service role after proving the session.
--   service_role: unchanged. It bypasses RLS, so every API route, cron and webhook is
--     untouched by this migration.
--
-- Idempotent. Restrictive-only: it adds no read that did not already have a real consumer,
-- and it removes grants and permissive policies. No data is rewritten.
--
-- ROLLBACK (do not do this casually: it reopens the Data API to a money ledger):
--   DROP POLICY IF EXISTS "Artists read own earnings" ON public.earnings;
--   DROP POLICY IF EXISTS "Fans read their own earning rows" ON public.earnings;
--   ALTER TABLE public.earnings DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.recruiters DISABLE ROW LEVEL SECURITY;
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------------------
-- Ownership oracle: does the CALLER own this artist profile?
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owns_artist_profile(p_artist_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.artist_profiles a
     WHERE a.id = p_artist_id
       AND a.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.owns_artist_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_artist_profile(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.owns_artist_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_artist_profile(uuid) TO service_role;

-- ---------------------------------------------------------------------------------------
-- earnings
-- ---------------------------------------------------------------------------------------
ALTER TABLE public.earnings ENABLE ROW LEVEL SECURITY;

-- Any USING(true) / WITH CHECK(true) policy reachable by a NON-service role would defeat
-- everything below, and neither table has a checked-in CREATE, so the repo cannot say what
-- is there. A policy scoped strictly TO service_role is harmless (service_role bypasses RLS
-- anyway) and is left alone. Same pattern as schema-phase2-money-ledger-rls.sql.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'earnings'
       AND (qual = 'true' OR with_check = 'true')
       AND roles <> ARRAY['service_role']::name[]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.earnings', pol.policyname);
    RAISE NOTICE 'Dropped permissive earnings policy % (was reachable by non-service roles)', pol.policyname;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Artists read own earnings" ON public.earnings;
CREATE POLICY "Artists read own earnings"
  ON public.earnings FOR SELECT
  TO authenticated
  USING (public.owns_artist_profile(artist_id));

DROP POLICY IF EXISTS "Fans read their own earning rows" ON public.earnings;
CREATE POLICY "Fans read their own earning rows"
  ON public.earnings FOR SELECT
  TO authenticated
  USING (fan_id = auth.uid());

-- Every earnings write is service-role (webhooks and API routes). A browser has never
-- written this table and must never be able to: this is the ledger that funds real payouts.
REVOKE INSERT, UPDATE, DELETE ON public.earnings FROM authenticated;
-- anon has no legitimate read: both browser readers gate on a signed-in user.
REVOKE ALL ON public.earnings FROM anon;

-- ---------------------------------------------------------------------------------------
-- recruiters
-- ---------------------------------------------------------------------------------------
ALTER TABLE public.recruiters ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'recruiters'
       AND (qual = 'true' OR with_check = 'true')
       AND roles <> ARRAY['service_role']::name[]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.recruiters', pol.policyname);
    RAISE NOTICE 'Dropped permissive recruiters policy % (was reachable by non-service roles)', pol.policyname;
  END LOOP;
END $$;

-- No policy: deny-all over the Data API, exactly like the SEC-012 service-role-only tables.
REVOKE ALL ON public.recruiters FROM anon;
REVOKE ALL ON public.recruiters FROM authenticated;

COMMIT;

-- ---------------------------------------------------------------------------------------
-- Self-verify. Every assertion is a PRIVILEGE or a relrowsecurity fact, never "a policy row
-- exists": the superuser running this in the SQL editor satisfies a mere-existence check
-- vacuously, which is how 64 migrations in this repo verify nothing at all.
-- ---------------------------------------------------------------------------------------
DO $$
BEGIN
  -- 1) RLS actually on.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.earnings'::regclass) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: RLS is not enabled on public.earnings';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.recruiters'::regclass) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: RLS is not enabled on public.recruiters';
  END IF;

  -- 2) The Data API roles hold nothing they should not.
  IF has_table_privilege('anon', 'public.earnings', 'SELECT')
     OR has_table_privilege('anon', 'public.earnings', 'INSERT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon still holds grants on public.earnings';
  END IF;
  IF has_table_privilege('authenticated', 'public.earnings', 'INSERT')
     OR has_table_privilege('authenticated', 'public.earnings', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.earnings', 'DELETE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: authenticated can still write public.earnings';
  END IF;
  IF has_table_privilege('anon', 'public.recruiters', 'SELECT')
     OR has_table_privilege('authenticated', 'public.recruiters', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: a Data API role still holds SELECT on public.recruiters';
  END IF;

  -- 3) The artist's own payouts screen must still work. This is the regression the SEC-012
  --    migration refused to risk, so it is asserted rather than assumed: `authenticated`
  --    keeps SELECT on the table, and can execute the ownership oracle the policy calls.
  IF NOT has_table_privilege('authenticated', 'public.earnings', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: authenticated lost SELECT on earnings, so PayoutDashboard would render empty';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.owns_artist_profile(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: authenticated cannot execute owns_artist_profile, so the artist earnings policy would deny every row';
  END IF;
  IF has_function_privilege('anon', 'public.owns_artist_profile(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon can execute owns_artist_profile (REVOKE FROM PUBLIC does not remove a role grant)';
  END IF;

  -- 4) No permissive policy survived on either table.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('earnings', 'recruiters')
       AND (qual = 'true' OR with_check = 'true')
       AND roles <> ARRAY['service_role']::name[]
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: a permissive policy still exposes earnings or recruiters to non-service roles';
  END IF;

  -- 5) recruiters must have NO policy reachable by a Data API role. With the grants revoked
  --    this is belt and braces, but a future GRANT would otherwise silently reopen it.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'recruiters'
       AND ('anon' = ANY(roles) OR 'authenticated' = ANY(roles) OR '-' = ANY(roles) OR 'public' = ANY(roles))
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: recruiters has a policy reachable by anon/authenticated/PUBLIC';
  END IF;

  RAISE NOTICE 'earnings + recruiters verified: RLS on, Data API grants least-privilege, artist and fan reads preserved.';
END $$;
