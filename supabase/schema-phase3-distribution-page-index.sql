-- ============================================================================
-- DISTRIBUTION FINDER: BIG PAGE INDEX (additive upgrade)
-- ============================================================================
--
-- WHAT THIS IS
--   The first live Ryan Leslie search proved global keyword discovery is
--   biased toward tiny superfan accounts: big media pages post an artist
--   without tagging the hashtags CRWN searches, so they are invisible to
--   discovery. The fix is an INDEX of known significant pages plus a cached
--   corpus of their recent public posts, searched locally on every artist
--   search. This migration adds:
--     1. Index metadata columns on distribution_pages (how a page entered the
--        index, whether it is scanned, when its posts were last refreshed).
--     2. distribution_page_posts: the recent-post corpus.
--
-- WHY CAPTIONS ARE STORED (deliberate exception to the earlier "no captions"
--   posture): the corpus exists to answer "which known pages posted about
--   artist X recently" for artists CRWN has not searched yet, which requires
--   matching future artist names against the post text. Public captions only,
--   admin-only table, no media binaries, bounded to ~24 recent posts per page.
--
-- THE BOUNDARY (unchanged from schema-phase3-distribution-finder.sql)
--   Public Instagram data only. Admin-only SELECT, service-role writes via
--   requireAdmin routes, ALL revoked from anon. Research tool, no outreach.
--
-- Apply manually in the Supabase SQL editor (project ecpqtuidtsncjfwtkvwc).
-- Additive only, no destructive statement. Requires
-- schema-phase3-distribution-finder.sql (applied 2026-08-24) to have run
-- first. Select ALL (Ctrl+A) and run the whole file: the last statement
-- prints a proof grid. No grid = no commit.
-- ============================================================================

-- 1. Index metadata on distribution_pages ------------------------------------

ALTER TABLE distribution_pages
  ADD COLUMN IF NOT EXISTS first_discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS discovery_source TEXT NOT NULL DEFAULT 'global_search',
  ADD COLUMN IF NOT EXISTS index_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_posts_refresh_at TIMESTAMPTZ;

ALTER TABLE distribution_pages DROP CONSTRAINT IF EXISTS distribution_pages_discovery_source_check;
ALTER TABLE distribution_pages ADD CONSTRAINT distribution_pages_discovery_source_check
  CHECK (discovery_source IN ('global_search', 'manual', 'bootstrap'));

CREATE INDEX IF NOT EXISTS idx_distribution_pages_index_eligible
  ON distribution_pages(index_eligible) WHERE index_eligible;

-- 2. Recent-post corpus --------------------------------------------------------

CREATE TABLE IF NOT EXISTS distribution_page_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalized username of the indexed page (matches distribution_pages.username).
  page_username TEXT NOT NULL,
  -- Strongest stable post identifier (id > shortcode > canonical URL), same
  -- keying as distribution_mentions.post_key. Refreshes UPDATE, never duplicate.
  post_key TEXT NOT NULL,
  post_url TEXT NOT NULL,
  -- Public caption text, stored ONLY so future artist searches can match
  -- against the cached corpus (see header). No media is stored.
  caption TEXT,
  posted_at TIMESTAMPTZ,
  -- NULL = hidden/not observable, never zero.
  likes INTEGER,
  comments INTEGER,
  views INTEGER,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (page_username, post_key)
);

CREATE INDEX IF NOT EXISTS idx_distribution_page_posts_posted
  ON distribution_page_posts(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_distribution_page_posts_page
  ON distribution_page_posts(page_username);

-- 3. RLS: same lockdown as the other distribution tables -----------------------

ALTER TABLE distribution_page_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_read_distribution_page_posts ON distribution_page_posts;
CREATE POLICY admin_read_distribution_page_posts ON distribution_page_posts FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- No write policies on purpose: writes are service-role only (requireAdmin routes).
REVOKE ALL ON distribution_page_posts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON distribution_page_posts FROM authenticated;
GRANT SELECT ON distribution_page_posts TO authenticated;

-- 4. Self-verify: a partial apply errors loudly instead of half-landing --------

DO $$
DECLARE
  col TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY['first_discovered_at', 'discovery_source', 'index_eligible', 'last_posts_refresh_at'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'distribution_pages' AND column_name = col
    ) THEN
      RAISE EXCEPTION 'MIGRATION INCOMPLETE: distribution_pages.% missing', col;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'distribution_pages_discovery_source_check') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: discovery_source CHECK missing';
  END IF;
  IF to_regclass('public.distribution_page_posts') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: distribution_page_posts table missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'distribution_page_posts' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: RLS not enabled on distribution_page_posts';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'distribution_page_posts' AND policyname = 'admin_read_distribution_page_posts'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: admin read policy missing on distribution_page_posts';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'distribution_page_posts' AND cmd <> 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: distribution_page_posts must have no client write policy';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'distribution_page_posts'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: a client role holds a write grant on distribution_page_posts';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'distribution_page_posts' AND constraint_type = 'UNIQUE'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: (page_username, post_key) unique constraint missing';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- 5. Proof of commit: prints only if everything above committed.

SELECT 'distribution_pages' AS object, 'index metadata columns + discovery_source CHECK' AS state
UNION ALL
SELECT 'distribution_page_posts', 'table + RLS + admin read policy + unique (page_username, post_key)'
UNION ALL
SELECT 'client write grants', 'revoked (service-role writes only)';
