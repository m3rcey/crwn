-- ============================================================
-- Rename the four pre-2026-07-30 tier rows to the stock ladder
-- ============================================================
-- The recommended ladder is Bronze / Silver / Gold / Platinum (free / $10 / $25
-- / $100). Four rows in production predate that rename and still read The Wave /
-- Inner Circle / The Vault / Throne. They are not a deliberate artist choice,
-- they are the old defaults, and Josh's rule is that the ladder defaults to
-- Bronze/Silver/Gold/Platinum unless the artist changes it.
--
-- SCOPED TO slug 'm3rcey' ON PURPOSE. Probed production 2026-08-01: all four of
-- these rows belong to that artist and no other artist carries those exact
-- names. Renaming by name+price alone would also catch a DIFFERENT artist who
-- deliberately named a tier "Inner Circle", and changing what a paying fan sees
-- on their subscription is not something to do by accident. To widen it later,
-- drop the artist_id predicate.
--
-- Note: other artists DO have "The Inner Circle" and "The Throne". Those are
-- deliberately untouched. The ladder's normalizeTierName() already treats them
-- as the matching rung, so they will not be offered a duplicate.
--
-- Stripe product names are separate and cosmetic; billing is unaffected.

BEGIN;

UPDATE subscription_tiers t
   SET name = CASE t.name
                WHEN 'The Wave'     THEN 'Bronze'
                WHEN 'Inner Circle' THEN 'Silver'
                WHEN 'The Vault'    THEN 'Gold'
                WHEN 'Throne'       THEN 'Platinum'
              END
 WHERE t.artist_id IN (SELECT id FROM artist_profiles WHERE slug = 'm3rcey')
   AND (
        (t.name = 'The Wave'     AND t.price = 0)
     OR (t.name = 'Inner Circle' AND t.price = 1000)
     OR (t.name = 'The Vault'    AND t.price = 2500)
     OR (t.name = 'Throne'       AND t.price = 10000)
   );

COMMIT;

-- ============================================================
-- Self-verify: the rename either completed for this artist or it did not
-- happen at all. A price that does not match the ladder means the row was
-- customized and should NOT have been renamed, so we fail loudly instead.
-- ============================================================
DO $$
DECLARE
  leftover INTEGER;
  renamed INTEGER;
BEGIN
  SELECT COUNT(*) INTO leftover
    FROM subscription_tiers t
   WHERE t.artist_id IN (SELECT id FROM artist_profiles WHERE slug = 'm3rcey')
     AND t.name IN ('The Wave', 'Inner Circle', 'The Vault', 'Throne');

  IF leftover > 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: % legacy-named tier(s) remain for m3rcey (price mismatch?)', leftover;
  END IF;

  SELECT COUNT(*) INTO renamed
    FROM subscription_tiers t
   WHERE t.artist_id IN (SELECT id FROM artist_profiles WHERE slug = 'm3rcey')
     AND t.name IN ('Bronze', 'Silver', 'Gold', 'Platinum');

  RAISE NOTICE 'schema-phase2-rename-legacy-tiers: OK (% ladder tiers now named)', renamed;
END $$;
