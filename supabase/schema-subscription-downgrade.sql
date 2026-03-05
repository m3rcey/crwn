-- Migration: Add pending_tier_id and pending_change_date to subscriptions
-- Date: 2026-03-04
-- Purpose: Support scheduled tier upgrades/downgrades for fan subscriptions

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pending_tier_id uuid REFERENCES subscription_tiers(id);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pending_change_date timestamp with time zone;
