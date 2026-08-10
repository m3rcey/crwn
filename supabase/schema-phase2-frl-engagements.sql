-- schema-phase2-frl-engagements.sql
-- The First Revenue Launch measurement system: engagements, work entries, evidence.
--
-- WHY: the founding cohort (three launch partners, $0-500 implementation by MANUAL
-- Stripe invoice, doc 20) needs internal records of commercial terms, founder labor,
-- and case-study evidence, or CRWN cannot compute 30-day contribution margin per
-- artist. Nothing else stores any of this: implementation fees, hours, and consent
-- exist nowhere in the schema today.
--
-- THREE TABLES, ALL ADMIN-ONLY:
--   frl_engagements   one row per premium service engagement (terms, scope, consent)
--   frl_work_entries  founder/internal labor + direct external costs, dated
--   frl_evidence      case-study evidence record, one per engagement, never auto-published
--
-- Derived facts (guarantee checklist, GMV, platform fees, first paid member,
-- attribution) are NOT stored here; they are computed on read from earnings,
-- funnel_events, and the launch-partner evaluator. These tables hold only what the
-- product cannot derive: money agreed and collected, minutes worked, consent granted.
--
-- SECURITY: fees, labor costs, margins and consent are founder-confidential.
--   - RLS enabled, admin-only SELECT (profiles.role = 'admin').
--   - NO INSERT/UPDATE/DELETE policies: all writes go through service-role admin
--     routes gated by requireAdmin(), which stamp created_by/updated_by.
--   - No grants to anon/authenticated at all (not even column-level), so a client
--     query that names these tables fails loudly rather than leaking.
--
-- Money is INTEGER CENTS everywhere, per the house rule.
--
-- Apply manually in the Supabase SQL Editor. Idempotent; safe to re-run.

BEGIN;

-- 1. Engagements ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS frl_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,

  -- founding_cohort: the three launch partners ($0-500, manual invoice, Pro).
  -- standard: the post-proof offer ($1,500-3,000). self_serve: a non-service
  -- comparison row (no fee, no labor). Future package types widen this CHECK in a
  -- later migration; deliberately NOT abstracted further (no invented packages).
  engagement_type TEXT NOT NULL DEFAULT 'founding_cohort'
    CHECK (engagement_type IN ('founding_cohort', 'standard', 'self_serve')),
  status TEXT NOT NULL DEFAULT 'agreed'
    CHECK (status IN ('agreed', 'active', 'completed', 'cancelled')),

  started_on DATE,                -- service window anchor: 30-day sprint runs from here
  target_launch_on DATE,
  actual_launch_on DATE,
  guarantee_eligible_on DATE,     -- stamped when all required guarantee conditions
                                  -- first verify (the deadline is DERIVED: +30 days;
                                  -- never stored, so there is one source of truth)
  completed_on DATE,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,

  -- Commercial terms. Collected is typed in by the founder as the MANUAL Stripe
  -- invoice is paid; there is deliberately no checkout and no automatic charge.
  fee_agreed_cents BIGINT CHECK (fee_agreed_cents IS NULL OR fee_agreed_cents >= 0),
  fee_collected_cents BIGINT CHECK (fee_collected_cents IS NULL OR fee_collected_cents >= 0),
  discount_cents BIGINT CHECK (discount_cents IS NULL OR discount_cents >= 0),
  discount_reason TEXT,
  required_plan TEXT CHECK (required_plan IS NULL OR required_plan IN ('pro', 'scale')),
  invoice_ref TEXT,               -- manual Stripe invoice id or external payment ref
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'waived')),

  -- Allocated acquisition cost for this artist (admin-entered, dated via updated_at;
  -- NULL means unknown and the CAC metrics report missing, never zero).
  acquisition_cost_cents BIGINT CHECK (acquisition_cost_cents IS NULL OR acquisition_cost_cents >= 0),
  acquisition_cost_note TEXT,

  -- Scope (structured only where reporting needs it; prose for the rest).
  deliverables TEXT,
  exclusions TEXT,
  migration_scope TEXT,
  revision_allowance INT CHECK (revision_allowance IS NULL OR revision_allowance >= 0),
  revisions_used INT NOT NULL DEFAULT 0 CHECK (revisions_used >= 0),
  support_period_days INT CHECK (support_period_days IS NULL OR support_period_days >= 0),
  additional_work_notes TEXT,

  -- Consent and evidence rights. NEVER defaults to granted.
  case_study_consent TEXT NOT NULL DEFAULT 'not_granted'
    CHECK (case_study_consent IN ('not_granted', 'private', 'anonymized', 'public')),
  testimonial_consent TEXT NOT NULL DEFAULT 'not_granted'
    CHECK (testimonial_consent IN ('not_granted', 'private', 'anonymized', 'public')),
  performance_data_consent TEXT NOT NULL DEFAULT 'not_granted'
    CHECK (performance_data_consent IN ('not_granted', 'private', 'anonymized', 'public')),
  consent_on DATE,
  consent_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_frl_engagements_artist ON frl_engagements(artist_id);
CREATE INDEX IF NOT EXISTS idx_frl_engagements_type ON frl_engagements(engagement_type, status);

-- 2. Work entries (labor + direct external cost) --------------------------------
CREATE TABLE IF NOT EXISTS frl_work_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES frl_engagements(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'sales', 'audit', 'migration', 'offer_design', 'page_setup',
    'campaign_creation', 'launch_support', 'fulfillment_support',
    'general_support', 'case_study'
  )),
  work_on DATE NOT NULL,
  minutes INT NOT NULL DEFAULT 0 CHECK (minutes >= 0),
  person_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  -- A direct out-of-pocket cost tied to this entry (contractor, asset, tool),
  -- in integer cents. Labor cost is NOT stored: it is derived on read from
  -- minutes x the dated hourly assumption in admin_settings, so changing the
  -- assumption transparently recomputes and the inputs stay auditable.
  external_cost_cents BIGINT CHECK (external_cost_cents IS NULL OR external_cost_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_frl_work_engagement ON frl_work_entries(engagement_id, work_on);

-- 3. Manual checklist state ------------------------------------------------------
-- Only genuinely MANUAL operator items live here (revenue audit completed, exports
-- received, benefits reviewed, ...). Product-verifiable items (Stripe connected,
-- campaign sent, first paid member, ...) are derived on read through the same
-- evaluator the guarantee checklist uses and are NEVER stored, so an admin cannot
-- override a verified financial outcome. The server allowlists item_key against the
-- registry in src/lib/frl/checklist.ts and rejects derived keys.
CREATE TABLE IF NOT EXISTS frl_checklist_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES frl_engagements(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'not_applicable')),
  completed_on DATE,
  note TEXT,
  minutes_spent INT CHECK (minutes_spent IS NULL OR minutes_spent >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (engagement_id, item_key)
);

-- 4. Case-study evidence ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS frl_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL UNIQUE REFERENCES frl_engagements(id) ON DELETE CASCADE,

  before_summary TEXT,            -- the before-state in the founder's words
  previous_stack TEXT,            -- existing monetization stack (Patreon, Shopify, ...)
  previous_revenue_evidence TEXT, -- prior direct-revenue proof (what was seen, where)
  audience_evidence TEXT,         -- owned-list / audience proof
  offer_launched TEXT,
  tiers_launched TEXT,
  artist_quote TEXT,

  -- Verified migration savings from the stack-replacement audit
  -- (renderStackReplacementReport). Manual entry from the audit call; NULL = not
  -- computed. Never invented by code.
  verified_savings_cents BIGINT CHECK (verified_savings_cents IS NULL OR verified_savings_cents >= 0),

  -- Outcome numbers are snapshotted from the SYSTEM at verification time by the
  -- admin route (paid members, revenue, days to first paid member), stored as one
  -- dated jsonb blob so the case study records what was true when verified. Live
  -- values always come from the economics layer, not from here.
  metrics_snapshot JSONB,
  metrics_snapshot_at TIMESTAMPTZ,

  file_refs JSONB NOT NULL DEFAULT '[]',  -- storage paths of screenshots/documents

  verification_status TEXT NOT NULL DEFAULT 'claimed'
    CHECK (verification_status IN ('claimed', 'system_verified', 'document_verified', 'admin_reviewed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 5. RLS: admin-only reads, service-role-only writes ------------------------------
ALTER TABLE frl_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE frl_work_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE frl_checklist_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE frl_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_read_frl_engagements ON frl_engagements;
CREATE POLICY admin_read_frl_engagements ON frl_engagements FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS admin_read_frl_work_entries ON frl_work_entries;
CREATE POLICY admin_read_frl_work_entries ON frl_work_entries FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS admin_read_frl_checklist_state ON frl_checklist_state;
CREATE POLICY admin_read_frl_checklist_state ON frl_checklist_state FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS admin_read_frl_evidence ON frl_evidence;
CREATE POLICY admin_read_frl_evidence ON frl_evidence FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- No write policies on purpose: writes are service-role only (requireAdmin routes).
-- Revoke every client grant so even SELECT flows only through the RLS policy above
-- for authenticated admins, and anon sees nothing.
REVOKE ALL ON frl_engagements, frl_work_entries, frl_checklist_state, frl_evidence FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
  frl_engagements, frl_work_entries, frl_checklist_state, frl_evidence FROM authenticated;
GRANT SELECT ON frl_engagements, frl_work_entries, frl_checklist_state, frl_evidence TO authenticated;

-- 6. SELF-VERIFY ------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['frl_engagements','frl_work_entries','frl_checklist_state','frl_evidence'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'MIGRATION INCOMPLETE: table % is missing', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c WHERE c.oid = ('public.' || t)::regclass AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'MIGRATION INCOMPLETE: RLS is NOT enabled on % (fees/labor would leak to any authenticated user)', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND cmd = 'SELECT'
    ) THEN
      RAISE EXCEPTION 'MIGRATION INCOMPLETE: % has no admin SELECT policy', t;
    END IF;
    -- No client role may hold INSERT/UPDATE/DELETE: writes are service-role only.
    IF EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = t
        AND grantee IN ('anon', 'authenticated')
        AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    ) THEN
      RAISE EXCEPTION 'MIGRATION INCOMPLETE: a client role holds a write grant on %', t;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'frl_engagements' AND column_name = 'case_study_consent'
      AND column_default NOT LIKE '%not_granted%'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: consent must default to not_granted';
  END IF;

  RAISE NOTICE 'OK: frl_engagements, frl_work_entries, frl_checklist_state, frl_evidence created with admin-only RLS.';
END $$;

COMMIT;
