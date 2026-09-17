-- Take Julius Williams OUT of CRWN's discovery rows, without touching his account.
--
-- Asked for on 2026-09-17: remove Julius Williams from Home's Featured Artists row.
--
-- What this does NOT do, on purpose: it does not deactivate him. He keeps his
-- login, his dashboard, his /julius-williams page, his music, his fans, his tiers,
-- his payouts, and his Sept 26 live show links (the St. James join QR and the
-- one-tap scoreboard). The only thing that changes is that CRWN stops PROMOTING
-- him. Setting the flag back to false restores the tile instantly.
--
-- SCOPE, stated plainly because the lever is wider than the ask. `featured_hidden`
-- is the ONE founder-controlled discovery flag and it is read by two surfaces:
--   1. Home's Featured Artists row (the ask) - the tile goes away.
--   2. Explore's BROWSE lists - his tile and his tracks leave the browse rows,
--      and he stays findable by SEARCH (hiding a tile must never make a real
--      artist unreachable; that rule is in src/app/api/explore/route.ts).
-- There is no homepage-only flag, and a second column for one artist would be a
-- schema change for no proven need.
--
-- Matched by SLUG, which is unique, never by display name.
--
-- ALREADY APPLIED 2026-09-17 (by service-role PATCH, verified through the anon
-- view: julius-williams reads featured_hidden=true, the account is still
-- role=artist and is_active=true, and /julius-williams plus both live show links
-- still return 200). This file is kept as the record of what was changed and as
-- the way to REVERSE it: flip the value to false and re-run. Safe to re-run
-- either way. Self-verifies.
-- Requires schema-phase2-featured-hidden.sql, which is APPLIED in production
-- (probed 2026-09-17: artist_profiles_public returns featured_hidden).

BEGIN;

UPDATE artist_profiles
   SET featured_hidden = true
 WHERE slug = 'julius-williams';

COMMIT;

-- ---------------------------------------------------------------------------
-- Self-verify. Fails loudly rather than reporting success on a partial apply.
DO $$
DECLARE
  hidden_count INT;
  still_active INT;
BEGIN
  SELECT count(*) INTO hidden_count
    FROM artist_profiles
   WHERE slug = 'julius-williams'
     AND featured_hidden IS TRUE;

  IF hidden_count <> 1 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: julius-williams is not hidden (matched % rows)', hidden_count;
  END IF;

  -- The whole point of this file is that it hides WITHOUT deactivating. If the
  -- account is not active, something other than this statement touched it and the
  -- founder needs to know before Julius reports being locked out before his show.
  SELECT count(*) INTO still_active
    FROM artist_profiles a
    JOIN profiles p ON p.id = a.user_id
   WHERE a.slug = 'julius-williams'
     AND p.is_active IS NOT FALSE;

  IF still_active <> 1 THEN
    RAISE EXCEPTION 'CHECK FAILED: julius-williams is no longer active. Hiding must never deactivate.';
  END IF;

  RAISE NOTICE 'OK: julius-williams hidden from discovery, account still active.';
END $$;

-- To bring him back:
--   UPDATE artist_profiles SET featured_hidden = false WHERE slug = 'julius-williams';
-- To see who is currently hidden:
--   SELECT ap.slug, p.display_name FROM artist_profiles ap
--     JOIN profiles p ON p.id = ap.user_id WHERE ap.featured_hidden;
