-- Partner applications table
CREATE TABLE IF NOT EXISTS partner_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  platform TEXT NOT NULL,
  audience_size TEXT NOT NULL,
  profile_url TEXT NOT NULL,
  why_crwn TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE partner_applications ENABLE ROW LEVEL SECURITY;

-- Only service role can insert/read (no public access)
-- No RLS policies needed — service role bypasses RLS
