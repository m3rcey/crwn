-- ============================================================
-- Release waterfall: the staggered tier schedule on a track
-- ============================================================
-- Release strategy spec sections 11 / 28.4, implemented 2026-08-01. A
-- members-first track can open tier by tier: the top tier hears it on upload,
-- lower tiers as their window opens, everyone when it closes.
--
-- THE ENTITLEMENT GATE IS UNCHANGED by this file. This column is a SCHEDULE:
-- the daily scheduled-releases cron ADDS a tier id to allowed_tier_ids when its
-- entry comes due and removes the entry. Adding a tier only ever grants access,
-- so scheduler failure cannot lock out a paying member; the worst case is a
-- tier opening late.
--
-- CORRECTION (2026-08-13). This header used to claim "can_play_track and every
-- reader still see only is_free / allowed_tier_ids / public_release_date". The
-- first half was right, the list was WRONG: can_play_track read is_free and
-- allowed_tier_ids only, never public_release_date, and it returned true on
-- is_free alone. Since fieldsForClass('paid_first') sets is_free = true for the
-- whole window, the oracle handed anonymous readers the audio for every
-- members-first track. That is fixed in
-- schema-phase2-early-access-window-enforcement.sql, which MUST BE APPLIED
-- FIRST: this file schedules exactly the content class that oracle gates.
--
-- Shape: jsonb array of { "tier_id": uuid-string, "opens_at": ISO timestamp }.
-- Entries are consumed as they open; NULL or [] means no pending openings.

BEGIN;

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS waterfall JSONB;

-- tracks carries per-column privileges (the audio columns are revoked), so a
-- new column without a grant would make any select naming it fail for browser
-- clients. The schedule is not sensitive (it is WHEN tiers unlock, which the
-- public countdown already implies), so read is granted; writes go through the
-- artist's own UPDATE policy and the service-role cron.
GRANT SELECT (waterfall) ON tracks TO anon, authenticated;

COMMIT;

-- ============================================================
-- Self-verify
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'tracks' AND column_name = 'waterfall'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tracks.waterfall missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
     WHERE table_name = 'tracks'
       AND column_name = 'waterfall'
       AND grantee IN ('anon', 'authenticated')
       AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tracks.waterfall has no SELECT grant';
  END IF;

  RAISE NOTICE 'schema-phase2-track-waterfall: OK';
END $$;
