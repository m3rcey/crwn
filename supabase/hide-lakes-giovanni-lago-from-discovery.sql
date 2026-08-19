-- Take Lakes, Giovanni Maziq and Lago OUT of discovery, without touching their accounts.
--
-- What this does NOT do, on purpose: it does not deactivate anybody. All three
-- keep their login, their dashboard, their /[slug] page, their music, their fans,
-- their tiers and their payouts. Every one of them can still use the whole app.
-- The only thing that changes is that CRWN stops PROMOTING them: they drop out of
-- Home's Featured Artists row and out of Explore's browse lists, tiles and tracks
-- both. Setting the flag back to false restores everything instantly.
--
-- FOUR rows for three artists. "Lago" has two accounts, and both display as Lago:
--   lago   (595df156-...) 0 active tracks   <- the empty duplicate
--   lagoo  (5102ee60-...) 14 active tracks  <- the real catalog
-- Hiding only `lago` would have left all 14 of Lago's songs sitting on Explore,
-- which is the opposite of the ask. Both are hidden. The empty one was never
-- eligible to be featured anyway (featuring requires music), so hiding it costs
-- nothing and closes the duplicate-account gap.
--
-- Matched by SLUG, which is immutable-in-practice and unique, never by display
-- name: two of these four rows share the display name "Lago", so a name match
-- would be ambiguous by construction.
--
-- ALREADY APPLIED 2026-08-18 (by service-role PATCH, verified through the anon
-- view: all four read featured_hidden=true, all four accounts still role=artist
-- and is_active=true, all four /[slug] pages still return 200). This file is kept
-- as the record of what was changed and as the way to REVERSE it: flip the value
-- to false and re-run. Safe to re-run either way. Self-verifies.
-- Requires schema-phase2-featured-hidden.sql, which is APPLIED in production
-- (probed 2026-08-18: artist_profiles_public returns featured_hidden).

BEGIN;

UPDATE artist_profiles
   SET featured_hidden = true
 WHERE slug IN ('lakes', 'giovannimaziq', 'lago', 'lagoo');

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
   WHERE slug IN ('lakes', 'giovannimaziq', 'lago', 'lagoo')
     AND featured_hidden IS TRUE;

  IF hidden_count <> 4 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: expected 4 hidden artists, found %', hidden_count;
  END IF;

  -- The whole point of this file is that it hides WITHOUT deactivating. If any of
  -- these accounts is not active, something other than this statement touched them
  -- and the founder needs to know before anyone reports being locked out.
  SELECT count(*) INTO still_active
    FROM artist_profiles a
    JOIN profiles p ON p.id = a.user_id
   WHERE a.slug IN ('lakes', 'giovannimaziq', 'lago', 'lagoo')
     AND p.is_active IS NOT FALSE;

  IF still_active <> 4 THEN
    RAISE EXCEPTION 'CHECK FAILED: only % of 4 accounts are still active. Hiding must never deactivate.', still_active;
  END IF;

  RAISE NOTICE 'OK: 4 artists hidden from discovery, all 4 accounts still active.';
END $$;
