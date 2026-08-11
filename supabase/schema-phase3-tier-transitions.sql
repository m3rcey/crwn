-- Z8: tier transition history. Membership DEPTH movement, append-only.
--
-- THE GAP THIS CLOSES
-- CRWN knows a fan's CURRENT tier and nothing about how they got there. Every tier change
-- overwrites `subscriptions.tier_id` in place, and the checkout upsert
-- (`onConflict: 'fan_id,artist_id'`) additionally RESETS `started_at`, so a tier change destroys
-- both the previous tier and the date the relationship began. There is no way to ask when a fan
-- went deeper, what they came from, how long they stayed, or whether depth predicts retention.
--
-- WHY NOT `tier_events`: that table is anonymous PRE-PURCHASE funnel analytics
-- (`tier_card_viewed` / `tier_checkout_started`), keyed on `visitor_hash` and deduped per day. It
-- has no fan_id and no subscription_id, and its unique constraint exists to collapse repeat views.
-- A membership state change is a different fact about a different subject, and forcing it in there
-- would break both.
--
-- WHAT THIS IS NOT
--  - Not money. No GMV, MRR, earnings, fee or refund column exists, and none may be added: the
--    canonical earnings/subscription rails own that and a transition joins to them at read time.
--  - Not a fan score. Membership depth is ONE component of fan economic value; referrals, one-off
--    purchases, live spend and advocacy are not here.
--  - Not a direction. `from_tier_id`/`to_tier_id` are raw. Upgrade vs downgrade is DERIVED on read
--    from price, because an artist can reprice a tier later and a stored label would then be
--    describing history it can no longer justify.
--
-- Apply manually in the Supabase SQL editor. Additive only, no destructive statement.
--
-- HOW TO RUN IT (the Z3 lesson: a green tick is not proof)
--  1. Check the project ref in the URL is ecpqtuidtsncjfwtkvwc.
--  2. Click into the editor and press Ctrl+A before Run. With text selected, the editor runs ONLY
--     the selection and still reports success.
--  3. The whole script is ONE transaction: any error rolls back the CREATE TABLE and leaves no
--     trace but the message on screen. If it fails, that message is the thing to send back.
--  4. On success the LAST statement prints a grid. No grid means it did not commit.

CREATE TABLE IF NOT EXISTS tier_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  -- The fan reference is intentionally NOT a cascade delete. A deleted fan must not silently erase
  -- the artist's history of how their membership base moved; the id is nulled instead, which keeps
  -- the movement countable while detaching the person from it.
  fan_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Same reasoning: a subscription row can be replaced, and the history of it should outlive that.
  subscription_id UUID,

  -- RAW state. NULL from = first paid tier (or a baseline row). NULL to = membership ended.
  -- Tiers are NOT cascaded either: a retired tier must not delete the record of fans who were on it.
  from_tier_id UUID REFERENCES subscription_tiers(id) ON DELETE SET NULL,
  to_tier_id UUID REFERENCES subscription_tiers(id) ON DELETE SET NULL,

  -- When the state ACTUALLY changed, never when a request was made. A scheduled downgrade is
  -- recorded when it takes effect at period end, not when the fan clicked.
  occurred_at TIMESTAMPTZ NOT NULL,

  -- Which seam produced it, so coverage gaps are findable.
  source TEXT NOT NULL CHECK (source IN
    ('stripe_checkout', 'stripe_subscription_update', 'scheduled_downgrade', 'import', 'baseline')),

  -- How CRWN knows. `observed` = a state change CRWN watched. `baseline` = a starting position for
  -- a membership that already existed (a POSITION, never counted as movement). `imported` = an
  -- external platform said so and CRWN did not see it happen.
  evidence TEXT NOT NULL CHECK (evidence IN ('observed', 'baseline', 'imported')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IDEMPOTENCY. Stripe redelivers webhooks and internal routes get double-submitted, so the durable
-- identity is the EVENT, not the timestamp: `evt:<stripe event id>` where one exists, otherwise the
-- state change itself. A retry collides here and writes nothing rather than inventing a second
-- movement out of one real one.
ALTER TABLE tier_transitions ADD COLUMN IF NOT EXISTS event_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tier_transitions_event_key
  ON tier_transitions(event_key);

-- A same-tier row is never a movement (an artist repricing a tier is not a fan moving), so the
-- database refuses it outright rather than trusting every future caller to remember.
ALTER TABLE tier_transitions DROP CONSTRAINT IF EXISTS tier_transitions_real_movement;
ALTER TABLE tier_transitions ADD CONSTRAINT tier_transitions_real_movement
  CHECK (evidence <> 'observed' OR from_tier_id IS DISTINCT FROM to_tier_id);

CREATE INDEX IF NOT EXISTS idx_tier_transitions_artist
  ON tier_transitions(artist_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tier_transitions_fan
  ON tier_transitions(artist_id, fan_id, occurred_at DESC);

-- RLS. The ARTIST may read the movement of their own membership base. There is no client INSERT,
-- UPDATE or DELETE policy at all: every write goes through the service role, so a fan cannot author
-- a history of upgrades they never made and an artist cannot edit theirs.
--
-- The fan's own history is deliberately NOT exposed here. No CRWN surface shows a fan their own tier
-- movement today, and opening a read path with no consumer is how private data leaks later.
ALTER TABLE tier_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_reads_own_tier_transitions" ON tier_transitions;
CREATE POLICY "artist_reads_own_tier_transitions" ON tier_transitions
  FOR SELECT USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- Self-verify. A partial apply errors loudly instead of half-landing.
DO $$
BEGIN
  IF to_regclass('public.tier_transitions') IS NULL THEN
    RAISE EXCEPTION 'tier_transitions table missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
    WHERE tablename = 'tier_transitions' AND indexname = 'idx_tier_transitions_event_key') THEN
    RAISE EXCEPTION 'event_key unique index missing: webhook retries would duplicate history';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'tier_transitions' AND policyname = 'artist_reads_own_tier_transitions') THEN
    RAISE EXCEPTION 'artist read policy missing on tier_transitions';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tier_transitions' AND cmd <> 'SELECT') THEN
    RAISE EXCEPTION 'tier_transitions must have no client write policy; writes are service-role only';
  END IF;
END $$;

-- Make the API pick the new table up immediately.
NOTIFY pgrst, 'reload schema';

-- PROOF OF COMMIT, and the last statement on purpose. No grid means it did not commit.
-- Expect: 1 table, 3 indexes plus the primary key, exactly 1 policy (FOR SELECT), rls = yes.
SELECT 'table'::text AS what,
       COALESCE(to_regclass('public.tier_transitions')::text, 'MISSING - did not commit') AS detail
UNION ALL
SELECT 'index: ' || indexname, 'present' FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'tier_transitions'
UNION ALL
SELECT 'policy: ' || policyname, 'FOR ' || cmd FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'tier_transitions'
UNION ALL
SELECT 'rls enabled', CASE WHEN c.relrowsecurity THEN 'yes' ELSE 'NO - stop and tell Claude' END
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'tier_transitions'
UNION ALL
SELECT 'column count', count(*)::text FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'tier_transitions'
 ORDER BY 1;
