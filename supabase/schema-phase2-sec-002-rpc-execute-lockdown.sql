-- ============================================================================
-- SEC-002 / SEC-011 / V13 — RPC EXECUTE lockdown + defensive argument validation
-- ============================================================================
-- Cybersecurity audit 2026-08-12, docs/CYBERSECURITY_AUDIT_2026-08-12.md
--
-- THE BUG (why REVOKE ... FROM PUBLIC was not enough):
-- Supabase bootstraps the project with
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
-- Those are grants held BY ROLE NAME. `REVOKE ALL ... FROM PUBLIC` removes the
-- PUBLIC pseudo-role grant and leaves the per-role grants untouched, so a
-- function that looks locked in its migration is still callable by anon through
-- PostgREST. Every revoke below therefore names anon and authenticated
-- EXPLICITLY. This is the single most repeatable mistake in this schema.
--
-- Proven in production (read-only, GET forces a READ ONLY transaction, so the
-- function reached its write and rolled back rather than mutating):
--   GET /rest/v1/rpc/check_rate_limit -> 25006 "cannot execute DELETE in a read-only transaction"
--   GET /rest/v1/rpc/redeem_invite    -> 25006 "cannot execute UPDATE in a read-only transaction"
-- A 25006 means the privilege check PASSED. A locked function answers 42501
-- (as atomic_fan_cashout correctly did).
--
-- IMPACT OF check_rate_limit BEING ANON-CALLABLE:
--   1. p_window_seconds is caller-supplied and feeds
--        DELETE ... WHERE created_at < now() - make_interval(secs => p_window_seconds * 10)
--      A NEGATIVE window makes that bound a FUTURE timestamp, so the predicate
--      matches every row and one unauthenticated call TRUNCATES rate_limits —
--      disabling the only abuse control in front of signup, support, the lead
--      magnets, and every AI/email cost path.
--   2. p_user_id is caller-supplied, so an attacker can pre-fill any victim's
--      bucket (or any IP bucket: the key is a public sha256 of `ip:<addr>`) and
--      429 them out of the product.
--
-- CALLER TRACE DONE BEFORE REVOKING (this is why the revoke is safe):
--   check_rate_limit -> ONLY src/lib/rateLimit.ts, via the SERVICE-ROLE client.
--   redeem_invite    -> ONLY src/app/api/invite/redeem/route.ts, service-role.
--   Neither is ever called from the browser, so anon/authenticated need no grant.
--   toggle_favorite / toggle_like ARE called from the browser
--   (src/hooks/usePlayer.tsx, src/components/community/PostCard.tsx), so they
--   KEEP their `authenticated` grant and lose only `anon` — revoking
--   authenticated there would break favorites and likes.
--
-- Idempotent and safe to re-run. Additive/restrictive only: no data is rewritten.
-- ROLLBACK: re-GRANT EXECUTE to the named roles (see the bottom of this file).
-- ============================================================================

-- ---------------------------------------------------------------------------------------
-- 1. check_rate_limit: validate arguments so a DIRECT invocation is still safe.
-- ---------------------------------------------------------------------------------------
-- Defence in depth: the revoke below is the real control, but a SECURITY DEFINER
-- function must not be destructible by its own arguments even if some future
-- caller (or a re-grant) reaches it. Real callers pass windows of 60..86400 and
-- max_requests of 1..300, so these bounds reject only nonsense.
--
-- CREATE OR REPLACE preserves the existing ACL, so the grants are re-stated in
-- section 2 regardless.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id        uuid,
  p_action         text,
  p_window_seconds integer,
  p_max_requests   integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_count integer;
BEGIN
  -- Reject destructive / nonsensical arguments LOUDLY. checkRateLimit() in the
  -- application treats an RPC error as "denied" (fails closed), so a bad call
  -- can never accidentally become "allowed".
  IF p_window_seconds IS NULL OR p_window_seconds <= 0 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'check_rate_limit: p_window_seconds must be between 1 and 86400 (got %)', p_window_seconds
      USING ERRCODE = '22023';
  END IF;

  IF p_max_requests IS NULL OR p_max_requests < 0 OR p_max_requests > 100000 THEN
    RAISE EXCEPTION 'check_rate_limit: p_max_requests must be between 0 and 100000 (got %)', p_max_requests
      USING ERRCODE = '22023';
  END IF;

  IF p_user_id IS NULL OR p_action IS NULL OR length(p_action) > 100 THEN
    RAISE EXCEPTION 'check_rate_limit: p_user_id and p_action are required, p_action <= 100 chars'
      USING ERRCODE = '22023';
  END IF;

  -- Sweep buckets far older than this window so the table cannot grow without
  -- bound. With p_window_seconds now guaranteed positive, this bound is always
  -- in the PAST and can never match live rows.
  DELETE FROM public.rate_limits
   WHERE created_at < now() - make_interval(secs => p_window_seconds * 10);

  SELECT count(*) INTO v_count
    FROM public.rate_limits
   WHERE user_id = p_user_id
     AND action = p_action
     AND created_at > now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_max_requests THEN
    RETURN false;   -- denied
  END IF;

  INSERT INTO public.rate_limits (user_id, action) VALUES (p_user_id, p_action);
  RETURN true;      -- allowed
END;
$body$;

-- ---------------------------------------------------------------------------------------
-- 2. Revoke EXECUTE from the Data API roles BY NAME.
-- ---------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) TO service_role;

-- SEC-011: redeem_invite burns invite-code uses and sets profiles.is_approved.
-- Service-role only; the browser never calls it.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'redeem_invite'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    RAISE NOTICE 'SEC-011: locked down %', r.sig;
  END LOOP;
END $$;

-- V11: user_passes_artist_gate(uuid) has the SAME defect. Its migration
-- (schema-phase2-fix-profiles-update-permission.sql line 122) does
-- `REVOKE ALL ON FUNCTION ... FROM PUBLIC` and stops, so anon and authenticated
-- keep their default grants. It also honours a CALLER-SUPPLIED p_user, which the
-- entitlement-oracle fix removed from can_play_track and can_read_community_post
-- but never reached here. It is a SECURITY DEFINER read of the approval gate, so
-- leaving it callable lets anyone probe whether an arbitrary account is approved.
-- Only the RLS INSERT policy on artist_profiles needs it, and policy evaluation
-- does not require the caller to hold EXECUTE.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'user_passes_artist_gate'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    RAISE NOTICE 'V11: locked down %', r.sig;
  END LOOP;
END $$;

-- V13: toggle_favorite / toggle_like are DELIBERATELY browser-callable. They keep
-- `authenticated` and lose `anon` only: an anonymous visitor has no account to
-- favorite or like with, so anon EXECUTE is pure attack surface.
-- NOTE: these two functions have no CREATE migration in this repo (they exist
-- only in production), so their bodies are NOT hardened here. The audit found
-- toggle_favorite trusts a caller-supplied p_user_id, which lets one authenticated
-- user favorite on behalf of another. That is LOW severity (favorites), and fixing
-- it requires dumping the live body first — tracked in TODO.md, not guessed at here.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('toggle_favorite', 'toggle_like')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    RAISE NOTICE 'V13: anon revoked, authenticated preserved on %', r.sig;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------
-- 3. Self-verify. NON-VACUOUS: has_function_privilege answers the real ACL, unlike
--    a pg_policies existence check, which passes vacuously for a superuser.
-- ---------------------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.check_rate_limit(uuid, text, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon can still EXECUTE check_rate_limit';
  END IF;
  IF has_function_privilege('authenticated', 'public.check_rate_limit(uuid, text, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: authenticated can still EXECUTE check_rate_limit';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.check_rate_limit(uuid, text, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: service_role LOST EXECUTE on check_rate_limit — every rate limit would fail closed and 429 real users';
  END IF;
  RAISE NOTICE 'SEC-002 verified: check_rate_limit is service_role only.';
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'redeem_invite'
  LOOP
    IF has_function_privilege('anon', r.sig, 'EXECUTE')
       OR has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'MIGRATION FAILED: % still executable by anon/authenticated', r.sig;
    END IF;
  END LOOP;
END $$;

-- Argument validation must actually reject a negative window.
DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.check_rate_limit(
      '00000000-0000-0000-0000-000000000000'::uuid, 'sec002-selfverify', -1000000, 5);
  EXCEPTION WHEN OTHERS THEN
    v_ok := true;   -- rejected, as required
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'MIGRATION FAILED: check_rate_limit accepted a negative p_window_seconds (the table-truncation vector is still open)';
  END IF;
  RAISE NOTICE 'SEC-002 verified: negative window rejected.';
END $$;

-- ============================================================================
-- ROLLBACK (only if the application starts 429ing every user, which would mean
-- service_role somehow lost the grant — re-run section 2's GRANT line):
--   GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) TO service_role;
-- Do NOT roll back by re-granting anon/authenticated: that reopens SEC-002.
-- ============================================================================
