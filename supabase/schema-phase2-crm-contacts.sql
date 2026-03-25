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

-- ═══════════════════════════════════════════════════════════
-- CRM Outreach — Email campaigns to imported contacts
-- ═══════════════════════════════════════════════════════════

-- Outreach campaigns (admin sends to CRM contacts)
CREATE TABLE IF NOT EXISTS crm_outreaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  list_id UUID REFERENCES crm_lists(id) ON DELETE SET NULL,
  status_filter TEXT,
  tag_filter TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual send records (one per contact per outreach)
CREATE TABLE IF NOT EXISTS crm_outreach_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_id UUID NOT NULL REFERENCES crm_outreaches(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'opened', 'clicked', 'bounced')),
  resend_message_id TEXT,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_outreach_sends_outreach_id_idx ON crm_outreach_sends (outreach_id);
CREATE INDEX IF NOT EXISTS crm_outreach_sends_contact_id_idx ON crm_outreach_sends (contact_id);

-- Unsubscribe list for outreach recipients
CREATE TABLE IF NOT EXISTS crm_outreach_unsubscribes (
  email TEXT PRIMARY KEY,
  unsubscribed_at TIMESTAMPTZ DEFAULT now()
);

-- No RLS needed — these tables are only accessed via admin API routes using service role client
