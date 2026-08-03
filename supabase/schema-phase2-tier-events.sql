-- Tier interaction events: how fans behave against each rung of the four-tier ladder.
-- Run manually in the Supabase SQL Editor. Self-verifying (see the DO block at the end).
--
-- WHY A DEDICATED TABLE, NOT funnel_events
-- funnel_events is the ACQUISITION spine (20 stages, artist-level, one row per stage per
-- dedupe key) and its stage counts drive the admin funnel dashboards. Tier interactions are
-- per-TIER, are far higher volume, and would inflate those stage counts while needing a
-- tier_id column that 20 of 22 stages would leave null. Keeping them apart preserves both:
-- the acquisition funnel stays a funnel, and per-tier questions get a table shaped for them.
--
-- WHAT IS DELIBERATELY NOT HERE
-- No derived metrics. No conversion rates, no counts, no rollups. Rates are computed on read
-- (src/lib/analytics/tierEvidence.ts), the same discipline as the roadmap and the strategy
-- brain, so a definition can be corrected retroactively instead of being frozen into rows.
--
-- GRAIN
-- One row per (artist, tier, event_type, visitor_hash, day). Daily-unique, matching
-- artist_page_visits so the two reconcile. Repeated views from React rerenders, a second
-- checkout attempt in the same day, or a retried beacon all collapse into the row that is
-- already there. That makes "views" and "checkout starts" both mean UNIQUE VISITORS PER DAY,
-- which is the only pairing where a view-to-checkout rate is arithmetically honest.

CREATE TABLE IF NOT EXISTS tier_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES subscription_tiers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('tier_card_viewed', 'tier_checkout_started')),
  -- Day bucket for the unique grain. DATE, like artist_page_visits.visit_date.
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Hashed IP + user-agent, exactly the value middleware already computes. No PII.
  visitor_hash TEXT NOT NULL,
  -- Present only when the visitor was signed in. Nullable by design: most tier views are
  -- anonymous and forcing an id here would either drop them or invent one.
  fan_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Attribution carried from the page URL, same vocabulary as funnel_events. Never free text
  -- from the client: the recorder clips and the caller resolves it from persisted referral
  -- state, so an arbitrary POST cannot write a campaign name.
  source TEXT,
  -- Small, non-sensitive context ({ interval: 'year' }, { price: 1000 }). NEVER a Stripe id,
  -- a customer id, an email or a payment intent.
  metadata JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (artist_id, tier_id, event_type, visitor_hash, event_date)
);

-- Per-artist, per-day reads (the evidence reader's only access pattern).
CREATE INDEX IF NOT EXISTS idx_tier_events_artist_date
  ON tier_events (artist_id, event_date DESC);

-- Per-tier rollups within a range.
CREATE INDEX IF NOT EXISTS idx_tier_events_tier_type_date
  ON tier_events (tier_id, event_type, event_date DESC);

-- ============================================================
-- Access control
-- ============================================================
-- Writes are SERVER-ONLY (service role, which bypasses RLS). There is deliberately no INSERT
-- policy for anon/authenticated: a browser that could insert directly could forge another
-- artist's tier numbers, and the recorder already derives artist_id from the tier row rather
-- than trusting the caller. Reads are owner-only.

ALTER TABLE tier_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Artists read own tier events" ON tier_events;
CREATE POLICY "Artists read own tier events" ON tier_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM artist_profiles ap
      WHERE ap.id = tier_events.artist_id AND ap.user_id = auth.uid()
    )
  );

-- RLS is only half the story: a permissive-by-default table grant would let any authenticated
-- session SELECT rows that RLS then has to filter, and would let them INSERT freely. Revoke
-- the write grants outright so the policy set is not the only thing standing in the way.
REVOKE INSERT, UPDATE, DELETE ON tier_events FROM anon, authenticated;
GRANT SELECT ON tier_events TO authenticated;

-- ============================================================
-- Self-verify. A partial apply must fail loudly here, not silently half-land.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tier_events'
  ) THEN
    RAISE EXCEPTION 'tier-events migration incomplete: table missing';
  END IF;

  IF (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tier_events'
      AND column_name IN ('artist_id', 'tier_id', 'event_type', 'event_date',
                          'visitor_hash', 'fan_id', 'source', 'metadata', 'occurred_at')
  ) <> 9 THEN
    RAISE EXCEPTION 'tier-events migration incomplete: expected columns missing';
  END IF;

  -- The unique grain IS the deduplication guarantee. Without it, one rerender storm
  -- multiplies a tier's view count and every conversion rate computed from it is wrong.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'tier_events'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%artist_id%' AND indexdef ILIKE '%tier_id%'
      AND indexdef ILIKE '%event_type%' AND indexdef ILIKE '%visitor_hash%'
      AND indexdef ILIKE '%event_date%'
  ) THEN
    RAISE EXCEPTION 'tier-events migration incomplete: unique dedupe grain missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'tier_events'
      AND indexname = 'idx_tier_events_artist_date'
  ) THEN
    RAISE EXCEPTION 'tier-events migration incomplete: artist/date index missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'tier_events'
      AND indexname = 'idx_tier_events_tier_type_date'
  ) THEN
    RAISE EXCEPTION 'tier-events migration incomplete: tier/type/date index missing';
  END IF;

  IF NOT (
    SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tier_events'::regclass
  ) THEN
    RAISE EXCEPTION 'tier-events migration incomplete: RLS not enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tier_events'
      AND policyname = 'Artists read own tier events'
  ) THEN
    RAISE EXCEPTION 'tier-events migration incomplete: owner read policy missing';
  END IF;

  -- A leftover write grant is the failure that matters most: it would let a browser
  -- fabricate another artist''s tier evidence.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'tier_events'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'tier-events migration incomplete: client write grants still present';
  END IF;

  RAISE NOTICE 'tier-events migration verified OK';
END $$;
