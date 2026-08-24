-- ============================================================================
-- ARTIST DISTRIBUTION FINDER: persisted public-Instagram observations
-- ============================================================================
--
-- WHAT THIS IS
--   Two admin-only tables behind the founder's Artist Distribution Finder
--   (/admin, Distribution tab). Before publishing a carousel about an artist,
--   the founder searches public Instagram data (via Apify, server-side) for
--   large pages that recently posted about that artist. Each search persists
--   its PUBLIC observations here so repeat searches are served from cache
--   instead of re-scraping, and so the artist-to-page graph compounds:
--   over time the same pages showing up across many CRWN-relevant artists
--   become visible.
--
-- THE BOUNDARY
--   - Public Instagram data only: page profiles and post observations that
--     anyone can see. No private accounts, no DMs, no follower lists.
--   - Founder-confidential the other way: which artists CRWN is researching
--     is competitive information, so these tables are admin-only.
--   - RLS enabled, admin-only SELECT (profiles.role = 'admin').
--   - NO INSERT/UPDATE/DELETE policies: all writes go through service-role
--     admin routes gated by requireAdmin().
--   - No captions or media are stored: only the match reason and metrics.
--   - likes/comments/views are NULL when Instagram hides them. NULL means
--     "not publicly observable", never zero.
--
-- WHY A NEW TABLE RATHER THAN REUSING ONE
--   Nothing in the schema models an external social page or a post
--   observation. funnel_events, lead_magnet_results and fan tables all model
--   CRWN users; overloading any of them would leak research data into
--   product surfaces.
--
-- Apply manually in the Supabase SQL editor (project ecpqtuidtsncjfwtkvwc).
-- Additive only, no destructive statement. Select ALL (Ctrl+A) and run the
-- whole file: the last statement prints a proof grid. No grid = no commit.
-- ============================================================================

-- 1. Distribution pages: one row per observed Instagram account ---------------

CREATE TABLE IF NOT EXISTS distribution_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Instagram's numeric user id when the provider returned one.
  ig_user_id TEXT,
  -- Normalized (lowercased) username. The practical identity key.
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  -- NULL = enrichment never observed a count, never zero.
  followers INTEGER,
  verified BOOLEAN,
  is_private BOOLEAN,
  category TEXT,
  biography TEXT,
  profile_url TEXT NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_distribution_pages_ig_user_id
  ON distribution_pages(ig_user_id) WHERE ig_user_id IS NOT NULL;

-- 2. Mentions: one row per (artist, post) observation --------------------------

CREATE TABLE IF NOT EXISTS distribution_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalized artist name ("ryan leslie"): the search/cache key.
  artist_key TEXT NOT NULL,
  artist_handle TEXT,
  -- Normalized username of the page that published the post.
  page_username TEXT NOT NULL,
  -- Strongest stable post identifier (id > shortcode > canonical URL),
  -- prefixed by kind ("id:", "sc:", "url:"). The dedupe key: the same post
  -- surfaced by several search variants lands on this row once.
  post_key TEXT NOT NULL,
  post_url TEXT NOT NULL,
  posted_at TIMESTAMPTZ,
  -- NULL = hidden/not observable, never zero.
  likes INTEGER,
  comments INTEGER,
  views INTEGER,
  -- Auditable reason the post matched the artist.
  match_reason TEXT NOT NULL,
  strong_evidence BOOLEAN NOT NULL DEFAULT FALSE,
  source_query TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (artist_key, post_key)
);

CREATE INDEX IF NOT EXISTS idx_distribution_mentions_artist
  ON distribution_mentions(artist_key, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_distribution_mentions_page
  ON distribution_mentions(page_username);

-- 3. RLS: admin-only reads, service-role-only writes ---------------------------

ALTER TABLE distribution_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribution_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_read_distribution_pages ON distribution_pages;
CREATE POLICY admin_read_distribution_pages ON distribution_pages FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS admin_read_distribution_mentions ON distribution_mentions;
CREATE POLICY admin_read_distribution_mentions ON distribution_mentions FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- No write policies on purpose: writes are service-role only (requireAdmin
-- routes). Revoke every client grant so anon sees nothing and authenticated
-- non-admins resolve zero rows through the SELECT policy above.
REVOKE ALL ON distribution_pages, distribution_mentions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
  distribution_pages, distribution_mentions FROM authenticated;
GRANT SELECT ON distribution_pages, distribution_mentions TO authenticated;

-- 4. Self-verify: a partial apply errors loudly instead of half-landing --------

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['distribution_pages', 'distribution_mentions'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'MIGRATION INCOMPLETE: % table missing', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'MIGRATION INCOMPLETE: RLS not enabled on %', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'admin_read_' || t
    ) THEN
      RAISE EXCEPTION 'MIGRATION INCOMPLETE: admin read policy missing on %', t;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND cmd <> 'SELECT'
    ) THEN
      RAISE EXCEPTION 'MIGRATION INCOMPLETE: % must have no client write policy; writes are service-role only', t;
    END IF;
    -- No client role may hold INSERT/UPDATE/DELETE: writes are service-role only.
    IF EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = t
        AND grantee IN ('anon', 'authenticated')
        AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    ) THEN
      RAISE EXCEPTION 'MIGRATION INCOMPLETE: a client role holds a write grant on %', t;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'distribution_mentions' AND indexname = 'idx_distribution_mentions_artist'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: artist lookup index missing on distribution_mentions';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'distribution_mentions'
      AND constraint_type = 'UNIQUE'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: (artist_key, post_key) unique constraint missing; duplicate posts would double count';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- 5. Proof of commit: the grid below only prints if everything above committed.

SELECT 'distribution_pages' AS object, 'table + RLS + admin read policy' AS state
UNION ALL
SELECT 'distribution_mentions', 'table + RLS + admin read policy + unique (artist_key, post_key)'
UNION ALL
SELECT 'client write grants', 'revoked (service-role writes only)';
