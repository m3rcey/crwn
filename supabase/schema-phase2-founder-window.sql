-- Founder Window (lightweight).
--
-- A subscription tier can run a limited FOUNDING WINDOW: a spot cap and/or a join deadline.
-- Anyone who subscribes while the window is open is permanently marked is_founder, so they can be
-- recognized as founding supporters forever. Checkout enforces the cap and deadline. There is NO
-- grandfathered pricing in this phase (that touches Stripe subscription pricing and is deferred).
--
-- SAFE BEFORE THIS RUNS: the app only reads/writes these columns when founder_window_enabled is
-- true, which cannot happen until the column exists, so the pre-migration app is inert here.

ALTER TABLE public.subscription_tiers
  ADD COLUMN IF NOT EXISTS founder_window_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founder_cap integer,        -- max founding spots; null = no cap
  ADD COLUMN IF NOT EXISTS founder_deadline timestamptz; -- window closes at this time; null = no deadline

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT false;

-- Counting active founders for the cap runs on every checkout to a founder-window tier. Index it.
CREATE INDEX IF NOT EXISTS idx_subscriptions_founder
  ON public.subscriptions (tier_id)
  WHERE is_founder = true;

-- Self-verify: fail LOUDLY here rather than half-applying.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscription_tiers' AND column_name = 'founder_window_enabled'
  ) THEN
    RAISE EXCEPTION 'subscription_tiers.founder_window_enabled is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscription_tiers' AND column_name = 'founder_deadline'
  ) THEN
    RAISE EXCEPTION 'subscription_tiers.founder_deadline is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'is_founder'
  ) THEN
    RAISE EXCEPTION 'subscriptions.is_founder is missing';
  END IF;
  RAISE NOTICE 'Founder Window columns OK: subscription_tiers(founder_window_enabled, founder_cap, founder_deadline), subscriptions(is_founder).';
END $$;
