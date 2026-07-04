-- schema-phase2-live-agreement.sql
-- Liability-shifting record for the CRWN Live-Streaming Agreement gate.
--
-- Every time an artist goes live they must affirmatively accept the
-- Live-Streaming Agreement (rights warranty, indemnification, recording/VOD
-- consent, content standards). This table PERSISTS that acceptance so there is
-- a durable record of who agreed to what, and when. The go-live API
-- (/api/live/session, action=start) refuses to start a stream unless a row
-- exists here for the current agreement version.
--
-- Convention: the accepting user is stored as `fan_id` (the codebase-wide name
-- for a profiles.id / auth user, per subscriptions). `artist_id` links to the
-- artist_profiles row they were acting as, for easy per-artist audit.
--
-- Apply manually in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS live_agreement_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- who accepted (auth user / profiles.id) — `fan_id` per codebase convention
  fan_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- which artist profile they were acting as when they accepted
  artist_id UUID REFERENCES artist_profiles(id) ON DELETE SET NULL,
  -- the agreement version accepted (LIVE_AGREEMENT_VERSION in src/lib/liveAgreement.ts)
  version TEXT NOT NULL,
  -- light audit metadata (best-effort; never trusted for auth)
  user_agent TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- one acceptance row per user per version (re-accepting is idempotent)
  CONSTRAINT live_agreement_unique UNIQUE (fan_id, version)
);

CREATE INDEX IF NOT EXISTS idx_live_agreement_fan_version
  ON live_agreement_acceptances(fan_id, version);

ALTER TABLE live_agreement_acceptances ENABLE ROW LEVEL SECURITY;

-- A user can read their own acceptance rows (the pre-stream screen checks
-- "have I already accepted the current version?"). Writes go through the
-- service-role API route only — there is deliberately NO client INSERT policy,
-- so the persisted record can only be created by the gated /api/live/agreement
-- endpoint under the authenticated user's identity.
DROP POLICY IF EXISTS "Users read their own live agreement acceptances" ON live_agreement_acceptances;
CREATE POLICY "Users read their own live agreement acceptances"
  ON live_agreement_acceptances FOR SELECT
  USING (fan_id = auth.uid());

-- SELF-VERIFY: fail LOUDLY if any piece didn't land (see
-- schema-phase2-artist-approval-gate-repair.sql for the template).
DO $$
BEGIN
  IF to_regclass('public.live_agreement_acceptances') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: table live_agreement_acceptances is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_agreement_acceptances' AND column_name = 'fan_id'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: live_agreement_acceptances.fan_id is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_agreement_acceptances' AND column_name = 'version'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: live_agreement_acceptances.version is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'live_agreement_unique'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: unique (fan_id, version) constraint is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'live_agreement_acceptances' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: live_agreement_acceptances has NO SELECT policy';
  END IF;
  RAISE NOTICE 'OK: live agreement acceptance table, unique constraint, and RLS all present.';
END $$;
