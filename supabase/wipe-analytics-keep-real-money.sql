-- wipe-analytics-keep-real-money.sql (2026-08-25, founder order)
--
-- "Everything wiped except the paying fans data." One run, one transaction.
--
-- WIPES:
--   * All behavioral analytics: lead_magnet_events, funnel_events, site_visits,
--     artist_page_visits, opportunity_ledger, tier_events (except real paying fans),
--     play_history (except real paying fans), and lead_magnet_results/leads that are the
--     founder's or anonymous test runs.
--   * The ENTIRE demo seed from seed-demo-data.sql: the 20 dd000001-* fake fans, their fake
--     subscriptions (demo_sub_*), the fake earnings (demo_* payment ids, the $2,408 on the
--     admin roster), fake posts/comments/likes/cancellations/campaign/ai insights.
--   * Public play counts are RECOMPUTED from the plays that survive, so the seeded
--     inflation (+50..200 per track) disappears too.
-- KEEPS:
--   * Real money: any subscription with a real Stripe id (sub_...) on a priced tier, its
--     earnings, and the analytics rows belonging to those paying fans. (Today that is the
--     founder's GB test purchase and one real m3rcey subscriber; the rule is general.)
--   * Captured leads with a non-founder email, and their results (CRM, not metrics).
--   * popup_events (pop-up governor cap state, not a metric).
-- SAFETY:
--   * Every table is copied to a wipe_backup_20260825_* table BEFORE any delete. To undo,
--     the data is all still in the database. When you are sure, run
--     supabase/drop-wipe-backups.sql to remove the copies.

BEGIN;

-- ---------------------------------------------------------------- 0) BACKUPS
CREATE TABLE wipe_backup_20260825_lead_magnet_events AS SELECT * FROM lead_magnet_events;
CREATE TABLE wipe_backup_20260825_funnel_events      AS SELECT * FROM funnel_events;
CREATE TABLE wipe_backup_20260825_site_visits        AS SELECT * FROM site_visits;
CREATE TABLE wipe_backup_20260825_artist_page_visits AS SELECT * FROM artist_page_visits;
CREATE TABLE wipe_backup_20260825_tier_events        AS SELECT * FROM tier_events;
CREATE TABLE wipe_backup_20260825_opportunity_ledger AS SELECT * FROM opportunity_ledger;
CREATE TABLE wipe_backup_20260825_lm_results         AS SELECT * FROM lead_magnet_results;
CREATE TABLE wipe_backup_20260825_lm_leads           AS SELECT * FROM lead_magnet_leads;
CREATE TABLE wipe_backup_20260825_play_history       AS SELECT * FROM play_history;
CREATE TABLE wipe_backup_20260825_track_play_counts  AS SELECT id, play_count FROM tracks;
CREATE TABLE wipe_backup_20260825_demo_subscriptions AS
  SELECT * FROM subscriptions WHERE fan_id::text LIKE 'dd000001-%' OR stripe_subscription_id LIKE 'demo!_%' ESCAPE '!';
CREATE TABLE wipe_backup_20260825_demo_earnings AS
  SELECT * FROM earnings WHERE stripe_payment_id LIKE 'demo!_%' ESCAPE '!' OR fan_id::text LIKE 'dd000001-%';
CREATE TABLE wipe_backup_20260825_demo_profiles AS
  SELECT * FROM profiles WHERE id::text LIKE 'dd000001-%';

-- ------------------------------------------- 1) THE DEMO SEED, GONE ENTIRELY
-- This is seed-demo-data.sql's own cleanup block, run without the re-insert.
DO $$
DECLARE
  v_artist_profile_id UUID := '0cfd2ad9-c37c-4b68-863e-6db0aa939893'; -- m3rcey
  v_all_fans UUID[] := ARRAY(
    SELECT ('dd000001-de00-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid
    FROM generate_series(1, 20) n
  );
  v_posts UUID[] := ARRAY(
    SELECT ('dd000003-de00-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid
    FROM generate_series(1, 5) n
  );
  v_campaign_1 UUID := 'dd000004-de00-4000-a000-000000000001';
BEGIN
  DELETE FROM campaign_sends WHERE campaign_id = v_campaign_1;
  DELETE FROM campaigns WHERE id = v_campaign_1;
  DELETE FROM ai_insights WHERE artist_id = v_artist_profile_id AND title LIKE '%[demo]%';
  DELETE FROM likes WHERE user_id = ANY(v_all_fans);
  DELETE FROM likes WHERE likeable_type = 'post' AND likeable_id = ANY(v_posts);
  DELETE FROM comments WHERE author_id = ANY(v_all_fans);
  DELETE FROM posts WHERE id = ANY(v_posts);
  DELETE FROM cancellation_reasons WHERE user_id = ANY(v_all_fans);
  DELETE FROM earnings WHERE stripe_payment_id LIKE 'demo!_%' ESCAPE '!' OR fan_id = ANY(v_all_fans);
  DELETE FROM subscriptions WHERE fan_id = ANY(v_all_fans);
  DELETE FROM play_history WHERE user_id = ANY(v_all_fans);
  DELETE FROM profiles WHERE id = ANY(v_all_fans);
  DELETE FROM auth.users WHERE id = ANY(v_all_fans);
END $$;

-- --------------------------------- 2) WHO IS A REAL PAYING FAN (kept, always)
-- A real Stripe subscription (sub_...) on a tier that costs money. Never demo_, never free_.
CREATE TEMP TABLE paying_fans ON COMMIT DROP AS
SELECT DISTINCT s.fan_id
FROM subscriptions s
JOIN subscription_tiers t ON t.id = s.tier_id
WHERE s.fan_id IS NOT NULL
  AND t.price > 0
  AND s.stripe_subscription_id ~ '^sub_';

-- ------------------------------------------------------- 3) THE ANALYTICS WIPE
DELETE FROM lead_magnet_events;
DELETE FROM funnel_events;
DELETE FROM site_visits;
DELETE FROM artist_page_visits;
DELETE FROM opportunity_ledger;

DELETE FROM tier_events
WHERE fan_id IS NULL OR fan_id NOT IN (SELECT fan_id FROM paying_fans);

-- Results: anonymous test runs and the founder's own go; a result tied to a real prospect's
-- captured email stays (that is CRM, not a metric).
DELETE FROM lead_magnet_results
WHERE lead_id IS NULL
   OR lead_id IN (SELECT id FROM lead_magnet_leads WHERE lower(email) = 'joshn.wms@gmail.com');
DELETE FROM lead_magnet_leads WHERE lower(email) = 'joshn.wms@gmail.com';

DELETE FROM play_history
WHERE user_id NOT IN (SELECT fan_id FROM paying_fans);

-- ------------------- 4) PUBLIC PLAY COUNTS: recomputed from surviving reality
UPDATE tracks SET play_count = 0 WHERE COALESCE(play_count, 0) <> 0;
UPDATE tracks t
SET play_count = ph.cnt
FROM (
  SELECT track_id, COUNT(*)::int AS cnt
  FROM play_history
  WHERE completed = true
  GROUP BY track_id
) ph
WHERE t.id = ph.track_id;

-- ------------------------------------------------------------- 5) SELF-VERIFY
DO $$
DECLARE
  leftover int;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM lead_magnet_events) +
    (SELECT COUNT(*) FROM funnel_events) +
    (SELECT COUNT(*) FROM site_visits) +
    (SELECT COUNT(*) FROM artist_page_visits) +
    (SELECT COUNT(*) FROM opportunity_ledger) +
    (SELECT COUNT(*) FROM tier_events WHERE fan_id IS NULL OR fan_id NOT IN (SELECT fan_id FROM paying_fans)) +
    (SELECT COUNT(*) FROM play_history WHERE user_id NOT IN (SELECT fan_id FROM paying_fans)) +
    (SELECT COUNT(*) FROM lead_magnet_results WHERE lead_id IS NULL) +
    (SELECT COUNT(*) FROM lead_magnet_leads WHERE lower(email) = 'joshn.wms@gmail.com') +
    (SELECT COUNT(*) FROM subscriptions WHERE stripe_subscription_id LIKE 'demo!_%' ESCAPE '!') +
    (SELECT COUNT(*) FROM earnings WHERE stripe_payment_id LIKE 'demo!_%' ESCAPE '!') +
    (SELECT COUNT(*) FROM profiles WHERE id::text LIKE 'dd000001-%')
  INTO leftover;
  IF leftover > 0 THEN
    RAISE EXCEPTION 'wipe-analytics: % rows that should be gone remain', leftover;
  END IF;
END $$;

COMMIT;
