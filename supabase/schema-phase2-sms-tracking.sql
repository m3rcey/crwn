-- SMS Campaign Delivery Tracking
-- Run manually in Supabase SQL Editor
-- IMPORTANT: Apply this BEFORE deploying the SMS tracking code changes

-- Add channel support to campaigns table
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'email' CHECK (channel IN ('email', 'sms'));

-- Add SMS-specific columns to campaign_sends
ALTER TABLE campaign_sends
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS twilio_message_sid TEXT;

-- Allow null email for SMS sends
ALTER TABLE campaign_sends ALTER COLUMN email DROP NOT NULL;

-- Add delivered status to campaign_sends
ALTER TABLE campaign_sends DROP CONSTRAINT IF EXISTS campaign_sends_status_check;
ALTER TABLE campaign_sends ADD CONSTRAINT campaign_sends_status_check
  CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'));

-- Index for looking up sends by Twilio SID (delivery status webhook)
CREATE INDEX IF NOT EXISTS idx_campaign_sends_twilio_sid
  ON campaign_sends(twilio_message_sid) WHERE twilio_message_sid IS NOT NULL;

-- Index for SMS campaign sends
CREATE INDEX IF NOT EXISTS idx_campaign_sends_channel
  ON campaign_sends(campaign_id, channel) WHERE channel = 'sms';
