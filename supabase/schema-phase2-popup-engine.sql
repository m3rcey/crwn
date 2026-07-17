-- Pop-up Engine — dark-launched interruption layer.
--
-- A single governed surface for moving artists/fans one step further down the
-- journey (or growing the platform), WITHOUT overkill. The catalog of pop-ups
-- lives in code (src/lib/popups/registry.ts); this migration only adds the two
-- tables the engine needs to (a) frequency-cap what a user has already seen and
-- (b) capture pop-up survey answers, plus the dark-launch flag.
--
-- Apply manually in the Supabase SQL editor. Self-verifies at the end.

-- 1) Per-user pop-up event log. One row per shown/dismissed/clicked/completed.
--    This is what the server reads to enforce frequency caps and the global
--    "at most one interruption per user per day" governor.
CREATE TABLE IF NOT EXISTS popup_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  popup_key   TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('shown', 'dismissed', 'clicked', 'completed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_popup_events_user       ON popup_events(user_id);
CREATE INDEX IF NOT EXISTS idx_popup_events_user_key   ON popup_events(user_id, popup_key);
CREATE INDEX IF NOT EXISTS idx_popup_events_user_time  ON popup_events(user_id, created_at DESC);

ALTER TABLE popup_events ENABLE ROW LEVEL SECURITY;

-- A user may read and insert their OWN events (the client posts 'shown' on
-- display). Server routes use the service-role client and bypass RLS anyway.
DROP POLICY IF EXISTS "popup_events_select_own" ON popup_events;
CREATE POLICY "popup_events_select_own" ON popup_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "popup_events_insert_own" ON popup_events;
CREATE POLICY "popup_events_insert_own" ON popup_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 2) Pop-up survey answers (1-5 rating + free-text feedback). Kept separate from
--    the loyalty `survey_responses` table (NPS 0-10) so neither constrains the
--    other. One answer per (user, popup) — a resubmit overwrites via upsert.
CREATE TABLE IF NOT EXISTS popup_survey_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  popup_key   TEXT NOT NULL,
  rating      INT  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, popup_key)
);

CREATE INDEX IF NOT EXISTS idx_popup_survey_user ON popup_survey_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_popup_survey_key  ON popup_survey_responses(popup_key);

ALTER TABLE popup_survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "popup_survey_insert_own" ON popup_survey_responses;
CREATE POLICY "popup_survey_insert_own" ON popup_survey_responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "popup_survey_select_own" ON popup_survey_responses;
CREATE POLICY "popup_survey_select_own" ON popup_survey_responses
  FOR SELECT USING (auth.uid() = user_id);

-- 3) Dark-launch flag. Off by default — the engine renders nothing until flipped.
INSERT INTO admin_settings (key, value)
VALUES ('popup_engine', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Self-verify: fail loudly on a partial apply instead of silently half-landing.
DO $$
BEGIN
  IF to_regclass('public.popup_events') IS NULL THEN
    RAISE EXCEPTION 'popup_events table missing';
  END IF;
  IF to_regclass('public.popup_survey_responses') IS NULL THEN
    RAISE EXCEPTION 'popup_survey_responses table missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin_settings WHERE key = 'popup_engine') THEN
    RAISE EXCEPTION 'popup_engine admin_settings flag missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'popup_events' AND policyname = 'popup_events_insert_own'
  ) THEN
    RAISE EXCEPTION 'popup_events insert policy missing';
  END IF;
  RAISE NOTICE 'popup-engine migration verified OK';
END $$;
