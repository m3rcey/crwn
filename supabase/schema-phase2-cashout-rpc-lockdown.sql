-- schema-phase2-cashout-rpc-lockdown.sql
-- Lock down atomic_fan_cashout(uuid,integer). It is SECURITY DEFINER and is only ever
-- called by the SERVICE-ROLE client in /api/stripe/fan-cashout (src/app/api/stripe/
-- fan-cashout/route.ts). Supabase grants EXECUTE on public functions to anon/authenticated
-- by default. Combined with the pending-payout reservation added in
-- schema-phase2-attribution-hardening.sql (available balance now subtracts pending payouts),
-- an authenticated user could call
--     supabase.rpc('atomic_fan_cashout', { p_fan_id: <any fan>, p_min_amount: 0 })
-- and insert a 'pending' fan_payouts row for ANY fan, freezing that fan's cashout balance
-- (nothing but the API's own flow ever completes a payout). Revoke public execute so only
-- the service role can call it.
-- Apply manually in the Supabase SQL Editor.
-- ROLLBACK: GRANT EXECUTE ON FUNCTION public.atomic_fan_cashout(uuid, integer) TO authenticated, anon;
BEGIN;

REVOKE EXECUTE ON FUNCTION public.atomic_fan_cashout(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_fan_cashout(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atomic_fan_cashout(uuid, integer) FROM authenticated;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.atomic_fan_cashout(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: authenticated can still EXECUTE atomic_fan_cashout';
  END IF;
  IF has_function_privilege('anon', 'public.atomic_fan_cashout(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: anon can still EXECUTE atomic_fan_cashout';
  END IF;
  RAISE NOTICE 'OK: atomic_fan_cashout locked to service role';
END $$;

COMMIT;
