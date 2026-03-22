-- Admin Dashboard Infrastructure
-- Adds tables for: visitor tracking, admin settings, last_active_at on profiles

-- 1. Add last_active_at to profiles for churn risk tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Site visits table for revenue-per-visitor tracking
CREATE TABLE IF NOT EXISTS site_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visitor_hash TEXT NOT NULL, -- hashed IP+UA, no PII stored
  is_authenticated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(visit_date, visitor_hash)
);

-- Index for fast daily aggregation
CREATE INDEX IF NOT EXISTS idx_site_visits_date ON site_visits(visit_date);

-- 3. Admin settings table for configurable fixed costs etc.
CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Seed default fixed costs
INSERT INTO admin_settings (key, value) VALUES
  ('fixed_costs', '{
    "supabase": 2500,
    "resend": 2500,
    "claude": 10000,
    "domain": 108,
    "vercel": 0,
    "cloudflare": 0
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 4. Metrics cache table for hourly aggregation
CREATE TABLE IF NOT EXISTS admin_metrics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL, -- '7d', '30d', '90d', '365d'
  metrics JSONB NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period)
);

-- RLS policies
ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_metrics_cache ENABLE ROW LEVEL SECURITY;

-- Only admin role can read admin tables
CREATE POLICY "Admin read site_visits" ON site_visits
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin read admin_settings" ON admin_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin update admin_settings" ON admin_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin read metrics_cache" ON admin_metrics_cache
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Service role will handle inserts for site_visits and metrics_cache (bypasses RLS)
