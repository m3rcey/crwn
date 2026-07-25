-- ============================================================================
-- CRWN Lead Magnet Funnel Analytics
-- ============================================================================
-- Apply MANUALLY in the Supabase SQL editor (not auto-run). Idempotent.
--
-- One canonical, dashboard-ready funnel store. The two existing event tables stay as they are:
--   - lead_magnet_events    : the append-only lead-magnet analytics log (no dedup, no artist_id)
--   - acquisition_events    : the Instagram state-machine outbox + idempotency claim
-- This table unifies the WHOLE funnel (page view -> mission completed) as a normalized `stage`
-- with the five reporting dimensions on every row, and a dedup key so a retried beacon, a
-- double-rendered effect, or a replayed webhook never double-counts.
--
-- Security: writes ONLY via service-role API routes (which authenticate/rate-limit themselves;
-- middleware excludes /api). No client write policy exists. Admins may read for reporting.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The funnel stage. One of the fifteen canonical stages; kept in sync with FUNNEL_STAGES in
  -- src/lib/analytics/funnelEvents.ts (the code is the source of truth; this CHECK is the guard).
  stage text NOT NULL CHECK (stage IN (
    'page_viewed',
    'calculator_started',
    'calculator_completed',
    'result_revealed',
    'assumptions_changed',
    'email_submitted',
    'signup_clicked',
    'account_created',
    'email_verified',
    'setup_started',
    'setup_completed',
    'builder_opened',
    'builder_published',
    'rise_mode_started',
    'mission_completed'
  )),

  -- The five reporting dimensions. Kept denormalized on every row so a dashboard can group by any
  -- of them without a join. Intentionally NO foreign keys: funnel history must survive the deletion
  -- of a user/artist/result, and analytics writes must never fail on a dangling reference.
  calculator text,   -- tool_slug, e.g. 'worth'
  campaign   text,   -- utm_campaign
  referrer   text,   -- utm_source || ref || document.referrer || 'direct'  (the source/platform)
  video      text,   -- utm_content: the specific video/creative that drove the visit
  artist_id  uuid,   -- artist_profiles.id, once known
  user_id    uuid,   -- auth.users.id, once known

  result_id  uuid,   -- lead_magnet_results.id, when the stage is tied to a specific result
  anon_id    text,   -- a per-occurrence/session id from the client, for pre-account stages

  -- No duplicate events: a deterministic key per logical occurrence. Callers pass a stable key
  -- (e.g. 'setup_completed:<artistId>'); the recorder defaults to a random one when a stage is
  -- inherently multi-fire, so those simply never collide.
  dedupe_key text NOT NULL DEFAULT gen_random_uuid()::text,

  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),  -- the date dimension
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Dedup: the whole "no duplicate events" guarantee. ON CONFLICT (dedupe_key) DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS uq_funnel_events_dedupe ON funnel_events (dedupe_key);

-- Dashboard indexes: by stage, by calculator, by campaign, by artist, by date.
CREATE INDEX IF NOT EXISTS idx_funnel_events_stage ON funnel_events (stage, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_events_calc ON funnel_events (calculator, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_events_campaign ON funnel_events (campaign) WHERE campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_funnel_events_video ON funnel_events (video) WHERE video IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_funnel_events_artist ON funnel_events (artist_id, occurred_at DESC) WHERE artist_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_funnel_events_date ON funnel_events (occurred_at DESC);

-- RLS: admins read (reporting); everyone else denied. Service role bypasses RLS to write.
ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_funnel_events" ON funnel_events;
CREATE POLICY "admin_read_funnel_events" ON funnel_events
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

REVOKE INSERT, UPDATE, DELETE ON funnel_events FROM anon, authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- Self-verify (fails LOUDLY on partial apply)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.funnel_events') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: funnel_events missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_funnel_events_dedupe'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: funnel_events dedupe unique index missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'funnel_events' AND policyname = 'admin_read_funnel_events'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: funnel_events admin read policy missing';
  END IF;
  RAISE NOTICE 'OK: funnel_events created';
END $$;
