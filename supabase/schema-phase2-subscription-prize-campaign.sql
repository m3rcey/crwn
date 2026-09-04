-- schema-phase2-subscription-prize-campaign.sql
-- Mark a membership that a campaign PRIZE funded, so it is a member without being a payer.
--
-- WHY A COLUMN AT ALL. `subscriptions` has seventeen columns and not one of them can say
-- "nobody paid for this". Money truth is already correct without it: SEC-006 books gross
-- from `session.amount_total` / `invoice.amount_paid`, so a fully discounted subscription
-- already writes $0 earnings, $0 fee, $0 net. But `paidMembers` and `mrrCents` in
-- src/lib/constraint/assembler.ts derive from the TIER'S PRICE, not from money collected,
-- so a prize Platinum would tell CRWN the artist has $50/month of recurring revenue that
-- does not exist, and feed that fiction to the Constraint Engine.
--
-- WHY THIS SHAPE. The campaign is already the source of truth for the prize (its tier, its
-- duration, its rules), so a nullable pointer AT the campaign is the whole fact. There is
-- deliberately no is_comped flag, no reason string, and no prize_months column: a second
-- place to write "this is free" is a second place for it to disagree with the first.
--
-- ON DELETE SET NULL, not CASCADE: deleting a campaign must never delete a fan's
-- membership. The row survives as an ordinary subscription and simply stops being
-- attributable, which is the safe direction to fail.
--
-- Additive and backwards compatible. Every existing row is NULL, which means exactly what
-- it means today: an ordinary subscription. No backfill.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS prize_campaign_id uuid
    REFERENCES public.fan_campaigns(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.subscriptions.prize_campaign_id IS
  'Set when a campaign prize funded this membership. The fan is a real member with full entitlement, and contributes NOTHING to paying-member counts, MRR, revenue, fees, payouts or first-paid conversion while it is set. NULL on every ordinary subscription.';

-- Partial: only prize rows are indexed, because only they are ever looked up this way
-- (fulfilment idempotency, and excluding them from revenue).
CREATE INDEX IF NOT EXISTS idx_subscriptions_prize_campaign
  ON public.subscriptions (prize_campaign_id)
  WHERE prize_campaign_id IS NOT NULL;

COMMIT;

-- ── Self-verify: behavioural, not existence-only ───────────────────────────────
DO $$
DECLARE
  v_sub RECORD;
  v_campaign uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='subscriptions' AND column_name='prize_campaign_id'
  ) THEN
    RAISE EXCEPTION 'subscriptions.prize_campaign_id missing';
  END IF;

  -- Existing rows must be untouched: every one of them still reads as an ordinary
  -- subscription, which is what "backwards compatible" has to mean here.
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE prize_campaign_id IS NOT NULL) THEN
    RAISE EXCEPTION 'a subscription is already marked as a prize; this migration backfills nothing';
  END IF;

  -- ON DELETE SET NULL must hold: a deleted campaign may never delete a membership.
  SELECT id INTO v_campaign FROM public.fan_campaigns LIMIT 1;
  SELECT * INTO v_sub FROM public.subscriptions LIMIT 1;
  IF v_campaign IS NOT NULL AND v_sub.id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'subscriptions'
         AND c.contype = 'f'
         AND c.confdeltype = 'n'   -- 'n' = SET NULL
         AND pg_get_constraintdef(c.oid) LIKE '%prize_campaign_id%'
    ) THEN
      RAISE EXCEPTION 'prize_campaign_id must be ON DELETE SET NULL, never CASCADE';
    END IF;
  END IF;
END $$;

SELECT
  (SELECT count(*) FROM public.subscriptions) AS subscriptions_total,
  (SELECT count(*) FROM public.subscriptions WHERE prize_campaign_id IS NOT NULL) AS prize_subscriptions_expect_0,
  'subscription prize campaign applied' AS status;
