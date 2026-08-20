-- schema-phase2-song-lab.sql
-- SONG LAB — GB The G1ft's fan co-creation experiment. ARTIST-SCOPED, dark for everyone else.
--
-- GB builds songs in public: Instagram runs the frictionless A/B/C poll, CRWN captures the
-- fans who want a deeper seat. This migration ships the smallest schema that supports it:
--
--   1. artist_profiles.song_lab_enabled  — the per-artist capability gate, modeled EXACTLY on
--      launch_partner: server-only, NO grant to anon/authenticated, flipped here for slug 'gb'
--      and nobody else. Every Song Lab route and page reads it through
--      src/lib/songLab/access.ts and fails closed/soft.
--   2. song_lab_projects   — a song being built with fans ("SONG #03").
--   3. song_lab_decisions  — one A/B/C creative decision per stage (Beat, Melody, Hook...).
--      A decision IS a stage; there is no separate stage entity. ADVISORY ONLY, same ratified
--      rule as session_polls: a vote never binds the artist ("full creative control" stays true).
--   4. song_lab_votes      — one counted vote per fan per decision, UNIQUE at the DB, upserted
--      by the server so a re-vote CHANGES the choice (same semantics as session_poll_votes).
--   5. song_lab_offers     — GB's configurable free lead magnets ("Get the final vote"), so he
--      can audition acquisition offers WITHOUT code deploys. Not smart_links: extending that
--      editor would surface experiment fields to every artist's default product.
--   6. song_lab_offer_claims — the attribution spine: which offer produced which fan, whether
--      the claim produced a fresh free join, and whether the account was brand new. Joins to
--      subscriptions/earnings on (artist_id, fan_id) answer "which magnet produced fans who
--      later paid" with COUNTS at read time; no new analytics stack.
--
-- Deliberately NOT here: Instagram vote ingestion (Instagram keeps its own votes), any rights
-- or royalty grant (recognition is Special-Thanks-class only), Team Splits, cash incentives,
-- a campaign/leaderboard surface, per-option media files.
--
-- Why session_polls was not reused: session_polls.session_id and session_poll_votes.session_id
-- are NOT NULL hard FKs to live_sessions, every auth path resolves through the session row, and
-- the invariant registry ratifies "every Executive Producer surface is grafted onto Live". An
-- async decision needs artist-scoped auth, open/close windows and tier eligibility of its own.
-- The proven PATTERNS are copied verbatim: denormalized artist_id for RLS, UNIQUE(decision, fan),
-- service-role-only writes, no client INSERT policy, aggregate tallies computed server-side.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

-- ── 1. Per-artist capability gate (launch_partner pattern: server-only) ─────────
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS song_lab_enabled boolean NOT NULL DEFAULT false;
-- NO GRANT on purpose. The table-level grant on artist_profiles was revoked long ago
-- (schema-phase2-stripe-id-column-privs.sql); leaving this column ungranted keeps it
-- server-only, exactly like launch_partner and testimonial_requests_enabled.

-- ── 2. Projects ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS song_lab_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  artwork_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  -- Artist-entered "what happens next" line ("Next decision: Friday"). Display only.
  next_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_song_lab_projects_artist ON song_lab_projects(artist_id, status);

-- ── 3. Decisions (a decision IS a creative stage) ───────────────────────────────
CREATE TABLE IF NOT EXISTS song_lab_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES song_lab_projects(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE, -- denormalized for RLS
  stage_label text NOT NULL,           -- 'Beat', 'Melody', 'Hook', 'Cover', 'Title'...
  question text NOT NULL,
  -- [{ "id": "a", "label": "Beat A" }, ...]. Stable option ids so votes survive label edits.
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')),
  -- Eligibility mirrors the platform's ONE entitlement vocabulary (live_sessions, tracks):
  -- is_free = any signed-in fan may vote; otherwise the fan's active tier must appear in
  -- allowed_tier_ids. Votes ALWAYS require auth (one counted vote per fan).
  is_free boolean NOT NULL DEFAULT false,
  allowed_tier_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  opens_at timestamptz,                -- null = open the moment status = 'open'
  closes_at timestamptz,               -- null = open until the artist closes it
  winning_option_id text,              -- set by the ARTIST at finalize; advisory, never automatic
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_song_lab_decisions_project ON song_lab_decisions(project_id, status);
CREATE INDEX IF NOT EXISTS idx_song_lab_decisions_artist ON song_lab_decisions(artist_id, status);

-- ── 4. Votes ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS song_lab_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES song_lab_decisions(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE, -- denormalized for RLS
  fan_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  option_id text NOT NULL,             -- validated against options in the vote route
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT song_lab_vote_unique UNIQUE (decision_id, fan_id)  -- one counted vote per fan
);

CREATE INDEX IF NOT EXISTS idx_song_lab_votes_decision ON song_lab_votes(decision_id);
CREATE INDEX IF NOT EXISTS idx_song_lab_votes_fan ON song_lab_votes(artist_id, fan_id);

-- ── 5. Offers (configurable free lead magnets) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS song_lab_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  slug text NOT NULL,                  -- link path segment: /{artistSlug}/join/{slug}
  name text NOT NULL,                  -- internal label in the manager
  headline text NOT NULL,              -- "GET THE FINAL VOTE"
  description text,                    -- "Instagram picked the finalists. GB's Day Ones decide."
  cta_label text NOT NULL DEFAULT 'Join free',
  -- What claiming delivers. 'vote' points at a decision; 'content'/'other' at an internal
  -- path the artist supplies; 'recognition' lands on the Lab itself. CRWN fulfills natively
  -- ONLY what it can gate (voting, lab access); anything else is artist-fulfilled and the
  -- manager says so.
  benefit_kind text NOT NULL DEFAULT 'vote' CHECK (benefit_kind IN ('vote','content','recognition','other')),
  project_id uuid REFERENCES song_lab_projects(id) ON DELETE SET NULL,
  decision_id uuid REFERENCES song_lab_decisions(id) ON DELETE SET NULL,
  destination_path text,               -- internal path only; validated server-side on save AND on claim
  -- Which tier a claim enrolls. Must belong to this artist and be price = 0 (validated at
  -- write time in the API; the claim route re-validates). Null = the artist's free tier.
  tier_id uuid REFERENCES subscription_tiers(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  campaign text,                       -- optional normalized source slug for link tagging
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT song_lab_offer_slug_unique UNIQUE (artist_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_song_lab_offers_artist ON song_lab_offers(artist_id, is_active);

-- ── 6. Offer claims (the attribution spine) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS song_lab_offer_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES song_lab_offers(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  fan_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- What the claim actually did: 'joined' = this claim created the free membership;
  -- 'already_member' = the fan was already subscribed to this artist. Never a guess.
  join_result text NOT NULL CHECK (join_result IN ('joined','already_member')),
  -- Account created within 30 minutes of the claim = this offer plausibly produced the SIGNUP,
  -- not just the join. Recorded at claim time because auth.users is not joinable later.
  fresh_signup boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT song_lab_claim_unique UNIQUE (offer_id, fan_id)
);

CREATE INDEX IF NOT EXISTS idx_song_lab_claims_artist ON song_lab_offer_claims(artist_id, created_at);

-- ── 7. RLS + grants ─────────────────────────────────────────────────────────────
ALTER TABLE song_lab_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_lab_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_lab_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_lab_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_lab_offer_claims ENABLE ROW LEVEL SECURITY;

-- Tighten the default grants FIRST (the session_polls migration skipped this and its
-- USING(true) SELECT policy became a public PostgREST read of everything).
REVOKE ALL ON song_lab_projects, song_lab_decisions, song_lab_votes, song_lab_offers, song_lab_offer_claims FROM anon, authenticated;
-- Public marketing surface: an Instagram viewer may see projects, non-draft decisions and
-- active offers BEFORE signing up. Votes and claims stay closed to anon entirely.
GRANT SELECT ON song_lab_projects, song_lab_decisions, song_lab_offers TO anon, authenticated;
GRANT SELECT ON song_lab_votes TO authenticated;

-- Projects: the world sees non-archived projects; the owner sees and manages everything.
-- No gate-flag subquery here on purpose: creation is gated server-side, so rows exist only
-- for enabled artists, and referencing the ungranted song_lab_enabled column inside a policy
-- would 42501 the whole read for anon.
DROP POLICY IF EXISTS "Public reads live projects" ON song_lab_projects;
CREATE POLICY "Public reads live projects" ON song_lab_projects
  FOR SELECT USING (status <> 'archived');
DROP POLICY IF EXISTS "Artist manages own projects" ON song_lab_projects;
CREATE POLICY "Artist manages own projects" ON song_lab_projects
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- Decisions: drafts are invisible to the public (enumeration returns nothing an open page
-- would not show); owner manages everything.
DROP POLICY IF EXISTS "Public reads non-draft decisions" ON song_lab_decisions;
CREATE POLICY "Public reads non-draft decisions" ON song_lab_decisions
  FOR SELECT USING (status <> 'draft');
DROP POLICY IF EXISTS "Artist manages own decisions" ON song_lab_decisions;
CREATE POLICY "Artist manages own decisions" ON song_lab_decisions
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- Votes: a fan sees their own vote; the owning artist sees their lab's votes. ALL writes go
-- through the service-role vote route (auth + open-window + eligibility re-derived there),
-- so there is deliberately NO client INSERT/UPDATE policy.
DROP POLICY IF EXISTS "Fan reads own lab votes" ON song_lab_votes;
CREATE POLICY "Fan reads own lab votes" ON song_lab_votes
  FOR SELECT USING (fan_id = auth.uid());
DROP POLICY IF EXISTS "Artist reads own lab votes" ON song_lab_votes;
CREATE POLICY "Artist reads own lab votes" ON song_lab_votes
  FOR SELECT USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- Offers: the world sees active offers (that is the landing page); owner manages everything.
DROP POLICY IF EXISTS "Public reads active offers" ON song_lab_offers;
CREATE POLICY "Public reads active offers" ON song_lab_offers
  FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "Artist manages own offers" ON song_lab_offers;
CREATE POLICY "Artist manages own offers" ON song_lab_offers
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- Claims: service-role writes only; the owning artist may read (analytics reads go through
-- the owner-checked API anyway, this is defense in depth, not a surface).
DROP POLICY IF EXISTS "Artist reads own offer claims" ON song_lab_offer_claims;
CREATE POLICY "Artist reads own offer claims" ON song_lab_offer_claims
  FOR SELECT USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- ── 8. Enable GB, and ONLY GB ──────────────────────────────────────────────────
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE artist_profiles SET song_lab_enabled = true WHERE slug = 'gb';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Song Lab enablement expected exactly 1 artist (slug gb), updated %', v_count;
  END IF;
END $$;

-- ── 9. GB's recognition badge (reuses the existing fan_badges award primitive) ──
-- "Day One A&R" is deliberately non-rights-bearing language: it grants no songwriting,
-- production, ownership, publishing, royalty, credit, approval or Team Split rights, ever.
INSERT INTO fan_badges (artist_id, key, label, icon, color, description)
SELECT ap.id, 'day_one_anr', 'Day One A&R', '🌅', '#D4AF37',
       'Helped shape this artist''s songs from the very beginning'
FROM artist_profiles ap
WHERE ap.slug = 'gb'
  AND NOT EXISTS (
    SELECT 1 FROM fan_badges fb WHERE fb.artist_id = ap.id AND fb.key = 'day_one_anr'
  );

COMMIT;

-- ── Self-verify (privilege and relrowsecurity facts, not mere existence) ────────
DO $$
DECLARE
  v_bad text;
  v_enabled integer;
BEGIN
  -- Tables exist with RLS actually enabled
  SELECT string_agg(t, ', ') INTO v_bad FROM unnest(ARRAY[
    'song_lab_projects','song_lab_decisions','song_lab_votes','song_lab_offers','song_lab_offer_claims'
  ]) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity
  );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Song Lab tables missing or RLS not enabled: %', v_bad;
  END IF;

  -- The gate column exists and is NOT granted to client roles (server-only, like launch_partner)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'artist_profiles' AND column_name = 'song_lab_enabled'
  ) THEN
    RAISE EXCEPTION 'artist_profiles.song_lab_enabled missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'artist_profiles'
      AND column_name = 'song_lab_enabled' AND grantee IN ('anon','authenticated')
  ) THEN
    RAISE EXCEPTION 'song_lab_enabled must stay server-only; a client grant exists';
  END IF;

  -- Client roles must NOT hold INSERT/UPDATE/DELETE on any Song Lab table
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('song_lab_projects','song_lab_decisions','song_lab_votes','song_lab_offers','song_lab_offer_claims')
      AND grantee IN ('anon','authenticated')
      AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'Client roles hold write privileges on a Song Lab table; writes are service-role only';
  END IF;

  -- anon must NOT be able to read votes or claims
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('song_lab_votes','song_lab_offer_claims')
      AND grantee = 'anon' AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'anon can read song_lab_votes/claims; that grant must not exist';
  END IF;

  -- Exactly one enabled artist, and it is gb
  SELECT count(*) INTO v_enabled FROM artist_profiles WHERE song_lab_enabled = true;
  IF v_enabled <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 song_lab_enabled artist, found %', v_enabled;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM artist_profiles WHERE slug = 'gb' AND song_lab_enabled = true) THEN
    RAISE EXCEPTION 'gb is not the enabled artist';
  END IF;
END $$;

-- Human-readable receipt (Supabase hides RAISE NOTICE; report in a result set)
SELECT
  (SELECT count(*) FROM artist_profiles WHERE song_lab_enabled) AS enabled_artists,
  (SELECT slug FROM artist_profiles WHERE song_lab_enabled LIMIT 1) AS enabled_slug,
  (SELECT count(*) FROM fan_badges fb JOIN artist_profiles ap ON ap.id = fb.artist_id
    WHERE ap.slug = 'gb' AND fb.key = 'day_one_anr') AS gb_day_one_badge,
  'song lab schema applied' AS status;
