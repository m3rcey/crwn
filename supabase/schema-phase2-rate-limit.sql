-- Rate limiting: the table and the function behind checkRateLimit() in src/lib/rateLimit.ts
--
-- WHY THIS FILE EXISTS
-- check_rate_limit() has been running in production for months with NO checked-in
-- definition. It works, so nothing complains, but it cannot be rebuilt: a fresh database
-- (a branch, a restore, a new environment) comes up without it, and then EVERY rate-limited
-- route fails CLOSED. That is the safe direction, and it is also every public form on the
-- site returning 429 to the first visitor who touches it: /api/support, /api/partner/apply,
-- the lead magnets, the whole acquisition surface.
--
-- NON-DESTRUCTIVE ON PURPOSE
-- The live function is not readable from here, so this migration must not assume it knows
-- what it says. It CREATES ONLY WHAT IS MISSING. If check_rate_limit() already exists, its
-- body is left exactly as it is and only the assertions below run. Rewriting a working
-- limiter with a reconstruction of itself is how you turn a documentation gap into an
-- outage. Applying this to production should therefore change nothing at all.

-- ---------------------------------------------------------------------------------------
-- 1. The bucket table
-- ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  action      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The only query the limiter runs: "how many times has this key done this action lately".
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON public.rate_limits (user_id, action, created_at DESC);

-- No policies, deliberately. Nothing may reach this table with the anon key: it is written
-- only by the SECURITY DEFINER function below and by the service role. RLS on with zero
-- policies means "deny everyone", which is the correct posture for a limiter (a fan who can
-- DELETE from it has no rate limit).
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.rate_limits FROM anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- 2. The limiter
-- ---------------------------------------------------------------------------------------
-- p_user_id is a uuid. Unauthenticated callers have no user id, so src/lib/rateLimit.ts
-- hashes their key ("ip:1.2.3.4") into a stable uuid before calling. Do not widen this to
-- text to accommodate them: that hash is what keeps one limiter and one bucket per key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'check_rate_limit'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.check_rate_limit(
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
        -- Sweep buckets far older than this window so the table cannot grow without bound.
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
    $fn$;

    RAISE NOTICE 'check_rate_limit() was MISSING and has been created.';
  ELSE
    RAISE NOTICE 'check_rate_limit() already exists. Left untouched.';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------------------
-- 3. Self-verify. A partial apply must fail LOUDLY here, not silently half-land.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  v_allowed boolean;
  v_denied  boolean;
  v_key     uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rate_limits') THEN
    RAISE EXCEPTION 'rate_limits table is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'check_rate_limit'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, text, integer, integer'
  ) THEN
    RAISE EXCEPTION 'check_rate_limit(uuid, text, integer, integer) is missing. rateLimit.ts calls exactly this signature, so every rate-limited route would fail closed.';
  END IF;

  -- Prove it actually limits, rather than merely existing: a max of 1 must allow the first
  -- call and deny the second. A limiter that always returns true is the same as no limiter.
  SELECT public.check_rate_limit(v_key, 'self_verify', 60, 1) INTO v_allowed;
  SELECT public.check_rate_limit(v_key, 'self_verify', 60, 1) INTO v_denied;

  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'check_rate_limit denied the FIRST request under a limit of 1. Every public form would 429 on first use.';
  END IF;

  IF v_denied IS NOT FALSE THEN
    RAISE EXCEPTION 'check_rate_limit allowed a SECOND request under a limit of 1. It is not limiting anything.';
  END IF;

  DELETE FROM public.rate_limits WHERE user_id = v_key;

  RAISE NOTICE 'rate limit OK: allows under the cap, denies over it.';
END $$;
