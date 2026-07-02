-- schema-phase2-artist-setup-wizard.sql
--
-- Adds the `setup_completed` flag that gates the new focused artist setup wizard
-- (/setup). After signup an artist is held full-screen in the wizard — Profile →
-- Monetize → Music → Shop → share screen — and cannot use the rest of the app
-- until they finish it. The hard gate lives in src/app/(main)/layout.tsx and
-- reads this column; it flips true when the artist reaches the share screen and
-- clicks "Enter CRWN", at which point the dashboard tour takes over.
--
-- Per-step completion is NOT stored here — it is derived from real data (a
-- published profile, >=1 track, >=1 tier, >=1 product) so the flags can never
-- drift from the truth. This column only records "the artist finished the
-- wizard once" so we do not trap them in it forever.
--
-- NOT auto-run. Apply manually in the Supabase SQL Editor.

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN NOT NULL DEFAULT false;

-- Existing artists predate the wizard — they already have live pages, so never
-- trap them in setup. Mark every current row done. New rows (created at /welcome
-- from here on) get the DEFAULT false and are routed through the wizard.
UPDATE artist_profiles SET setup_completed = true WHERE setup_completed = false;

-- Self-verify: fail loudly in the SQL editor if the column did not land, instead
-- of half-applying silently (see CLAUDE.md "Onboarding Safety Net").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artist_profiles' AND column_name = 'setup_completed'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: artist_profiles.setup_completed column is missing';
  END IF;
END $$;
