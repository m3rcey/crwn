-- Add phone column to profiles table
-- Required by onboarding flow (welcome page stores phone, login page checks it)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
