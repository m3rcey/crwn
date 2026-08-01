-- ============================================================
-- Membership strategy: the artist's chosen operating model
-- ============================================================
-- CRWN_UPDATED_RELEASE_STRATEGY.md, implemented 2026-08-01. The recommendation
-- itself is DERIVED on read (src/lib/membershipStrategy.ts, deterministic, like
-- the roadmap): nothing is stored for it. The ONLY thing stored is the artist's
-- explicit override, per the house rule that the recommendation is advisory and
-- the artist's choice wins ("unless changed by the user").
--
-- NULL means "no override": surfaces show the derived recommendation. The code
-- fails soft while this column is missing (the strategy API catches 42703 and
-- simply reports no override), so ship order does not matter.

BEGIN;

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS membership_strategy TEXT
    CHECK (membership_strategy IS NULL OR membership_strategy IN ('release_club', 'vault_membership'));

-- The two DECLARED facts that actually distinguish the strategies (spec section
-- 20): how deep the unreleased archive is, and how often the artist releases
-- publicly. CRWN cannot observe either, so the strategy card asks. NULL means
-- "never answered" and the brain treats it as unknown rather than zero.
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS declared_unreleased_tracks INTEGER
    CHECK (declared_unreleased_tracks IS NULL OR declared_unreleased_tracks >= 0),
  ADD COLUMN IF NOT EXISTS declared_releases_per_year INTEGER
    CHECK (declared_releases_per_year IS NULL OR declared_releases_per_year >= 0);

-- Column privileges: artist_profiles carries per-column grants (the table-level
-- grant was revoked when the Stripe ids were hardened). A new column WITHOUT a
-- grant makes select('*') 42501 for every browser client, killing unrelated
-- pages. Grant read; writes stay server-side (the update trigger freezes
-- protected columns for end users, and this one is written via the API's
-- service role only).
GRANT SELECT (membership_strategy, declared_unreleased_tracks, declared_releases_per_year)
  ON artist_profiles TO anon, authenticated;

COMMIT;

-- ============================================================
-- Self-verify
-- ============================================================
DO $$
DECLARE
  col TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY['membership_strategy', 'declared_unreleased_tracks', 'declared_releases_per_year'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'artist_profiles' AND column_name = col
    ) THEN
      RAISE EXCEPTION 'MIGRATION FAILED: artist_profiles.% missing', col;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.column_privileges
       WHERE table_name = 'artist_profiles'
         AND column_name = col
         AND grantee IN ('anon', 'authenticated')
         AND privilege_type = 'SELECT'
    ) THEN
      RAISE EXCEPTION 'MIGRATION FAILED: % has no SELECT grant (select(*) will 42501 for browser clients)', col;
    END IF;
  END LOOP;

  RAISE NOTICE 'schema-phase2-membership-strategy: OK';
END $$;
