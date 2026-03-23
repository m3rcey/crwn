-- New Sequence Triggers
-- Adds post_purchase_upsell, win_back, and inactive_subscriber triggers

-- Expand the trigger_type check constraint
ALTER TABLE sequences DROP CONSTRAINT IF EXISTS sequences_trigger_type_check;
ALTER TABLE sequences ADD CONSTRAINT sequences_trigger_type_check
  CHECK (trigger_type IN (
    'new_subscription',
    'new_purchase',
    'tier_upgrade',
    'post_purchase_upsell',
    'win_back',
    'inactive_subscriber'
  ));
