-- schema-phase2-attribution-hardening.sql
-- Phase 1: payout hold + clawback support + cashout concurrency hardening.
-- ROLLBACK: restore the original atomic_fan_cashout body (subtract only 'completed',
--   no advisory lock, no cleared_at filter) and: ALTER TABLE referral_earnings DROP COLUMN cleared_at;
BEGIN;

ALTER TABLE referral_earnings
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz NOT NULL DEFAULT now();
UPDATE referral_earnings SET cleared_at = created_at WHERE cleared_at > created_at;

CREATE OR REPLACE FUNCTION public.atomic_fan_cashout(p_fan_id uuid, p_min_amount integer DEFAULT 2500)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_total_earnings INTEGER; v_total_paid INTEGER; v_available INTEGER; v_payout_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fan_cashout:' || p_fan_id::text));

  SELECT COALESCE(SUM(commission_amount), 0) INTO v_total_earnings
  FROM referral_earnings
  WHERE referrer_fan_id = p_fan_id AND cleared_at <= now();

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM fan_payouts
  WHERE fan_id = p_fan_id AND status IN ('completed','pending');

  v_available := v_total_earnings - v_total_paid;
  IF v_available < p_min_amount THEN RETURN NULL; END IF;

  INSERT INTO fan_payouts (fan_id, amount, status) VALUES (p_fan_id, v_available, 'pending')
  RETURNING id INTO v_payout_id;
  RETURN v_payout_id;
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='referral_earnings' AND column_name='cleared_at')
    THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: referral_earnings.cleared_at missing'; END IF;
  IF to_regprocedure('public.atomic_fan_cashout(uuid,integer)') IS NULL
    THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: atomic_fan_cashout missing'; END IF;
  RAISE NOTICE 'OK: attribution-hardening applied';
END $$;

COMMIT;
