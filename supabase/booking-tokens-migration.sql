-- Booking Tokens Migration
-- Run this in Supabase SQL Editor

-- Create booking_tokens table
CREATE TABLE IF NOT EXISTS booking_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  artist_id UUID REFERENCES artist_profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'expired')),
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add calendar_link column to artist_profiles
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS calendar_link TEXT;

-- Enable RLS
ALTER TABLE booking_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies for booking_tokens
CREATE POLICY "Users can view their own booking tokens" ON booking_tokens
  FOR SELECT USING (auth.uid() = fan_id);

CREATE POLICY "Service role can manage booking tokens" ON booking_tokens
  FOR ALL USING (auth.role() = 'service_role');
