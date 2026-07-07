-- schema-phase2-promise-calendar.sql
-- PROMISE CALENDAR (artist) / MY CRWN CALENDAR (fan) — Phase 1 foundation.
--
-- The ONLY genuinely-new durable state this feature needs. Everything else the
-- calendar shows (road_campaigns, missions, city_unlocks, clip_bounties,
-- proof_of_demand deadlines, live_sessions.scheduled_at, subscriptions renewal
-- dates) already exists and is PROJECTED at read time by src/lib/calendarProjection.ts
-- — we do NOT mirror those rows here.
--
-- What IS new: recurring benefit "promises" an artist owes supporters. tier_benefits
-- has no fulfillment/recurrence/tracking concept today, so this is additive with
-- nothing to migrate.
--
-- fulfillment_obligations = the standing promise (e.g. "monthly private livestream
--   for Vault Supporters"). Anchored on (source_tier_id, benefit_type) — the STABLE
--   identity — never tier_benefits.id, because tier_benefits is a manually-created
--   table with no checked-in, environment-stable id.
-- fulfillment_events = each materialized due instance of an obligation, with its
--   completion status. This is what the Promise Calendar lists as a dated task.
--
-- Reminders (calendar_reminders) land in Phase 4; Google sync (calendar_sync_*) in
-- Phase 8. Not created here.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS fulfillment_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  -- What the promise is attached to. tier/product point at existing rows;
  -- campaign/custom carry their own title. benefit_type is the tier_benefits
  -- benefit key (e.g. 'monthly_demo', 'group_live_qa') when source_type='tier'.
  source_type text NOT NULL DEFAULT 'custom' CHECK (source_type IN (
    'tier','product','campaign','custom'
  )),
  source_tier_id uuid,        -- subscription_tiers.id (no FK: tier may be soft-deleted)
  source_product_id uuid,     -- products.id
  source_campaign_id uuid,    -- road_campaigns.id
  benefit_type text,          -- tier_benefits.benefit_type (stable identity)
  title text NOT NULL,
  description text,
  -- How the artist fulfills it. Mirrors the benefit-catalog fulfillment shapes.
  fulfillment_type text NOT NULL DEFAULT 'manual_task' CHECK (fulfillment_type IN (
    'content_drop','livestream','event','message','file_delivery','shipment',
    'custom_thankyou','fan_council','access_unlock','manual_task'
  )),
  recurrence text NOT NULL DEFAULT 'none' CHECK (recurrence IN (
    'none','weekly','biweekly','monthly','quarterly','custom'
  )),
  recurrence_rule text,       -- optional RRULE-ish string when recurrence='custom'
  next_due_at timestamptz,    -- when the next fulfillment_event should fall
  -- Who the promise is owed to. Reuses existing audience primitives — no separate
  -- audience table. 'tier' => audience_id is a subscription_tiers.id; 'squad' =>
  -- artist_squads.id; 'all_supporters' => everyone with an active sub.
  audience_kind text NOT NULL DEFAULT 'all_supporters' CHECK (audience_kind IN (
    'tier','squad','all_supporters','campaign'
  )),
  audience_id uuid,
  reminder_offsets integer[] NOT NULL DEFAULT ARRAY[7,3,1],  -- days-before (Phase 4)
  requires_completion boolean NOT NULL DEFAULT true,
  auto_create_fan_items boolean NOT NULL DEFAULT true,
  auto_create_artist_task boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obligations_artist ON fulfillment_obligations(artist_id);
CREATE INDEX IF NOT EXISTS idx_obligations_active ON fulfillment_obligations(artist_id, status);
CREATE INDEX IF NOT EXISTS idx_obligations_due ON fulfillment_obligations(next_due_at);

CREATE TABLE IF NOT EXISTS fulfillment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES fulfillment_obligations(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,            -- snapshot of the obligation title at materialize time
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','completed','missed','cancelled','rescheduled'
  )),
  completed_at timestamptz,
  completed_by uuid,
  -- What discharged the promise (a track upload, a live session, a post…), so the
  -- calendar can link "Mark complete" to the real artifact later.
  completion_source_type text,    -- track/live_session/community_post/product/manual
  completion_source_id uuid,
  eligible_fan_count integer NOT NULL DEFAULT 0,   -- denormalized at materialize time
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_events_obligation ON fulfillment_events(obligation_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_events_artist ON fulfillment_events(artist_id, status);
CREATE INDEX IF NOT EXISTS idx_fulfillment_events_due ON fulfillment_events(due_at);

ALTER TABLE fulfillment_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_events ENABLE ROW LEVEL SECURITY;

-- Obligations are the ARTIST's private promise list — never fan-readable directly.
-- (Fans only ever see the projected, eligibility-filtered items from the API layer,
--  exactly like every other tier-gated surface in this codebase.)
DROP POLICY IF EXISTS "Artists manage own obligations" ON fulfillment_obligations;
CREATE POLICY "Artists manage own obligations" ON fulfillment_obligations
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Artists manage own fulfillment events" ON fulfillment_events;
CREATE POLICY "Artists manage own fulfillment events" ON fulfillment_events
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- Self-verify: fail loud in the SQL editor if the migration only half-applied.
DO $$
BEGIN
  IF to_regclass('public.fulfillment_obligations') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fulfillment_obligations missing';
  END IF;
  IF to_regclass('public.fulfillment_events') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fulfillment_events missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fulfillment_obligations'
      AND policyname = 'Artists manage own obligations'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: obligations RLS policy missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fulfillment_events'
      AND policyname = 'Artists manage own fulfillment events'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fulfillment_events RLS policy missing';
  END IF;
  RAISE NOTICE 'OK: promise-calendar foundation tables + RLS created';
END $$;

COMMIT;
