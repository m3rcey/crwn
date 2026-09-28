-- ─────────────────────────────────────────────────────────────────────────────
-- The browser can create an artist page again, without reopening the V11 hole.
-- (2026-09-28)
--
-- WHAT BROKE: schema-phase2-sec-002-rpc-execute-lockdown.sql (V11, 2026-08-12)
-- revoked EXECUTE on user_passes_artist_gate(uuid) from anon and authenticated.
-- Its comment reasoned that "policy evaluation does not require the caller to hold
-- EXECUTE". That is false: a function referenced in an RLS policy expression is
-- permission-checked as the QUERYING role, and the check happens at executor start,
-- so the `NOT artist_gate_enabled() OR ...` short-circuit does not save it. Every
-- browser-side artist_profiles INSERT has answered
--   42501 permission denied for function user_passes_artist_gate
-- since then. The daily onboarding canary reproduced exactly that.
-- The setup wizard was NOT affected: it creates the page with the service role in
-- /api/onboarding/identity, which bypasses RLS.
--
-- WHY NOT JUST RE-GRANT: V11 was right about the function. It honours a
-- CALLER-SUPPLIED p_user, so granting it back lets any signed-in user ask
-- "is account X approved?" for any X.
--
-- FIX: a zero-argument twin that reads auth.uid() itself. It can only ever answer
-- about the caller, so granting it to authenticated discloses nothing the caller
-- does not already know about themselves. The policy switches to it. The old
-- function stays in place and stays locked (service_role only).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.current_user_passes_artist_gate()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (p.is_approved = true OR p.role = 'admin')
  );
$$;

-- Supabase grants new functions to anon and authenticated BY NAME, so revoking
-- PUBLIC alone leaves them callable (SEC-002). Revoke all three, then grant back
-- exactly who needs it: authenticated (the RLS policy runs as them) and service_role.
REVOKE ALL ON FUNCTION public.current_user_passes_artist_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_passes_artist_gate() FROM anon;
REVOKE ALL ON FUNCTION public.current_user_passes_artist_gate() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_passes_artist_gate() TO authenticated, service_role;

DROP POLICY IF EXISTS "Gated artist profile insert" ON public.artist_profiles;
CREATE POLICY "Gated artist profile insert"
  ON public.artist_profiles FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      NOT artist_gate_enabled()
      OR public.current_user_passes_artist_gate()
    )
  );

COMMIT;

-- ============================================================
-- Self-verify (after COMMIT so a bug here cannot undo a correct fix).
-- Asserts the ACTUAL privileges, not that the statements ran.
DO $$
BEGIN
  IF to_regprocedure('public.current_user_passes_artist_gate()') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: current_user_passes_artist_gate() is missing';
  END IF;

  -- The policy runs as authenticated, so both functions it names must be executable by it.
  IF NOT has_function_privilege('authenticated', 'public.current_user_passes_artist_gate()', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: authenticated cannot EXECUTE current_user_passes_artist_gate() (the publish insert would still 42501)';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.artist_gate_enabled()', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: authenticated cannot EXECUTE artist_gate_enabled() (the publish insert would still 42501)';
  END IF;

  -- anon has no account, so it has no business calling this.
  IF has_function_privilege('anon', 'public.current_user_passes_artist_gate()', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon can still EXECUTE current_user_passes_artist_gate()';
  END IF;

  -- V11 must stay closed: the caller-supplied-uuid version is the probing oracle.
  IF has_function_privilege('authenticated', 'public.user_passes_artist_gate(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.user_passes_artist_gate(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: user_passes_artist_gate(uuid) is callable by a Data API role again (V11 reopened)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'artist_profiles'
       AND cmd = 'INSERT'
       AND policyname = 'Gated artist profile insert'
       AND coalesce(with_check, '') LIKE '%current_user_passes_artist_gate()%'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: gated INSERT policy missing or not using current_user_passes_artist_gate()';
  END IF;

  RAISE NOTICE 'schema-phase2-artist-gate-caller-only: OK (browser artist publish allowed again; V11 still closed)';
END $$;
