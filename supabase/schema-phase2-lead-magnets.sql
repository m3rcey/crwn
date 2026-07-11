-- ============================================================================
-- CRWN Lead Magnet System
-- ============================================================================
-- Apply MANUALLY in the Supabase SQL editor (not auto-run). Idempotent.
--
-- Adds three tables:
--   1. lead_magnet_leads   - platform-level ARTIST prospects from public tools.
--   2. lead_magnet_results - saved tool results (artist-owned OR anonymous-by-token).
--   3. lead_magnet_events  - lightweight, anonymous-friendly analytics log.
--
-- These are DISTINCT from:
--   - crm_contacts (admin CRM of artists-as-customers; the /worth calculator dumps there)
--   - fan_contacts (an artist's own fan email list)
--   - fan_events   (requires real artist_id + fan_id FKs; anonymous prospects can't use it)
--
-- Security model:
--   - Public writes happen ONLY via service-role API routes (which authenticate/rate-limit
--     themselves; middleware excludes /api). No public SELECT policy exists, so results are
--     NOT enumerable; public read is by high-entropy token via a server route only.
--   - Logged-in artists may read/mutate ONLY results tied to an artist_profiles row they own.
--   - Admins may read (aggregate reporting).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. lead_magnet_leads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_magnet_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  phone text,
  artist_name text,
  genre text,
  social_handle text,
  monthly_listeners integer,
  main_goal text,
  tool_slug text NOT NULL,
  source_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  email_consent boolean NOT NULL DEFAULT false,
  sms_consent boolean NOT NULL DEFAULT false,
  consent_text_version text,
  consented_at timestamptz,
  converted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_artist_id uuid REFERENCES artist_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dedupe/lookups by normalized email + which tool they used.
CREATE INDEX IF NOT EXISTS idx_lm_leads_email ON lead_magnet_leads (lower(email));
CREATE INDEX IF NOT EXISTS idx_lm_leads_tool ON lead_magnet_leads (tool_slug);
CREATE INDEX IF NOT EXISTS idx_lm_leads_created ON lead_magnet_leads (created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. lead_magnet_results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_magnet_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_slug text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id uuid REFERENCES artist_profiles(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES lead_magnet_leads(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('draft','completed','converted','archived')),
  title text,
  input_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  generator_version text NOT NULL DEFAULT '1.0.0',
  source text NOT NULL DEFAULT 'public' CHECK (source IN ('public','artist')),
  -- High-entropy token for public (pre-signup) resume. Server-validated; never enumerable.
  public_token text UNIQUE,
  public_token_expires_at timestamptz,
  converted_feature_type text,
  converted_record_id uuid,
  converted_at timestamptz,
  last_emailed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lm_results_artist ON lead_magnet_results (artist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lm_results_user ON lead_magnet_results (user_id);
CREATE INDEX IF NOT EXISTS idx_lm_results_tool ON lead_magnet_results (tool_slug);
CREATE INDEX IF NOT EXISTS idx_lm_results_token ON lead_magnet_results (public_token);

-- ---------------------------------------------------------------------------
-- 3. lead_magnet_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_magnet_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  tool_slug text,
  context text CHECK (context IN ('public','artist')),
  authed boolean,
  step integer,
  total_steps integer,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  result_id uuid,
  conversion_target text,
  generator_version text,
  reason_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lm_events_type ON lead_magnet_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lm_events_tool ON lead_magnet_events (tool_slug, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE lead_magnet_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_magnet_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_magnet_events ENABLE ROW LEVEL SECURITY;

-- leads: no direct client access. Only service-role API (bypasses RLS) writes.
-- Admins may read for reporting. (RLS enabled with no permissive policy = deny all others.)
DROP POLICY IF EXISTS "admin_read_lm_leads" ON lead_magnet_leads;
CREATE POLICY "admin_read_lm_leads" ON lead_magnet_leads
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- results: owners (by owned artist_profiles row) manage their own; admins read.
DROP POLICY IF EXISTS "owner_manage_lm_results" ON lead_magnet_results;
CREATE POLICY "owner_manage_lm_results" ON lead_magnet_results
  FOR ALL USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  ) WITH CHECK (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_read_lm_results" ON lead_magnet_results;
CREATE POLICY "admin_read_lm_results" ON lead_magnet_results
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- events: write-only from service role; admins read aggregates.
DROP POLICY IF EXISTS "admin_read_lm_events" ON lead_magnet_events;
CREATE POLICY "admin_read_lm_events" ON lead_magnet_events
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

COMMIT;

-- ---------------------------------------------------------------------------
-- Self-verify (fails LOUDLY on partial apply)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.lead_magnet_leads') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: lead_magnet_leads missing';
  END IF;
  IF to_regclass('public.lead_magnet_results') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: lead_magnet_results missing';
  END IF;
  IF to_regclass('public.lead_magnet_events') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: lead_magnet_events missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_magnet_results' AND column_name = 'public_token'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: lead_magnet_results.public_token missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lead_magnet_results' AND policyname = 'owner_manage_lm_results'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: lead_magnet_results owner RLS policy missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lead_magnet_leads' AND policyname = 'admin_read_lm_leads'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: lead_magnet_leads admin RLS policy missing';
  END IF;
  RAISE NOTICE 'OK: lead magnet tables + RLS created';
END $$;
