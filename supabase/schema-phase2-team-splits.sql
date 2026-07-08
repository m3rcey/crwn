-- ============================================================================
-- schema-phase2-team-splits.sql
-- Team Splits / Revenue-Share Deals — core data model + RLS.
-- ============================================================================
-- A Team Split lets an artist offer a COLLABORATOR (videographer, producer,
-- editor, designer, engineer, marketer, manager, etc.) a percentage of a
-- SPECIFIC CRWN revenue source instead of, or in addition to, upfront cash.
--
-- This is DISTINCT from fan/clipper commissions (referrals / referral_earnings):
-- collaborators earn because they helped CREATE/OPERATE something, not because
-- they promoted it. The two ledgers are kept fully separate on purpose — the
-- team_split cashout RPC (schema-phase2-team-splits-cashout-rpc.sql) sums ONLY
-- team_split_earnings, never referral_earnings, so balances never co-mingle.
--
-- MONEY MODEL (v1 = "manual release"):
--   * The daily cron /api/cron/team-split-accruals READS the `earnings` table
--     (the one unified revenue-event log, written by src/lib/webhookHandlers.ts)
--     and WRITES held team_split_earnings rows. It never touches the Stripe
--     webhook money path.
--   * Payout basis defaults to NET artist revenue (earnings.net_amount, already
--     net of platform fee and — on renewals — fan/clipper commission), so a
--     collaborator can never be owed more than the artist actually received, and
--     Team Splits sit AFTER fan/clipper commissions in the stack.
--   * An accrual is only cashable once the ARTIST releases it (released_at set)
--     AND the refund-hold has cleared (cleared_at <= now()). Refunds write a
--     negative, immediately-cleared clawback row (mirrors referral_earnings).
--
-- SECURITY: all writes go through the service-role client in API routes / crons
-- (verified: no browser-client writes). Client policies are SELECT-only and
-- scoped so a collaborator sees ONLY their own deal's rows (privacy), and an
-- artist sees only rows tied to their own artist_profiles row.
--
-- Apply manually in the Supabase SQL Editor. Self-verify block at the tail.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. team_split_deals — the deal + its current terms
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_split_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,

  -- Collaborator: a user (once bound) and/or an email invite + display name.
  collaborator_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  collaborator_email TEXT,
  collaborator_name TEXT,
  invite_token TEXT UNIQUE,               -- for email-invited (no account yet) binding

  role TEXT NOT NULL,                      -- producer/videographer/... (see constants.ts)
  custom_role TEXT,

  title TEXT NOT NULL,
  description TEXT,

  deal_type TEXT NOT NULL DEFAULT 'campaign_share'
    CHECK (deal_type IN (
      'campaign_share','offer_share','subscription_share',
      'artist_earnings_share','milestone_bonus','hybrid','custom'
    )),

  -- Revenue source the split is computed from.
  revenue_source_type TEXT NOT NULL DEFAULT 'none'
    CHECK (revenue_source_type IN (
      'tier','product','track','live_session','booking',
      'road_campaign','all_earnings','custom','none'
    )),
  revenue_source_id UUID,
  revenue_source_label TEXT,               -- display snapshot ("Vault Access tier")

  payout_basis TEXT NOT NULL DEFAULT 'net_artist_revenue'
    CHECK (payout_basis IN ('gross_revenue','net_artist_revenue')),

  percentage NUMERIC(5,2),                 -- 0..100, null for milestone-only
  milestone_amount INTEGER,                -- cents, for milestone_bonus
  milestone_description TEXT,
  upfront_amount INTEGER,                  -- cents, for hybrid (informational; paid off-platform)
  cap_amount INTEGER,                      -- cents, null = no cap (discouraged)
  minimum_payout_threshold INTEGER,        -- cents, null = none

  -- Lifecycle triggers / duration.
  start_trigger TEXT NOT NULL DEFAULT 'on_accept'
    CHECK (start_trigger IN (
      'on_accept','on_deliverable_approval','on_date','on_first_revenue','custom'
    )),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  duration_days INTEGER,

  -- Payout & protection rules.
  payout_starts_after_deliverable_approval BOOLEAN NOT NULL DEFAULT TRUE,
  hold_period_days INTEGER NOT NULL DEFAULT 7,
  auto_approve_deliverable_days INTEGER,   -- null = never auto-approve (Pitfall 7 opt-in)
  refund_policy TEXT NOT NULL DEFAULT 'clawback',
  cancellation_policy TEXT,
  rights_notes TEXT,                       -- IP/usage clarification (Pitfall 18-20)
  external_agreement_url TEXT,

  -- Status machine.
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft','sent','viewed','changes_requested','accepted','active',
      'paused','completed','terminated','cancelled','disputed','expired','archived'
    )),

  current_version INTEGER NOT NULL DEFAULT 1,
  terms_snapshot JSONB,                    -- full terms at current version
  risk_flags JSONB,                        -- computed warnings (see warnings.ts)
  is_high_risk BOOLEAN NOT NULL DEFAULT FALSE,   -- admin filter
  agreement_version TEXT,                  -- disclaimer version both parties saw

  -- Acceptance / audit timestamps.
  artist_accepted_at TIMESTAMPTZ,          -- artist "signs" on send
  collaborator_viewed_at TIMESTAMPTZ,
  collaborator_accepted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,                 -- both parties accepted -> active
  rejected_at TIMESTAMPTZ,
  changes_requested_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  terminated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- An artist can never be their own collaborator (self-dealing guard, Pitfall 13).
  CONSTRAINT team_split_no_self_deal
    CHECK (collaborator_user_id IS NULL OR collaborator_user_id <> created_by OR created_by IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_tsd_artist ON team_split_deals(artist_id);
CREATE INDEX IF NOT EXISTS idx_tsd_collaborator ON team_split_deals(collaborator_user_id);
CREATE INDEX IF NOT EXISTS idx_tsd_status ON team_split_deals(status);
CREATE INDEX IF NOT EXISTS idx_tsd_source ON team_split_deals(revenue_source_type, revenue_source_id);
CREATE INDEX IF NOT EXISTS idx_tsd_invite ON team_split_deals(invite_token);

-- ---------------------------------------------------------------------------
-- 2. team_split_deal_versions — immutable terms history (negotiation trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_split_deal_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES team_split_deals(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  changed_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL
    CHECK (change_type IN ('created','edited','sent','change_request','counter','accepted','terminated')),
  changes_summary TEXT,
  terms_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT team_split_version_unique UNIQUE (deal_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_tsdv_deal ON team_split_deal_versions(deal_id);

-- ---------------------------------------------------------------------------
-- 3. team_split_deliverables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_split_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES team_split_deals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','submitted','revision_requested','approved','rejected','cancelled')),
  approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  submitted_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  revision_notes TEXT,
  file_url TEXT,
  external_link TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tsdel_deal ON team_split_deliverables(deal_id);

-- ---------------------------------------------------------------------------
-- 4. team_split_earnings — the accrual ledger (the money owed a collaborator)
--    Mirrors referral_earnings (hold via cleared_at, clawback via negative
--    rows) but adds released_at: an artist must explicitly RELEASE an accrual
--    before it becomes cashable (manual-release v1).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_split_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES team_split_deals(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  collaborator_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Link to the underlying revenue event (for clawback matching + audit).
  earning_id UUID,                         -- earnings.id that produced this accrual (null for milestone)
  source_type TEXT,
  source_id UUID,

  basis TEXT NOT NULL DEFAULT 'net_artist_revenue',
  basis_amount INTEGER NOT NULL DEFAULT 0, -- the gross or net the % was applied to (cents)
  percentage NUMERIC(5,2),
  gross_amount INTEGER NOT NULL DEFAULT 0, -- underlying event gross (display, cents)
  commission_amount INTEGER NOT NULL,      -- what the collaborator earns (cents; negative = clawback)

  status TEXT NOT NULL DEFAULT 'held'
    CHECK (status IN ('held','released','paid','reversed','disputed')),
  cleared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- refund hold; cashable when <= now()
  released_at TIMESTAMPTZ,                          -- artist manual release; required to cash out
  paid_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tse_deal ON team_split_earnings(deal_id);
CREATE INDEX IF NOT EXISTS idx_tse_artist ON team_split_earnings(artist_id);
CREATE INDEX IF NOT EXISTS idx_tse_collab ON team_split_earnings(collaborator_user_id, released_at, cleared_at);
CREATE INDEX IF NOT EXISTS idx_tse_earning ON team_split_earnings(earning_id);
-- Idempotent accrual: one row per (deal, underlying earning). Lets the daily
-- cron re-scan safely — a duplicate insert violates this and is skipped.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tse_deal_earning
  ON team_split_earnings(deal_id, earning_id) WHERE earning_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. team_split_payouts — collaborator cashout records (separate from fan_payouts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_split_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','failed')),
  stripe_transfer_id TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tsp_collab ON team_split_payouts(collaborator_user_id, status);

-- ---------------------------------------------------------------------------
-- 6. team_split_disputes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_split_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES team_split_deals(id) ON DELETE CASCADE,
  opened_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  dispute_type TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','under_review','resolved','rejected','escalated')),
  resolution TEXT,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tsdis_deal ON team_split_disputes(deal_id);
CREATE INDEX IF NOT EXISTS idx_tsdis_status ON team_split_disputes(status);

-- ---------------------------------------------------------------------------
-- 7. team_split_audit_events — append-only history for every deal action
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_split_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES team_split_deals(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tsae_deal ON team_split_audit_events(deal_id);

-- ============================================================================
-- RLS — SELECT-only for clients; ALL writes go through the service role.
-- Artist = owner via artist_profiles.user_id = auth.uid().
-- Collaborator = collaborator_user_id = auth.uid() (only sees their own deal).
-- ============================================================================
ALTER TABLE team_split_deals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_split_deal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_split_deliverables  ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_split_earnings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_split_payouts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_split_disputes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_split_audit_events  ENABLE ROW LEVEL SECURITY;

-- deals: either party can read
DROP POLICY IF EXISTS "TS deals readable by parties" ON team_split_deals;
CREATE POLICY "TS deals readable by parties" ON team_split_deals FOR SELECT
  USING (
    collaborator_user_id = auth.uid()
    OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- versions / deliverables / audit: either party of the parent deal can read
DROP POLICY IF EXISTS "TS versions readable by parties" ON team_split_deal_versions;
CREATE POLICY "TS versions readable by parties" ON team_split_deal_versions FOR SELECT
  USING (deal_id IN (
    SELECT id FROM team_split_deals
    WHERE collaborator_user_id = auth.uid()
       OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "TS deliverables readable by parties" ON team_split_deliverables;
CREATE POLICY "TS deliverables readable by parties" ON team_split_deliverables FOR SELECT
  USING (deal_id IN (
    SELECT id FROM team_split_deals
    WHERE collaborator_user_id = auth.uid()
       OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "TS audit readable by parties" ON team_split_audit_events;
CREATE POLICY "TS audit readable by parties" ON team_split_audit_events FOR SELECT
  USING (deal_id IN (
    SELECT id FROM team_split_deals
    WHERE collaborator_user_id = auth.uid()
       OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "TS disputes readable by parties" ON team_split_disputes;
CREATE POLICY "TS disputes readable by parties" ON team_split_disputes FOR SELECT
  USING (deal_id IN (
    SELECT id FROM team_split_deals
    WHERE collaborator_user_id = auth.uid()
       OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  ));

-- earnings: collaborator sees ONLY their own accruals (privacy, Pitfall 30);
-- artist sees accruals tied to their own artist profile.
DROP POLICY IF EXISTS "TS earnings readable by parties" ON team_split_earnings;
CREATE POLICY "TS earnings readable by parties" ON team_split_earnings FOR SELECT
  USING (
    collaborator_user_id = auth.uid()
    OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- payouts: collaborator reads their own cashouts
DROP POLICY IF EXISTS "TS payouts readable by owner" ON team_split_payouts;
CREATE POLICY "TS payouts readable by owner" ON team_split_payouts FOR SELECT
  USING (collaborator_user_id = auth.uid());

-- NOTE: deliberately NO INSERT/UPDATE/DELETE policies on ANY of these tables.
-- Authenticated clients can only SELECT; every write is performed by the
-- service-role client in the Team Splits API routes / crons after an explicit
-- ownership check (mirrors the money-ledger convention).

-- ============================================================================
-- Self-verify — fail LOUDLY on partial apply.
-- ============================================================================
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'team_split_deals','team_split_deal_versions','team_split_deliverables',
    'team_split_earnings','team_split_payouts','team_split_disputes',
    'team_split_audit_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'team-splits: table % is missing', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = t AND relrowsecurity) THEN
      RAISE EXCEPTION 'team-splits: RLS not enabled on %', t;
    END IF;
    -- every table must have at least one (SELECT) policy so it isn't a black hole
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t) THEN
      RAISE EXCEPTION 'team-splits: % has RLS on but NO policy (readers locked out)', t;
    END IF;
    -- and must NOT have any permissive client write policy (writes are service-role only)
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = t AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
    ) THEN
      RAISE EXCEPTION 'team-splits: % has a client write policy (must be service-role only)', t;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'uniq_tse_deal_earning'
  ) THEN
    RAISE EXCEPTION 'team-splits: idempotency index uniq_tse_deal_earning is missing';
  END IF;

  RAISE NOTICE 'team-splits: OK (7 tables, RLS on, SELECT-only client policies, idempotency index present)';
END $$;
