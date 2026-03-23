-- Fan Contacts / CSV Import - Phase 6 Marketing Suite
-- Run manually in Supabase SQL Editor

CREATE TABLE fan_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID REFERENCES artist_profiles(id) NOT NULL,
  email TEXT,
  phone TEXT,
  name TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  source TEXT DEFAULT 'import' CHECK (source IN ('import', 'smart_link', 'checkout', 'keyword')),
  tags JSONB DEFAULT '[]',
  is_subscribed_email BOOLEAN DEFAULT true,
  is_subscribed_sms BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(artist_id, email)
);

-- Indexes
CREATE INDEX idx_fan_contacts_artist ON fan_contacts(artist_id);
CREATE INDEX idx_fan_contacts_email ON fan_contacts(artist_id, email);
CREATE INDEX idx_fan_contacts_source ON fan_contacts(artist_id, source);

-- RLS
ALTER TABLE fan_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artists can manage own contacts"
  ON fan_contacts FOR ALL
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));
