-- ═══════════════════════════════════════════════════════════
-- CRM Contacts & Lists — Admin contact management
-- ═══════════════════════════════════════════════════════════

-- CRM Lists (for organizing imported contacts)
CREATE TABLE IF NOT EXISTS crm_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  contact_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- CRM Contacts
CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  instagram TEXT,
  source TEXT DEFAULT 'import',
  status TEXT DEFAULT 'lead' CHECK (status IN ('lead', 'contacted', 'onboarding', 'active', 'churned')),
  tags JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  list_id UUID REFERENCES crm_lists(id) ON DELETE SET NULL,
  artist_profile_id UUID REFERENCES artist_profiles(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique on email to prevent duplicate imports
CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_email_unique ON crm_contacts (LOWER(email));

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS crm_contacts_status_idx ON crm_contacts (status);
CREATE INDEX IF NOT EXISTS crm_contacts_list_id_idx ON crm_contacts (list_id);
CREATE INDEX IF NOT EXISTS crm_contacts_artist_profile_id_idx ON crm_contacts (artist_profile_id);
CREATE INDEX IF NOT EXISTS crm_contacts_source_idx ON crm_contacts (source);

-- No RLS needed — these tables are only accessed via admin API routes using service role client
