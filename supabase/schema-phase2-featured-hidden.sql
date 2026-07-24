-- Hide a specific artist from public discovery rows WITHOUT deactivating them.
--
-- The problem: Home's Featured Artists row features anyone with music + an avatar
-- + a presentable name. That is the right default, but there was no way to take a
-- single artist OUT of it. The only existing lever was `profiles.is_active =
-- false`, which deactivates the whole account across the app. Turning off a real
-- artist's account because their tile reads badly is the wrong-sized tool.
--
-- This adds one boolean the founder controls. It hides the artist from DISCOVERY
-- surfaces only. Their account, their /[slug] page, their music, their fans and
-- their payouts are all untouched, and flipping it back restores the tile.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run. Self-verifies.

BEGIN;

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS featured_hidden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN artist_profiles.featured_hidden IS
  'Founder-controlled: exclude this artist from Featured/discovery rows. Does NOT deactivate the account or hide their public page.';

-- The public view enumerates its columns AT CREATION TIME, so a new column on the
-- base table is invisible to it until the view is rebuilt. Without this the app
-- would read `featured_hidden` as undefined and the flag would silently do
-- nothing. Same column-exclusion list as schema-phase2-artist-profiles-public-view.sql
-- (the Stripe ids stay out), and the view must remain SECURITY DEFINER or the
-- column-privilege REVOKE from that migration breaks it.
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

COMMIT;

-- ---------------------------------------------------------------------------
-- Self-verify: fail loudly on a partial apply instead of silently half-landing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'artist_profiles'
       AND column_name = 'featured_hidden'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: artist_profiles.featured_hidden missing';
  END IF;

  -- The whole point: the app reads the VIEW, not the table.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'artist_profiles_public'
       AND column_name = 'featured_hidden'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: featured_hidden not exposed on artist_profiles_public (view not rebuilt)';
  END IF;

  -- Rebuilding the view must not have re-exposed the Stripe ids.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'artist_profiles_public'
       AND column_name IN ('stripe_connect_id', 'platform_stripe_customer_id', 'platform_stripe_subscription_id')
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: rebuilt view leaks a Stripe id column';
  END IF;

  -- It must NOT be security_invoker, or the column-privilege REVOKE breaks it.
  IF EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'artist_profiles_public'
       AND reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: artist_profiles_public must not be security_invoker';
  END IF;

  RAISE NOTICE 'schema-phase2-featured-hidden: OK';
END $$;

-- ---------------------------------------------------------------------------
-- Hide the artist Josh asked to remove from Featured Artists (2026-07-24).
-- Their account stays fully active; only the discovery tile goes away.
UPDATE artist_profiles
   SET featured_hidden = true
 WHERE user_id = '9852e4fa-e2b3-45a1-8b9b-7099e05d4f17';

-- To bring any artist back later:
--   UPDATE artist_profiles SET featured_hidden = false WHERE slug = '<slug>';
-- To see who is currently hidden:
--   SELECT ap.slug, p.display_name FROM artist_profiles ap
--     JOIN profiles p ON p.id = ap.user_id WHERE ap.featured_hidden;
