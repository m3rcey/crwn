-- Add phone and onboarding_completed columns to profiles table

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Backfill: any user with an artist_profile has completed onboarding
UPDATE profiles SET onboarding_completed = true
WHERE id IN (SELECT user_id FROM artist_profiles);

-- Backfill: any user with a display_name set has completed onboarding
UPDATE profiles SET onboarding_completed = true
WHERE display_name IS NOT NULL AND onboarding_completed = false;
