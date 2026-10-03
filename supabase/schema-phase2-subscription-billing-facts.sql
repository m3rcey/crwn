-- ============================================================
-- What Stripe actually bills each membership (2026-10-03)
-- ============================================================
-- WHY. Every MRR figure (Artist Home, Analytics, the Constraint Engine, the Revenue Ramp bar)
-- counted each paying member at the tier's MONTHLY list price. An annual member pays a discounted
-- year up front: Prince Dre's annual Platinum is $444 a year, $37 a month, and was counted as $50.
-- Annual is the default on his checkout, so the first annual sale would have overstated his MRR.
--
-- WHAT. Two raw facts copied from Stripe's own price object by the webhook, never typed by anyone:
--   subscriptions.billing_interval     'month' | 'year'
--   subscriptions.billed_amount_cents  the recurring price Stripe bills per interval
-- src/lib/analytics/recurringValue.ts turns them into a monthly value (annual / 12). A row without
-- them (every row before this) falls back to the tier price, which is exactly today's number.
--
-- SAFETY.
--   * Additive, nullable columns. Nothing that grants access reads them; can_play_track and every
--     entitlement path read tier_id and status only.
--   * A trigger freezes both against the browser roles (the supporter-number pattern): a fan who
--     can update their own row cannot rewrite what an artist's books say they pay. Only the
--     service role (the Stripe webhook) writes them.
--   * No backfill: production had zero live paying memberships on 2026-10-03 (read-only probe:
--     the two paid rows are m3rcey test rows that live Stripe answers resource_missing). New
--     memberships are recorded at checkout and on every customer.subscription.updated.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_interval text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billed_amount_cents integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_billing_interval_check') THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_billing_interval_check
      CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_billed_amount_cents_check') THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_billed_amount_cents_check
      CHECK (billed_amount_cents IS NULL OR billed_amount_cents >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.subscriptions.billing_interval IS
  'Stripe price recurring interval for this membership (month | year). Written by the webhook only. MRR = billed_amount_cents, or billed_amount_cents / 12 for year (recurringValue.ts).';
COMMENT ON COLUMN public.subscriptions.billed_amount_cents IS
  'Recurring price Stripe bills per interval, in cents, before discount codes. Written by the webhook only. NULL = not recorded; readers fall back to the tier price.';

-- Freeze against the browser roles: an INSERT from a browser carries no billing facts, and an
-- UPDATE from a browser keeps whatever the webhook wrote.
CREATE OR REPLACE FUNCTION public.freeze_subscription_billing_facts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.billing_interval := NULL;
      NEW.billed_amount_cents := NULL;
    ELSE
      NEW.billing_interval := OLD.billing_interval;
      NEW.billed_amount_cents := OLD.billed_amount_cents;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_subscription_billing_facts ON public.subscriptions;
CREATE TRIGGER trg_freeze_subscription_billing_facts
  BEFORE INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_subscription_billing_facts();

COMMIT;

-- ============================================================
-- Self-verify
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'billing_interval') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: subscriptions.billing_interval missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'billed_amount_cents') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: subscriptions.billed_amount_cents missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_billing_interval_check') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: billing_interval CHECK missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_billed_amount_cents_check') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: billed_amount_cents CHECK missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_freeze_subscription_billing_facts'
       AND tgrelid = 'public.subscriptions'::regclass
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: trg_freeze_subscription_billing_facts missing (a fan could rewrite what they pay)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'freeze_subscription_billing_facts'
       AND prosecdef
       AND 'search_path=public' = ANY(COALESCE(proconfig, ARRAY[]::text[]))
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: freeze_subscription_billing_facts() lost SECURITY DEFINER or its pinned search_path';
  END IF;
  RAISE NOTICE 'schema-phase2-subscription-billing-facts: OK';
END $$;
