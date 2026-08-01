-- ============================================================
-- Clear "phantom" platform plans: a paid tier with nothing billing behind it
-- ============================================================
-- Found 2026-08-01: artist `m3rcey` reads platform_tier = 'pro' and
-- platform_subscription_status = 'active', while live Stripe has NO platform
-- subscription for them at all (the only platform subscription on the account is
-- a fan's $10 tier). That row claims to be paying and is not.
--
-- Why it matters beyond cosmetics:
--   * Manage Subscription opens the billing portal by customer id and errors.
--   * Cancel 404s, because platform_stripe_subscription_id is null.
--   * The plan picker renders Pro as "Your current plan" and disables it, so the
--     account can never START actually paying.
--   * Plan limits treat them as Pro forever, for free.
--
-- How a row gets here: a partner-code trial that completed without payment, a
-- test-mode webhook, or a subscription deleted in Stripe whose
-- customer.subscription.deleted event could not be matched by id (every platform
-- webhook handler looks the artist up by platform_stripe_subscription_id and
-- returns early on a miss).
--
-- THE PREDICATE IS DELIBERATELY NARROW: a paid tier with a NULL
-- platform_stripe_subscription_id. If the id is present, some subscription really
-- was created and this migration will not touch it, because deciding whether that
-- subscription is still live requires asking Stripe, which SQL cannot do.
--
-- IF YOU INTENDED A COMP: this clears it. Comp an artist with a 100% off coupon
-- on a real Stripe subscription instead of a bare DB flag, so every surface
-- (portal, cancel, webhooks, limits) keeps working. To re-set one by hand:
--   UPDATE artist_profiles SET platform_tier = 'pro' WHERE slug = 'your-slug';

-- NOTE: there is no companion UPDATE on profiles. An earlier draft of this file
-- had one and failed with 42703: `profiles.platform_tier` DOES NOT EXIST in
-- production (schema-platform-tiers.sql declares it but was never applied). The
-- app wrote to it in three places, all of which failed silently because
-- supabase-js returns an error object instead of throwing, and NOTHING ever read
-- it. Those writes are now deleted. artist_profiles is the single source of truth.

BEGIN;

UPDATE artist_profiles
   SET platform_tier = 'starter',
       platform_subscription_status = NULL
 WHERE platform_tier IS NOT NULL
   AND platform_tier <> 'starter'
   AND platform_stripe_subscription_id IS NULL;

COMMIT;

-- ============================================================
-- Self-verify: no paid plan may remain without a subscription id behind it.
-- ============================================================
DO $$
DECLARE
  phantoms INTEGER;
BEGIN
  SELECT COUNT(*) INTO phantoms
    FROM artist_profiles
   WHERE platform_tier IS NOT NULL
     AND platform_tier <> 'starter'
     AND platform_stripe_subscription_id IS NULL;

  IF phantoms > 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: % artist(s) still claim a paid plan with no subscription id', phantoms;
  END IF;

  RAISE NOTICE 'schema-phase2-reconcile-phantom-platform-plans: OK';
END $$;
