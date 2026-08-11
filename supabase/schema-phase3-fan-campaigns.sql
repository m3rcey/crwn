-- Z11: the Virality Engine's Campaign spine. Fan Recruitment Drive (V1), non-cash.
--
-- WHAT THIS IS
-- A THIN generic orchestrator: one artist, one archetype, one window, one toolkit, one participant
-- set. It coordinates execution. It is not, and may never become, a source of truth for anything
-- that already has one.
--
-- THE BOUNDARY, WHICH IS THE WHOLE POINT
--   referral attribution -> `referrals`, written by processReferral at the Stripe webhook
--   subscriber attribution -> `subscriptions` plus that referral join
--   earnings / commission -> `earnings`, `referral_earnings`
--   payouts / balances -> `fan_payouts`, `atomic_fan_cashout`
-- A campaign READS those. It never mirrors, caches, recomputes or shadow-writes them. The
-- falsifiable test: if a campaign row and the underlying rail can ever disagree about who earned
-- what, this boundary has been violated and one of the two is paying real money.
--
-- THERE IS NO MONEY COLUMN HERE AND NONE MAY BE ADDED. Not a payout, not a prize, not a commission,
-- not a balance, not a rate. `incentive_kind` is CHECK-constrained to 'non_cash' so a cash reward
-- cannot be introduced by an app change alone: it would take a migration, which is exactly the
-- founder gate it should have (canonical architecture, founder decision 25.1).
--
-- WHY A NEW TABLE RATHER THAN REUSING ONE
--   `campaigns`      - EMAIL campaigns (subject, body, sends, Resend webhook). Different subject.
--   `road_campaigns` - a goal-with-progress tracker the artist updates. No participants, no toolkit,
--                      and the quest catalog's `artist_has_campaign` DomainCheck already means it.
--   `clip_bounties`  - a complete campaign for ONE archetype, semantically bound to `live_session_id`,
--                      carrying shipped RLS and live Clip-to-Earn money. Repurposing its meaning is
--                      irreversible; referencing it later behind an adapter is not.
--   `missions`       - has participants, but its v1 progress rule is deliberately manual and its
--                      completion source is `fan_events`, not the referral rail.
-- No existing row can identify one artist campaign without one of those meanings drifting.
--
-- WHY THE CAMPAIGN CARRIES NO ATTRIBUTION DIMENSION
-- It does not need one, so it does not get one. A participant's outcome is found by asking the
-- canonical rail a narrower question: referrals for THIS artist, credited to someone in THIS
-- participant set, created inside THIS window. `referrals` is untouched. The one thing that makes
-- that unambiguous is the partial unique index below: ONE active campaign per artist, so a referral
-- can never fall inside two overlapping windows and be counted twice.
--
-- Apply manually in the Supabase SQL editor. Additive only, no destructive statement.
--
-- HOW TO RUN IT (a green tick is not proof)
--  1. Check the project ref in the URL is ecpqtuidtsncjfwtkvwc.
--  2. Click into the editor and press Ctrl+A before Run. With text selected the editor runs ONLY
--     the selection and still reports success.
--  3. On success the LAST statement prints a grid. No grid means it did not commit.

CREATE TABLE IF NOT EXISTS fan_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,

  -- Archetype is DATA, deliberately not a database enum. Adding an archetype must touch the
  -- registry in src/lib/campaigns/archetypes.ts and nothing else; a CHECK here would make every
  -- new archetype a migration and turn configuration back into schema. The app validates it at
  -- every write boundary, and the app is the only writer (service role).
  archetype TEXT NOT NULL,

  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'ended', 'archived')),

  -- The participant toolkit: slot key -> the artist's own copy. A campaign cannot go live with a
  -- required slot empty (enforced in src/lib/campaigns/lifecycle.ts, which the launch route calls).
  toolkit JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- V1 is non-cash, at the database. See the header.
  incentive_kind TEXT NOT NULL DEFAULT 'non_cash' CHECK (incentive_kind = 'non_cash'),

  -- NULL until launch. The report window is [starts_at, ends_at). This is a CAMPAIGN ACTIVITY
  -- window and is NOT a referral attribution window: the referral rail owns that (a 30-day rolling
  -- cookie, last touch) and nothing here changes it.
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ NOT NULL,

  -- Z3 LINKAGE, not a second recommendation. `source_constraint` is the constraint `readConstraint`
  -- had diagnosed when the artist created this, and `recommendation_action_key` is the EXISTING
  -- durable identity Z3 already mints (`<CONSTRAINT>:<DomainCheck|advisory>`). The campaign points
  -- at the one logical recommendation; it never issues one, and only /api/artist/constraint writes
  -- constraint_recommendations.
  source_constraint TEXT,
  recommendation_action_key TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- An active campaign without a launch time would have an undefined report window, so the database
-- refuses it rather than trusting every future caller.
ALTER TABLE fan_campaigns DROP CONSTRAINT IF EXISTS fan_campaigns_active_has_start;
ALTER TABLE fan_campaigns ADD CONSTRAINT fan_campaigns_active_has_start
  CHECK (status = 'draft' OR starts_at IS NOT NULL);

-- ONE ACTIVE CAMPAIGN PER ARTIST. Two reasons, and the second is the load-bearing one:
--   1. An artist running three drives at once is not running a drive.
--   2. Overlapping windows over the same participant would let ONE referral be reported as an
--      outcome of TWO campaigns. Since attribution is derived by (participant, window) rather than
--      stamped on the referral row, this index is what makes that derivation unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fan_campaigns_one_active
  ON fan_campaigns(artist_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_fan_campaigns_artist
  ON fan_campaigns(artist_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fan_campaign_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES fan_campaigns(id) ON DELETE CASCADE,
  fan_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- DESCRIPTIVE, never authorizing. A role records what kind of value someone contributed. It may
  -- never decide what a user can read or write, which is why it is a plain string with no policy
  -- referencing it. `src/lib/squads.ts` made the same call ("scoped to the squad, never app-level").
  role TEXT NOT NULL DEFAULT 'recruiter',

  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Joining twice is joining once. The fan's referral CODE is deliberately not stored: it is
  -- derived from their profile at read time, so a username change cannot leave a stale copy here
  -- that disagrees with the link the referral rail actually resolves.
  UNIQUE (campaign_id, fan_id)
);

CREATE INDEX IF NOT EXISTS idx_fan_campaign_participants_campaign
  ON fan_campaign_participants(campaign_id, joined_at);
CREATE INDEX IF NOT EXISTS idx_fan_campaign_participants_fan
  ON fan_campaign_participants(fan_id);

-- RLS
-- ---
-- fan_campaigns: the OWNING ARTIST reads their own rows, whatever the status. There is deliberately
-- NO public read policy, even for an active campaign. The row carries `source_constraint`, which is
-- private commercial evidence ("REACH" means almost nobody is visiting this page), and RLS is
-- row-level, not column-level, so a public policy would publish it. The fan-facing page therefore
-- reads through a service-role route that returns an explicit, curated payload, exactly as the
-- deliberately-public /api/leaderboard does.
--
-- There is no client INSERT, UPDATE or DELETE policy on either table. Every write goes through the
-- service role behind a session ownership check, so an artist cannot edit another artist's campaign
-- and a fan cannot author a participation they did not make.
ALTER TABLE fan_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_reads_own_fan_campaigns" ON fan_campaigns;
CREATE POLICY "artist_reads_own_fan_campaigns" ON fan_campaigns
  FOR SELECT USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- fan_campaign_participants: the fan sees their own participation, the artist sees their own
-- campaign's participants. Nobody sees a third party's. Mirrors mission_participants exactly.
ALTER TABLE fan_campaign_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_or_artist_reads_fan_campaign_participants" ON fan_campaign_participants;
CREATE POLICY "own_or_artist_reads_fan_campaign_participants" ON fan_campaign_participants
  FOR SELECT USING (
    fan_id = auth.uid()
    OR campaign_id IN (
      SELECT id FROM fan_campaigns
       WHERE artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
    )
  );

-- Self-verify. A partial apply errors loudly instead of half-landing.
DO $$
DECLARE
  money_col TEXT;
BEGIN
  IF to_regclass('public.fan_campaigns') IS NULL THEN
    RAISE EXCEPTION 'fan_campaigns table missing';
  END IF;
  IF to_regclass('public.fan_campaign_participants') IS NULL THEN
    RAISE EXCEPTION 'fan_campaign_participants table missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
    WHERE tablename = 'fan_campaigns' AND indexname = 'idx_fan_campaigns_one_active') THEN
    RAISE EXCEPTION 'one-active-campaign index missing: overlapping windows would double count a referral';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fan_campaigns_active_has_start') THEN
    RAISE EXCEPTION 'fan_campaigns_active_has_start check missing: an active campaign could have no window';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'fan_campaigns' AND policyname = 'artist_reads_own_fan_campaigns') THEN
    RAISE EXCEPTION 'artist read policy missing on fan_campaigns';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'fan_campaign_participants'
      AND policyname = 'own_or_artist_reads_fan_campaign_participants') THEN
    RAISE EXCEPTION 'read policy missing on fan_campaign_participants';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename IN ('fan_campaigns', 'fan_campaign_participants') AND cmd <> 'SELECT') THEN
    RAISE EXCEPTION 'campaign tables must have no client write policy; writes are service-role only';
  END IF;

  -- The boundary, asserted rather than merely documented. If a later migration adds a money column
  -- to the spine, this fails and the reason is on screen.
  SELECT column_name INTO money_col FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('fan_campaigns', 'fan_campaign_participants')
     AND column_name ~ '(amount|cents|payout|price|commission|revenue|earn|balance|prize|fee)'
   LIMIT 1;
  IF money_col IS NOT NULL THEN
    RAISE EXCEPTION 'campaign spine must carry no money column, found: %', money_col;
  END IF;
END $$;

-- Make the API pick the new tables up immediately.
NOTIFY pgrst, 'reload schema';

-- PROOF OF COMMIT, and the last statement on purpose. No grid means it did not commit.
-- Expect: 2 tables, rls = yes on both, exactly 2 policies (both FOR SELECT), money columns = 0.
SELECT 'A. THIS GRID IS FROM'::text AS what,
       'schema-phase3-fan-campaigns.sql (THE MIGRATION, it creates both tables)'::text AS detail
UNION ALL
SELECT 'B. table fan_campaigns',
       COALESCE(to_regclass('public.fan_campaigns')::text, 'MISSING - did not commit')
UNION ALL
SELECT 'C. table fan_campaign_participants',
       COALESCE(to_regclass('public.fan_campaign_participants')::text, 'MISSING - did not commit')
UNION ALL
SELECT 'index: ' || indexname, 'present' FROM pg_indexes
 WHERE schemaname = 'public' AND tablename IN ('fan_campaigns', 'fan_campaign_participants')
UNION ALL
SELECT 'policy: ' || policyname, 'FOR ' || cmd FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('fan_campaigns', 'fan_campaign_participants')
UNION ALL
SELECT 'rls enabled: ' || c.relname,
       CASE WHEN c.relrowsecurity THEN 'yes' ELSE 'NO - stop and tell Claude' END
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('fan_campaigns', 'fan_campaign_participants')
UNION ALL
SELECT 'money columns (must be 0)', count(*)::text FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('fan_campaigns', 'fan_campaign_participants')
   AND column_name ~ '(amount|cents|payout|price|commission|revenue|earn|balance|prize|fee)'
 ORDER BY 1;
