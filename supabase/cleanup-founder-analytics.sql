-- cleanup-founder-analytics.sql (2026-08-25)
--
-- Removes every historical metric row that can be attributed to the founder: the admin
-- account(s), the account behind joshn.wms@gmail.com, and the m3rcey test artist account.
-- Anonymous rows are caught through two bridges:
--   * visitor_hash bridge: any device hash that ever fired a tier event while signed in to a
--     founder account also identifies that device's anonymous page/site visits.
--   * anon_id bridge: any anonymous funnel id that ever co-occurred with a founder user_id
--     identifies that browser's anonymous funnel rows.
-- What this deliberately does NOT touch:
--   * popup_events: they are the frequency-cap STATE of the pop-up governor, not a surfaced
--     metric. Deleting them would re-show old pop-ups.
--   * lead_magnet_results: the founder's claimed results seed real product state (plan
--     recommendation, roadmap goal). Their EVENTS are deleted; the results stay.
--   * money rows (earnings, subscriptions, tips): real ledgers, never analytics.
--   * Anonymous rows with no bridge to a founder identity: unattributable by design
--     (visitor_hash is a one-way digest), so they cannot be found to be deleted.
-- Forward-looking exclusion is in code (src/lib/analytics/doNotTrack.ts): the crwn_dnt device
-- cookie plus the admin-role skip in recordFunnelEvent stop new rows from being written.

BEGIN;

-- 1) The founder's user ids.
CREATE TEMP TABLE founder_ids ON COMMIT DROP AS
SELECT id FROM profiles WHERE role = 'admin'
UNION
SELECT id FROM auth.users WHERE lower(email) = 'joshn.wms@gmail.com'
UNION
SELECT user_id AS id FROM artist_profiles WHERE slug = 'm3rcey' AND user_id IS NOT NULL;

-- 2) Device hashes those accounts have been seen on (tier_events is the only table carrying
--    both a visitor_hash and a user id, so it is the bridge).
CREATE TEMP TABLE founder_hashes ON COMMIT DROP AS
SELECT DISTINCT visitor_hash FROM tier_events
WHERE fan_id IN (SELECT id FROM founder_ids) AND visitor_hash IS NOT NULL;

-- 3) Anonymous funnel ids those accounts have been seen with.
CREATE TEMP TABLE founder_anon_ids ON COMMIT DROP AS
SELECT DISTINCT anon_id FROM funnel_events
WHERE user_id IN (SELECT id FROM founder_ids) AND anon_id IS NOT NULL;

-- 4) Founder-claimed lead results identify the founder's calculator events.
CREATE TEMP TABLE founder_result_ids ON COMMIT DROP AS
SELECT id FROM lead_magnet_results
WHERE user_id IN (SELECT id FROM founder_ids)
   OR converted_user_id IN (SELECT id FROM founder_ids);

-- 5) Give plays back before deleting the rows that count them: only COMPLETED listens ever
--    incremented tracks.play_count, so decrement by exactly those.
UPDATE tracks t
SET play_count = GREATEST(0, COALESCE(t.play_count, 0) - ph.cnt)
FROM (
  SELECT track_id, COUNT(*)::int AS cnt
  FROM play_history
  WHERE user_id IN (SELECT id FROM founder_ids) AND completed = true
  GROUP BY track_id
) ph
WHERE t.id = ph.track_id;

-- 6) The deletions.
DELETE FROM play_history WHERE user_id IN (SELECT id FROM founder_ids);

DELETE FROM funnel_events
WHERE user_id IN (SELECT id FROM founder_ids)
   OR anon_id IN (SELECT anon_id FROM founder_anon_ids);

DELETE FROM tier_events
WHERE fan_id IN (SELECT id FROM founder_ids)
   OR visitor_hash IN (SELECT visitor_hash FROM founder_hashes);

DELETE FROM artist_page_visits
WHERE visitor_hash IN (SELECT visitor_hash FROM founder_hashes);

DELETE FROM site_visits
WHERE visitor_hash IN (SELECT visitor_hash FROM founder_hashes);

DELETE FROM lead_magnet_events
WHERE result_id IN (SELECT id FROM founder_result_ids);

-- 7) Self-verify: nothing attributable to a founder identity may remain.
DO $$
DECLARE
  leftover int;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM play_history WHERE user_id IN (SELECT id FROM founder_ids)) +
    (SELECT COUNT(*) FROM funnel_events WHERE user_id IN (SELECT id FROM founder_ids)) +
    (SELECT COUNT(*) FROM tier_events WHERE fan_id IN (SELECT id FROM founder_ids)) +
    (SELECT COUNT(*) FROM tier_events WHERE visitor_hash IN (SELECT visitor_hash FROM founder_hashes)) +
    (SELECT COUNT(*) FROM artist_page_visits WHERE visitor_hash IN (SELECT visitor_hash FROM founder_hashes)) +
    (SELECT COUNT(*) FROM site_visits WHERE visitor_hash IN (SELECT visitor_hash FROM founder_hashes)) +
    (SELECT COUNT(*) FROM lead_magnet_events WHERE result_id IN (SELECT id FROM founder_result_ids))
  INTO leftover;
  IF leftover > 0 THEN
    RAISE EXCEPTION 'cleanup-founder-analytics: % attributable rows remain', leftover;
  END IF;
END $$;

COMMIT;
