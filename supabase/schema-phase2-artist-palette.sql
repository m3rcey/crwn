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
-- renders them) and writable by the owner through the existing UPDATE policy
-- (the freeze trigger is a deny-list, so these columns pass through).
--
-- IDEMPOTENT: already ran an earlier version? Run it again. The first version
-- was missing the per-column SELECT grants below, and artist_profiles has NO
-- table-level SELECT grant since the stripe-id hardening, so without them the
-- new columns read as 42501 for anon/authenticated and the public page can
-- never see the palette.

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS accent_hex text,
  ADD COLUMN IF NOT EXISTS accent2_hex text,
  ADD COLUMN IF NOT EXISTS surface_hex text;

-- artist_profiles SELECT is per-column (schema-phase2-stripe-id-column-privs.sql
-- revoked the blanket grant), so every new column must be granted explicitly or
-- it is unreadable from the browser AND poisons any query that names it.
GRANT SELECT (accent_hex, accent2_hex, surface_hex)
  ON public.artist_profiles TO anon, authenticated;

-- The public artist page reads the VIEW, not the table, and the view enumerates
-- its columns AT CREATION TIME: a new base-table column is invisible until the
-- view is rebuilt. Same exclusion list and SECURITY DEFINER ownership pattern
-- as schema-phase2-featured-hidden.sql (the Stripe ids stay out).
DO $$
DECLARE
  cols TEXT;
BEGIN
  SELECT string_agg(format('a.%I', attname), ', ' ORDER BY attnum)
    INTO cols
    FROM pg_attribute
   WHERE attrelid = 'public.artist_profiles'::regclass
     AND attnum > 0
     AND NOT attisdropped
     AND attname NOT IN (
       'stripe_connect_id',
       'platform_stripe_customer_id',
       'platform_stripe_subscription_id'
     );

  IF cols IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: could not enumerate columns of artist_profiles';
  END IF;

  EXECUTE 'DROP VIEW IF EXISTS artist_profiles_public';
  EXECUTE format('CREATE VIEW artist_profiles_public AS SELECT %s FROM artist_profiles a', cols);
  EXECUTE 'GRANT SELECT ON artist_profiles_public TO anon, authenticated';
END $$;

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
  -- The grants are the part v1 of this file missed; verify per column, per role.
  IF (
    SELECT count(*) FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'artist_profiles'
      AND privilege_type = 'SELECT'
      AND grantee IN ('anon', 'authenticated')
      AND column_name IN ('accent_hex', 'accent2_hex', 'surface_hex')
  ) < 6 THEN
    RAISE EXCEPTION 'artist-palette migration incomplete: SELECT grants missing (public page cannot read the palette)';
  END IF;
  -- The app reads the VIEW: the palette must be exposed on it.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'artist_profiles_public'
      AND column_name = 'accent_hex'
  ) THEN
    RAISE EXCEPTION 'artist-palette migration incomplete: accent_hex not exposed on artist_profiles_public (view not rebuilt)';
  END IF;
  -- Rebuilding the view must not have re-exposed the Stripe ids.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'artist_profiles_public'
      AND column_name IN ('stripe_connect_id', 'platform_stripe_customer_id', 'platform_stripe_subscription_id')
  ) THEN
    RAISE EXCEPTION 'artist-palette migration incomplete: view rebuild re-exposed a Stripe id column';
  END IF;
  RAISE NOTICE 'artist-palette migration verified OK';
END $$;
