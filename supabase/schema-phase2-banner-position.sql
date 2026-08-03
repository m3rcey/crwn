-- Banner reposition (v2 interface redesign, PR 10)
--
-- The artist drags their banner to reframe it. What persists is TWO NUMBERS
-- (a CSS object-position in percent), never a re-encoded image: the upload is
-- untouched, so reframing is free, lossless and reversible.
--
--   banner_pos_x / banner_pos_y   0-100, default 50 (centred)
--
-- Same three-part rule as every other artist_profiles column (learned the hard
-- way on the palette migration): ADD COLUMN, per-column GRANT, rebuild the
-- public view. Idempotent — safe to run again.

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS banner_pos_x numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS banner_pos_y numeric NOT NULL DEFAULT 50;

-- Clamp at the database, not just the UI: this value is interpolated into a
-- style on a public page.
ALTER TABLE artist_profiles
  DROP CONSTRAINT IF EXISTS artist_profiles_banner_pos_range,
  ADD CONSTRAINT artist_profiles_banner_pos_range
    CHECK (banner_pos_x >= 0 AND banner_pos_x <= 100
       AND banner_pos_y >= 0 AND banner_pos_y <= 100);

-- artist_profiles SELECT is per-column (the blanket grant was revoked by
-- schema-phase2-stripe-id-column-privs.sql), so a new column is unreadable
-- until granted explicitly.
GRANT SELECT (banner_pos_x, banner_pos_y)
  ON public.artist_profiles TO anon, authenticated;

-- The public page reads the VIEW, which enumerates columns at creation time.
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

-- Self-verify: columns, constraint, grants, and the view rebuild.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artist_profiles' AND column_name = 'banner_pos_x'
  ) THEN
    RAISE EXCEPTION 'banner-position migration incomplete: banner_pos_x missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artist_profiles' AND column_name = 'banner_pos_y'
  ) THEN
    RAISE EXCEPTION 'banner-position migration incomplete: banner_pos_y missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'artist_profiles' AND constraint_name = 'artist_profiles_banner_pos_range'
  ) THEN
    RAISE EXCEPTION 'banner-position migration incomplete: range check missing';
  END IF;
  IF (
    SELECT count(*) FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'artist_profiles'
      AND privilege_type = 'SELECT'
      AND grantee IN ('anon', 'authenticated')
      AND column_name IN ('banner_pos_x', 'banner_pos_y')
  ) < 4 THEN
    RAISE EXCEPTION 'banner-position migration incomplete: SELECT grants missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'artist_profiles_public'
      AND column_name = 'banner_pos_x'
  ) THEN
    RAISE EXCEPTION 'banner-position migration incomplete: not exposed on artist_profiles_public (view not rebuilt)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'artist_profiles_public'
      AND column_name IN ('stripe_connect_id', 'platform_stripe_customer_id', 'platform_stripe_subscription_id')
  ) THEN
    RAISE EXCEPTION 'banner-position migration incomplete: view rebuild re-exposed a Stripe id column';
  END IF;
  RAISE NOTICE 'banner-position migration verified OK';
END $$;
