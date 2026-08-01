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

-- Column privileges: artist_profiles carries per-column grants (the table-level
-- grant was revoked when the Stripe ids were hardened). A new column WITHOUT a
-- grant makes select('*') 42501 for every browser client, killing unrelated
-- pages. Grant read; writes stay server-side (the update trigger freezes
-- protected columns for end users, and this one is written via the API's
-- service role only).
GRANT SELECT (membership_strategy) ON artist_profiles TO anon, authenticated;

COMMIT;

-- ============================================================
-- Self-verify
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'artist_profiles' AND column_name = 'membership_strategy'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: artist_profiles.membership_strategy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
     WHERE table_name = 'artist_profiles'
       AND column_name = 'membership_strategy'
       AND grantee IN ('anon', 'authenticated')
       AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: membership_strategy has no SELECT grant (select(*) will 42501 for browser clients)';
  END IF;

  RAISE NOTICE 'schema-phase2-membership-strategy: OK';
END $$;
