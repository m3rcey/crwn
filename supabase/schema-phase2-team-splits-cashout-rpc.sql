-- ============================================================================
-- schema-phase2-team-splits-cashout-rpc.sql
-- Collaborator cashout RPC for Team Splits — the exact analogue of
-- atomic_fan_cashout (schema-phase2-attribution-hardening.sql), but summing
-- team_split_earnings instead of referral_earnings so the two balances NEVER
-- co-mingle.
-- ============================================================================
-- A team_split_earnings row is cashable only when ALL of:
--   * released_at IS NOT NULL   -> the artist has released it (manual-release v1)
--   * cleared_at <= now()       -> the refund hold has passed
--   * status NOT IN ('reversed','disputed')  -> not clawed back / frozen
-- Negative rows (clawbacks) always count (they REDUCE the balance) regardless of
-- release/hold, matching the referral clawback convention.
--
-- Requires: schema-phase2-team-splits.sql (team_split_earnings, team_split_payouts).
-- Locked to the service role (REVOKE) exactly like atomic_fan_cashout — the only
-- caller is /api/stripe/team-split-cashout under the authenticated user.
--
-- Apply manually in the Supabase SQL Editor. Self-verify block at the tail.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.atomic_team_split_cashout(
  p_collaborator_id uuid,
  p_min_amount integer DEFAULT 2500
)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_total_earned INTEGER; v_total_paid INTEGER; v_available INTEGER; v_payout_id UUID;
BEGIN
  -- Serialize concurrent cashouts for the same collaborator.
  PERFORM pg_advisory_xact_lock(hashtext('team_split_cashout:' || p_collaborator_id::text));

  -- Sum released + cleared positive accruals; clawbacks (negative rows) always
  -- reduce the balance. Reversed/disputed positive rows are excluded.
  SELECT COALESCE(SUM(commission_amount), 0) INTO v_total_earned
  FROM team_split_earnings
  WHERE collaborator_user_id = p_collaborator_id
    AND status NOT IN ('reversed','disputed')
    AND (
      commission_amount < 0
      OR (released_at IS NOT NULL AND cleared_at <= now())
    );

  -- Reserve both completed AND pending payouts (prevents a double cashout race).
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM team_split_payouts
  WHERE collaborator_user_id = p_collaborator_id AND status IN ('completed','pending');

  v_available := v_total_earned - v_total_paid;
  IF v_available < p_min_amount THEN RETURN NULL; END IF;

  INSERT INTO team_split_payouts (collaborator_user_id, amount, status)
  VALUES (p_collaborator_id, v_available, 'pending')
  RETURNING id INTO v_payout_id;
  RETURN v_payout_id;
END;
$function$;

-- Lockdown: revoke default EXECUTE from anon/authenticated; service role only.
REVOKE EXECUTE ON FUNCTION public.atomic_team_split_cashout(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_team_split_cashout(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atomic_team_split_cashout(uuid, integer) FROM authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.atomic_team_split_cashout(uuid,integer)') IS NULL THEN
    RAISE EXCEPTION 'team-splits: atomic_team_split_cashout is missing';
  END IF;
  IF has_function_privilege('authenticated', 'public.atomic_team_split_cashout(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'team-splits: atomic_team_split_cashout still EXECUTE-able by authenticated (lockdown failed)';
  END IF;
  IF has_function_privilege('anon', 'public.atomic_team_split_cashout(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'team-splits: atomic_team_split_cashout still EXECUTE-able by anon (lockdown failed)';
  END IF;
  RAISE NOTICE 'team-splits: cashout RPC present and locked to service role';
END $$;

COMMIT;
