-- drop-wipe-backups.sql
-- Run this ONLY after you are satisfied the wipe (wipe-analytics-keep-real-money.sql) kept
-- what it should have. It permanently deletes the safety copies the wipe made.

DROP TABLE IF EXISTS wipe_backup_20260825_lead_magnet_events;
DROP TABLE IF EXISTS wipe_backup_20260825_funnel_events;
DROP TABLE IF EXISTS wipe_backup_20260825_site_visits;
DROP TABLE IF EXISTS wipe_backup_20260825_artist_page_visits;
DROP TABLE IF EXISTS wipe_backup_20260825_tier_events;
DROP TABLE IF EXISTS wipe_backup_20260825_opportunity_ledger;
DROP TABLE IF EXISTS wipe_backup_20260825_lm_results;
DROP TABLE IF EXISTS wipe_backup_20260825_lm_leads;
DROP TABLE IF EXISTS wipe_backup_20260825_play_history;
DROP TABLE IF EXISTS wipe_backup_20260825_track_play_counts;
DROP TABLE IF EXISTS wipe_backup_20260825_demo_subscriptions;
DROP TABLE IF EXISTS wipe_backup_20260825_demo_earnings;
DROP TABLE IF EXISTS wipe_backup_20260825_demo_profiles;
