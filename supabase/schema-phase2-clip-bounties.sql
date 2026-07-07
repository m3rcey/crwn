-- schema-phase2-clip-bounties.sql
-- Clip Bounties: time-limited, targeted challenges layered on top of the existing
-- Clip-to-Earn rail. Clip-to-Earn already pays clippers a commission on attributed
-- subs; a bounty adds a BONUS for a specific outcome (best clip tonight, first to
-- convert 5, top 3 split, etc).
--
-- v1 IS NON-CASH ON PURPOSE. reward_type is limited to points/badge/access/
-- commission_boost/custom — none of which create a payout obligation before
-- revenue clears. Cash bounties come later on the existing held-payout rail
-- (fan_payouts + 7-day hold); this schema leaves payout_id room for that.
-- Reuses: live_sessions (VOD source), fan_badges, missions, notifications, fan_events.
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS clip_bounties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  live_session_id uuid REFERENCES live_sessions(id) ON DELETE SET NULL, -- VOD / live source (nullable)
  title text NOT NULL,
  description text,
  bounty_type text NOT NULL DEFAULT 'artist_pick' CHECK (bounty_type IN (
    'first_convert','most_subscribers','most_revenue','most_clicks',
    'artist_pick','best_retention','city','fastest','top3_split','custom'
  )),
  -- NON-CASH reward types only in v1
  reward_type text NOT NULL DEFAULT 'badge' CHECK (reward_type IN (
    'points','badge','access','commission_boost','custom'
  )),
  reward_detail text,                 -- human-readable reward ("Vault access for 30 days")
  reward_badge_key text,              -- fan_badges key if reward_type = badge
  reward_metadata jsonb NOT NULL DEFAULT '{}',
  deadline timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','ended','cancelled','awarded')),
  stacks_with_commission boolean NOT NULL DEFAULT true,
  approval_required boolean NOT NULL DEFAULT true,
  eligibility text NOT NULL DEFAULT 'all' CHECK (eligibility IN ('all','clippers','subscribers')),
  cancel_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clip_bounties_artist ON clip_bounties(artist_id);
CREATE INDEX IF NOT EXISTS idx_clip_bounties_status ON clip_bounties(status);

CREATE TABLE IF NOT EXISTS clip_bounty_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id uuid NOT NULL REFERENCES clip_bounties(id) ON DELETE CASCADE,
  clipper_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  clip_url text,                      -- link to the posted clip
  vod_marker_id uuid,                 -- optional link into vod_markers
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','winner')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  review_note text,
  subscribers_attributed integer NOT NULL DEFAULT 0,
  revenue_attributed integer NOT NULL DEFAULT 0, -- cents
  clicks integer NOT NULL DEFAULT 0,
  rank integer,
  UNIQUE (bounty_id, clipper_id, clip_url)
);

CREATE INDEX IF NOT EXISTS idx_bounty_submissions_bounty ON clip_bounty_submissions(bounty_id);
CREATE INDEX IF NOT EXISTS idx_bounty_submissions_clipper ON clip_bounty_submissions(clipper_id);

CREATE TABLE IF NOT EXISTS clip_bounty_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id uuid NOT NULL REFERENCES clip_bounties(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES clip_bounty_submissions(id) ON DELETE SET NULL,
  clipper_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reward_type text NOT NULL,
  reward_detail text,
  badge_key text,
  status text NOT NULL DEFAULT 'awarded' CHECK (status IN ('pending','awarded','held','reversed')),
  payout_id uuid,                     -- reserved for future cash bounties (null in v1)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bounty_awards_bounty ON clip_bounty_awards(bounty_id);

ALTER TABLE clip_bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE clip_bounty_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clip_bounty_awards ENABLE ROW LEVEL SECURITY;

-- Bounties: owner full control; active bounties are publicly readable (fans/clippers browse).
DROP POLICY IF EXISTS "Artists manage own bounties" ON clip_bounties;
CREATE POLICY "Artists manage own bounties" ON clip_bounties
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Read active bounties" ON clip_bounties;
CREATE POLICY "Read active bounties" ON clip_bounties
  FOR SELECT USING (
    status IN ('active','ended','awarded')
    OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- Submissions: clipper sees their own; owning artist sees all for their bounties.
-- Writes go through the service role in /api/bounties (validates eligibility).
DROP POLICY IF EXISTS "Clippers read own submissions" ON clip_bounty_submissions;
CREATE POLICY "Clippers read own submissions" ON clip_bounty_submissions
  FOR SELECT USING (clipper_id = auth.uid());

DROP POLICY IF EXISTS "Artists read bounty submissions" ON clip_bounty_submissions;
CREATE POLICY "Artists read bounty submissions" ON clip_bounty_submissions
  FOR SELECT USING (
    bounty_id IN (SELECT id FROM clip_bounties WHERE artist_id IN
      (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Service manages submissions" ON clip_bounty_submissions;
CREATE POLICY "Service manages submissions" ON clip_bounty_submissions
  FOR ALL USING (
    bounty_id IN (SELECT id FROM clip_bounties WHERE artist_id IN
      (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  )
  WITH CHECK (true);

-- Awards: clipper sees own; artist sees own bounties'.
DROP POLICY IF EXISTS "Clippers read own awards" ON clip_bounty_awards;
CREATE POLICY "Clippers read own awards" ON clip_bounty_awards
  FOR SELECT USING (clipper_id = auth.uid());

DROP POLICY IF EXISTS "Artists read bounty awards" ON clip_bounty_awards;
CREATE POLICY "Artists read bounty awards" ON clip_bounty_awards
  FOR SELECT USING (
    bounty_id IN (SELECT id FROM clip_bounties WHERE artist_id IN
      (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  );

DO $$
BEGIN
  IF to_regclass('public.clip_bounties') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: clip_bounties missing'; END IF;
  IF to_regclass('public.clip_bounty_submissions') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: clip_bounty_submissions missing'; END IF;
  IF to_regclass('public.clip_bounty_awards') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: clip_bounty_awards missing'; END IF;
  RAISE NOTICE 'OK: clip bounties tables created';
END $$;

COMMIT;
