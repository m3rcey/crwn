-- Artist palette (v2 interface redesign, 2026-08-02)
--
-- The public artist page derives its colourway from the artist's own banner:
-- samplePalette() (src/lib/palette.ts) runs ONCE in the browser at banner
-- upload and the three roles are persisted here. Nothing recomputes per visit.
--
--   accent_hex   dominant hue by area  -> CTAs, active tab, play glyph, tier card
--   accent2_hex  cluster >=35deg away  -> second stop of the ambient gradient
--   surface_hex  image average, mixed  -> card grounds
--
-- All three are nullable: NULL means "no usable colour sampled" and the page
-- keeps default CRWN gold. The client writes these in a SEPARATE update and
-- swallows the error, so nothing breaks before this migration runs.
--
-- These are cosmetic, artist-owned values: readable by anon (the public page
-- renders them) and writable by the owner through the existing UPDATE policy.
-- No column-privilege revoke is needed.

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS accent_hex text,
  ADD COLUMN IF NOT EXISTS accent2_hex text,
  ADD COLUMN IF NOT EXISTS surface_hex text;

-- Guard the format so a compromised session cannot stuff arbitrary strings
-- into a value the public page interpolates into styles.
ALTER TABLE artist_profiles
  DROP CONSTRAINT IF EXISTS artist_profiles_accent_hex_format,
  ADD CONSTRAINT artist_profiles_accent_hex_format
    CHECK (accent_hex IS NULL OR accent_hex ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE artist_profiles
  DROP CONSTRAINT IF EXISTS artist_profiles_accent2_hex_format,
  ADD CONSTRAINT artist_profiles_accent2_hex_format
    CHECK (accent2_hex IS NULL OR accent2_hex ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE artist_profiles
  DROP CONSTRAINT IF EXISTS artist_profiles_surface_hex_format,
  ADD CONSTRAINT artist_profiles_surface_hex_format
    CHECK (surface_hex IS NULL OR surface_hex ~ '^#[0-9a-fA-F]{6}$');

-- Self-verify: fail loudly if any piece did not land.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artist_profiles' AND column_name = 'accent_hex'
  ) THEN
    RAISE EXCEPTION 'artist-palette migration incomplete: accent_hex missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artist_profiles' AND column_name = 'accent2_hex'
  ) THEN
    RAISE EXCEPTION 'artist-palette migration incomplete: accent2_hex missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artist_profiles' AND column_name = 'surface_hex'
  ) THEN
    RAISE EXCEPTION 'artist-palette migration incomplete: surface_hex missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'artist_profiles' AND constraint_name = 'artist_profiles_accent_hex_format'
  ) THEN
    RAISE EXCEPTION 'artist-palette migration incomplete: accent_hex format check missing';
  END IF;
  RAISE NOTICE 'artist-palette migration verified OK';
END $$;
