-- schema-phase2-founder-test-exclusion.sql (2026-08-25)
--
-- The acquisition funnel and the 90-day experiment scorecard count ARTIST ACCOUNTS, not event
-- rows, so the analytics wipe cannot zero them: the founder's own test accounts sit in the
-- roster. This adds the flag those dashboards exclude on.
--
-- artist_profiles.is_founder_test = true means "this account exists for testing, never count
-- it in acquisition/activation metrics". It is READ ONLY BY ADMIN ROUTES (service role), so it
-- gets no anon/authenticated column grant, and no browser code may ever select it (naming an
-- ungranted column 42501s the whole statement; see CLAUDE.md).
--
-- Flagged here: every artist owned by an admin-role user (m3rcey), plus the placeholder
-- account that was created with a literal '<their-real-slug>' handle. ADD MORE SLUGS to the
-- list below before running if any other account is yours. Real artists (gb, julius-williams,
-- lakes, ...) stay counted: excluding them would hide real acquisition.

ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS is_founder_test boolean NOT NULL DEFAULT false;

UPDATE artist_profiles
SET is_founder_test = true
WHERE user_id IN (SELECT id FROM profiles WHERE role = 'admin')
   OR slug IN (
        '<their-real-slug>'
        -- , 'another-test-slug'
      );

-- Self-verify: the column exists and at least the admin-owned artist is flagged.
DO $$
DECLARE
  flagged int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artist_profiles' AND column_name = 'is_founder_test'
  ) THEN
    RAISE EXCEPTION 'founder-test-exclusion: column is_founder_test missing';
  END IF;
  SELECT COUNT(*) INTO flagged
  FROM artist_profiles ap
  JOIN profiles p ON p.id = ap.user_id
  WHERE p.role = 'admin' AND ap.is_founder_test = true;
  IF flagged = 0 THEN
    RAISE EXCEPTION 'founder-test-exclusion: no admin-owned artist was flagged';
  END IF;
END $$;
