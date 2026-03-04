-- Platform Tiers Schema for CRWN

-- Add platform_tier to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS platform_tier TEXT DEFAULT NULL;

-- Platform tier options: 'starter', 'pro', 'label'
-- starter: free, limited features
-- pro: $49/mo, full features
-- label: $149/mo, advanced features + white-label
