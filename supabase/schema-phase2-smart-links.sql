-- Smart Links / Funnel Pages - Phase 5 Marketing Suite
-- Run manually in Supabase SQL Editor

CREATE TABLE smart_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID REFERENCES artist_profiles(id) NOT NULL,
  slug TEXT NOT NULL,
  title TEXT,
  description TEXT,
  destination_url TEXT,
  collect_email BOOLEAN DEFAULT true,
  collect_phone BOOLEAN DEFAULT false,
  collect_name BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  capture_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(artist_id, slug)
);

CREATE TABLE smart_link_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smart_link_id UUID REFERENCES smart_links(id) ON DELETE CASCADE NOT NULL,
  artist_id UUID REFERENCES artist_profiles(id) NOT NULL,
  email TEXT,
  phone TEXT,
  name TEXT,
  city TEXT,
  country TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_smart_links_artist ON smart_links(artist_id, is_active);
CREATE INDEX idx_smart_links_slug ON smart_links(artist_id, slug);
CREATE INDEX idx_smart_link_captures_link ON smart_link_captures(smart_link_id);
CREATE INDEX idx_smart_link_captures_artist ON smart_link_captures(artist_id);

-- RLS
ALTER TABLE smart_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_link_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artists can manage own smart links"
  ON smart_links FOR ALL
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Artists can view own captures"
  ON smart_link_captures FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- Public can view active smart links (for the capture page)
CREATE POLICY "Public can view active smart links"
  ON smart_links FOR SELECT
  USING (is_active = true);
