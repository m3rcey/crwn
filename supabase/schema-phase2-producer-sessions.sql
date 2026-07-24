-- schema-phase2-producer-sessions.sql
-- EXECUTIVE PRODUCER SESSIONS — Phase 1, dark-launched.
--
-- An Executive Producer Session is NOT a new kind of stream. It is an existing
-- live_session with two things bolted on: fans can SUBMIT things beforehand
-- (a beat, a vocal, a written idea, a reference link), and the artist runs
-- POLLS during the stream. So this migration:
--   1. adds submission columns to live_sessions (additive, nothing to backfill),
--   2. adds session_submissions (the fan-uploaded material + the artist queue),
--   3. adds session_polls / session_poll_votes (advisory in-session polls),
--   4. seeds the dark-launch flag admin_settings.producer_sessions OFF.
--
-- Everything stays invisible until the flag is flipped. The submission WRITE path
-- (upload signer) additionally refuses to run while the flag is off, so a fan
-- can never reach it early.
--
-- RIGHTS GATE (why the flag stays off): a submission carries a fan's third-party
-- IP. The consent_version column records WHICH fan agreement they accepted at
-- submit time, but the agreement TEXT is a founder/attorney deliverable and is
-- NOT written here. Do NOT flip this flag on until that agreement exists and the
-- submit route gates on it. See TODO.md.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
BEGIN;

-- ── 1. live_sessions submission columns ─────────────────────────────────────
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS accepts_submissions boolean NOT NULL DEFAULT false;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS submission_prompt text;           -- "what you can submit" shown to fans
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS submission_deadline timestamptz;  -- null = open until the session starts

-- ── 2. session_submissions ──────────────────────────────────────────────────
-- Modeled on mission_suggestions (artist-reviewed, service-role writes) plus
-- clip_bounty_submissions (adds shortlist/featured + presentation order).
CREATE TABLE IF NOT EXISTS session_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE, -- denormalized for RLS + queue queries
  fan_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'idea' CHECK (kind IN ('beat','vocal','idea','reference','other')),
  title text,
  note text,                 -- the fan's pitch / lyrics / idea text
  link_url text,             -- reference link (kind='reference' or optional extra)
  -- Uploaded file lives in PRIVATE R2 under a fan-scoped key. NULL for text-only
  -- (idea/reference) submissions. The file is served only through a signed URL by
  -- the owning artist or the submitting fan.
  file_key text,
  file_name text,
  file_size bigint,
  content_type text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','shortlisted','featured','rejected','archived')),
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  sort_order integer,        -- artist-set presentation order for the live run-through
  -- Which fan agreement version they accepted at submit time. The submit route
  -- refuses a submission without one once the agreement ships.
  consent_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_submissions_session ON session_submissions(session_id, status);
CREATE INDEX IF NOT EXISTS idx_session_submissions_artist ON session_submissions(artist_id, status);
CREATE INDEX IF NOT EXISTS idx_session_submissions_fan ON session_submissions(fan_id);

ALTER TABLE session_submissions ENABLE ROW LEVEL SECURITY;

-- Fan reads their own submissions; artist reads submissions to their own sessions.
-- ALL writes (create, review) go through service-role routes that check the flag,
-- the fan's session access, the deadline, and (once it ships) consent — so there
-- is deliberately NO client INSERT/UPDATE policy, mirroring mission_suggestions.
DROP POLICY IF EXISTS "Fan reads own submissions" ON session_submissions;
CREATE POLICY "Fan reads own submissions" ON session_submissions
  FOR SELECT USING (fan_id = auth.uid());

DROP POLICY IF EXISTS "Artist reads own-session submissions" ON session_submissions;
CREATE POLICY "Artist reads own-session submissions" ON session_submissions
  FOR SELECT USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- ── 3. session_polls / session_poll_votes ───────────────────────────────────
-- Advisory ONLY. A poll never binds the artist; it is a temperature check the
-- artist can ignore. That is what preserves the "full creative control" claim.
CREATE TABLE IF NOT EXISTS session_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  question text NOT NULL,
  -- [{ "id": "a", "label": "Beat A" }, ...]. Stable option ids so votes survive edits.
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_session_polls_session ON session_polls(session_id, status);

CREATE TABLE IF NOT EXISTS session_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES session_polls(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  fan_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  option_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_poll_vote_unique UNIQUE (poll_id, fan_id)  -- one vote per fan per poll
);

CREATE INDEX IF NOT EXISTS idx_session_poll_votes_poll ON session_poll_votes(poll_id);

ALTER TABLE session_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_poll_votes ENABLE ROW LEVEL SECURITY;

-- Polls: readable by anyone who can see the session (public read like live chat),
-- managed by the owning artist. Votes are cast through a service-role route that
-- re-checks the fan's session access, so no client INSERT policy on votes.
DROP POLICY IF EXISTS "Read polls for a session" ON session_polls;
CREATE POLICY "Read polls for a session" ON session_polls
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Artist manages own polls" ON session_polls;
CREATE POLICY "Artist manages own polls" ON session_polls
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- Vote reads: a fan sees their own vote (to render "you voted X"); aggregate
-- tallies are computed server-side and returned by the polls route.
DROP POLICY IF EXISTS "Fan reads own votes" ON session_poll_votes;
CREATE POLICY "Fan reads own votes" ON session_poll_votes
  FOR SELECT USING (fan_id = auth.uid());

-- ── 4. Dark-launch flag (off by default) ────────────────────────────────────
-- Flip with: UPDATE admin_settings SET value = '{"enabled": true}'::jsonb
--            WHERE key = 'producer_sessions';
-- DO NOT flip until the fan submission agreement exists (see header + TODO.md).
INSERT INTO admin_settings (key, value)
VALUES ('producer_sessions', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ── Self-verify (after COMMIT so a bug here cannot undo a correct apply) ──────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_sessions' AND column_name = 'accepts_submissions') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: live_sessions.accepts_submissions missing';
  END IF;
  IF to_regclass('public.session_submissions') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: session_submissions missing';
  END IF;
  IF to_regclass('public.session_polls') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: session_polls missing';
  END IF;
  IF to_regclass('public.session_poll_votes') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: session_poll_votes missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'session_submissions' AND policyname = 'Fan reads own submissions') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: session_submissions RLS missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin_settings WHERE key = 'producer_sessions') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: producer_sessions flag missing';
  END IF;
  RAISE NOTICE 'schema-phase2-producer-sessions: OK (flag admin_settings.producer_sessions is OFF; keep it off until the fan submission agreement ships)';
END $$;
