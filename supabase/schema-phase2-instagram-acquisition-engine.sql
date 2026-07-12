-- ============================================================================
-- CRWN Instagram → ManyChat → CRWN Acquisition Engine
-- ============================================================================
-- Apply MANUALLY in the Supabase SQL editor (not auto-run). Idempotent.
--
-- BEFORE YOU RUN THIS:
--   1. Pick a long random secret:  openssl rand -hex 32
--   2. In Vercel add  MANYCHAT_WEBHOOK_SECRET = <that secret>  and redeploy.
--   3. Also add ANTHROPIC_API_KEY. (Claude is OPTIONAL — the engine has a complete
--      deterministic fallback and runs fine without it. See docs/acquisition/.)
--   4. Then run this file.
--
-- The secret is NOT committed to git. It lives only in Vercel.
--
-- WHAT THIS ADDS
--   lead_identities             one persistent lead across many IG interactions + tools
--   lead_sessions               one conversation / campaign journey
--   lead_answers                append-only raw + normalized answers (corrections supersede)
--   lead_conversation_messages  minimal DM transcript (retention-bounded)
--   lead_profiles               the persistent normalized artist profile + per-field provenance
--   lead_score_history          explainable, versioned score components
--   acquisition_events          idempotency claim + outbox + analytics, in one table
--   acquisition_campaigns       per-campaign kill switch and attribution
--   ALTER lead_magnet_results   link results to identity/session; hashed tokens; claim tokens
--
-- WHAT THIS DOES NOT TOUCH
--   The five existing lead magnets, their formulas, their routes, or their result rows.
--   lead_magnet_results is EXTENDED with nullable columns only. Every existing row and
--   every existing query keeps working unchanged.
--
-- SECURITY MODEL (this is the important part)
--   - The ManyChat webhook is an UNAUTHENTICATED stranger holding a shared secret. It runs
--     with the service-role client, which bypasses RLS. So these tables get NO client write
--     policy at all. Writes happen only through server routes that authenticate themselves.
--   - An Instagram identity NEVER grants account access. Claiming a result requires a
--     verified Supabase session; the IG identity is evidence, not authorization.
--   - Authenticated users may read ONLY rows linked to their own auth.uid().
--   - Admins may read for support. Nobody but service-role may write.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Shared updated_at trigger (matches the existing repo pattern)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION acquisition_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 1. lead_identities — one row per human, across every Instagram touch + tool
-- ---------------------------------------------------------------------------
-- Merge rules are enforced in application code (identityResolution.ts), but the
-- UNIQUE constraints here are the backstop: two different people can never collide
-- on a provider id, and a NULL provider id never blocks a second row.
CREATE TABLE IF NOT EXISTS lead_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider identifiers. Unique WHERE NOT NULL so anonymous rows don't collide.
  manychat_contact_id text,
  instagram_user_id   text,
  instagram_username  text,          -- normalized lowercase, NOT a merge key (usernames are reassignable)

  -- Verified contact. email is only set once we have actually verified it.
  email               text,
  email_verified_at   timestamptz,
  phone               text,          -- E.164
  phone_verified_at   timestamptz,

  -- The link to a real CRWN account. Set ONLY by a verified claim.
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  artist_id           uuid REFERENCES artist_profiles(id) ON DELETE SET NULL,
  claimed_at          timestamptz,

  -- Consent + provenance
  consent_dm          boolean NOT NULL DEFAULT false,
  consent_email       boolean NOT NULL DEFAULT false,
  consent_sms         boolean NOT NULL DEFAULT false,
  consent_source      text,
  consent_text_version text,
  consented_at        timestamptz,

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','nurture','disqualified','claimed','opted_out','human_review')),

  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_identities_manychat
  ON lead_identities (manychat_contact_id) WHERE manychat_contact_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_identities_ig_user
  ON lead_identities (instagram_user_id) WHERE instagram_user_id IS NOT NULL;
-- NOTE: email is deliberately NOT unique. Two unclaimed leads may type the same email
-- before either is verified. Merging on an UNVERIFIED email is exactly the account-takeover
-- vector we must not build. Only a VERIFIED email participates in identity resolution.
CREATE INDEX IF NOT EXISTS idx_lead_identities_email ON lead_identities (lower(email))
  WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_identities_user ON lead_identities (user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_identities_status ON lead_identities (status, last_seen_at DESC);

DROP TRIGGER IF EXISTS trg_lead_identities_touch ON lead_identities;
CREATE TRIGGER trg_lead_identities_touch BEFORE UPDATE ON lead_identities
  FOR EACH ROW EXECUTE FUNCTION acquisition_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. acquisition_campaigns — per-campaign kill switch + attribution source
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acquisition_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,      -- e.g. 'ig-vault-reel-jan'
  name        text NOT NULL,
  platform    text NOT NULL DEFAULT 'instagram',
  creator_account text,                  -- the IG account that owns the post
  source_post_id  text,                  -- IG post / Reel id
  keyword         text,                  -- the comment trigger word
  lead_magnet_id  text,                  -- slug into the lead-magnet registry
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acq_campaigns_active ON acquisition_campaigns (is_active, key);

DROP TRIGGER IF EXISTS trg_acq_campaigns_touch ON acquisition_campaigns;
CREATE TRIGGER trg_acq_campaigns_touch BEFORE UPDATE ON acquisition_campaigns
  FOR EACH ROW EXECUTE FUNCTION acquisition_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. lead_sessions — one journey. The state machine's row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_identity_id uuid NOT NULL REFERENCES lead_identities(id) ON DELETE CASCADE,
  campaign_id      uuid REFERENCES acquisition_campaigns(id) ON DELETE SET NULL,

  -- What the lead is doing
  lead_magnet_id text,        -- slug; validated against the registry in app code
  calculator_id  text,

  -- Attribution (denormalized on purpose: campaigns can be edited/deleted, the
  -- session's attribution must stay immutably true to what actually happened)
  source_platform text NOT NULL DEFAULT 'instagram',
  creator_account text,
  source_post_id  text,
  keyword         text,
  conversation_id text,
  referring_url   text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text,

  -- State machine. The CHECK is the backstop; stateMachine.ts is the authority.
  state text NOT NULL DEFAULT 'initiated' CHECK (state IN (
    'initiated','awaiting_opt_in','collecting_identity','collecting_required_metrics',
    'collecting_goal','collecting_blocker','ready_for_result','result_generating',
    'result_generated','result_sent','result_viewed','account_claim_started',
    'account_claimed','onboarding_started','rise_mode_started','booked_call',
    'purchased','nurture','abandoned','failed','human_review'
  )),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','completed','abandoned','failed')),
  current_question_key text,

  -- Versioning, so a mid-flight orchestration change is auditable
  orchestration_version text NOT NULL DEFAULT '1.0.0',
  prompt_version        text,

  -- Concurrency guard. Bumped on every committed transition; a stale write loses.
  revision integer NOT NULL DEFAULT 0,

  started_at       timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  abandoned_at     timestamptz,
  failed_at        timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_sessions_identity ON lead_sessions (lead_identity_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_sessions_state    ON lead_sessions (state, last_activity_at DESC);
-- Powers abandoned-session detection in the daily dispatcher.
CREATE INDEX IF NOT EXISTS idx_lead_sessions_open     ON lead_sessions (last_activity_at)
  WHERE status = 'open';
-- One OPEN session per identity per lead magnet. A second `start` event for the same
-- tool resumes rather than forking. Partial index so closed sessions don't block a retry.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_sessions_open_per_tool
  ON lead_sessions (lead_identity_id, lead_magnet_id)
  WHERE status = 'open' AND lead_magnet_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_lead_sessions_touch ON lead_sessions;
CREATE TRIGGER trg_lead_sessions_touch BEFORE UPDATE ON lead_sessions
  FOR EACH ROW EXECUTE FUNCTION acquisition_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. lead_answers — APPEND ONLY. A correction supersedes; it never overwrites.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES lead_sessions(id) ON DELETE CASCADE,
  lead_identity_id uuid NOT NULL REFERENCES lead_identities(id) ON DELETE CASCADE,

  field_key   text NOT NULL,        -- canonical key from fieldRegistry.ts
  raw_value   text,                 -- EXACTLY what the artist typed, stored BEFORE any AI runs
  normalized_value jsonb,           -- typed value after deterministic normalization / extraction

  source text NOT NULL DEFAULT 'instagram_dm'
    CHECK (source IN ('instagram_dm','result_page','setup_wizard','crwn_profile','admin','import')),
  extraction_method text NOT NULL DEFAULT 'deterministic'
    CHECK (extraction_method IN ('deterministic','claude','direct','provider_metadata')),
  confidence numeric(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),

  question_version text,
  external_event_id text,           -- the ManyChat event that produced it

  -- Correction chain. superseded_by points at the newer answer for the same field.
  superseded_by uuid REFERENCES lead_answers(id) ON DELETE SET NULL,

  asked_at    timestamptz,
  answered_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_answers_session ON lead_answers (session_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_answers_identity_field ON lead_answers (lead_identity_id, field_key);
-- The "current" answer for a field = the one nobody has superseded.
CREATE INDEX IF NOT EXISTS idx_lead_answers_current ON lead_answers (session_id, field_key)
  WHERE superseded_by IS NULL;

-- ---------------------------------------------------------------------------
-- 5. lead_conversation_messages — minimal transcript
-- ---------------------------------------------------------------------------
-- Retention-bounded on purpose: we keep only what is needed to resume a conversation
-- and to audit a Claude decision. redacted_at lets the cleanup job blank content while
-- preserving the event skeleton for analytics.
CREATE TABLE IF NOT EXISTS lead_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES lead_sessions(id) ON DELETE CASCADE,
  direction  text NOT NULL CHECK (direction IN ('inbound','outbound')),
  role       text NOT NULL CHECK (role IN ('lead','crwn','system')),
  content    text,
  message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text','question','result_link','system_note')),
  external_message_id text,
  provider   text NOT NULL DEFAULT 'manychat',
  redacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_msgs_session ON lead_conversation_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_msgs_retention ON lead_conversation_messages (created_at)
  WHERE redacted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 6. lead_profiles — the persistent artist profile
-- ---------------------------------------------------------------------------
-- Typed columns for everything scoring / admin / calculators actually FILTER on.
-- jsonb only for provenance and forward-compat extras. (Brief §5: "Prefer normalized
-- typed columns for fields heavily queried by scoring, admin, or calculators.")
CREATE TABLE IF NOT EXISTS lead_profiles (
  lead_identity_id uuid PRIMARY KEY REFERENCES lead_identities(id) ON DELETE CASCADE,

  artist_name        text,
  monthly_listeners  integer CHECK (monthly_listeners IS NULL OR monthly_listeners >= 0),
  social_followers   integer CHECK (social_followers  IS NULL OR social_followers  >= 0),
  email_list_size    integer CHECK (email_list_size   IS NULL OR email_list_size   >= 0),
  phone_list_size    integer CHECK (phone_list_size   IS NULL OR phone_list_size   >= 0),
  catalog_size       integer CHECK (catalog_size      IS NULL OR catalog_size      >= 0),
  album_count        integer CHECK (album_count       IS NULL OR album_count       >= 0),
  song_count         integer CHECK (song_count        IS NULL OR song_count        >= 0),

  -- MONEY IS INTEGER CENTS (CLAUDE.md). Never store dollars here.
  direct_fan_revenue_cents      integer CHECK (direct_fan_revenue_cents      IS NULL OR direct_fan_revenue_cents      >= 0),
  -- Only set when USER-PROVIDED or derived by an existing deterministic calculator.
  -- Claude may never populate this. Enforced in app code (fieldRegistry: aiExtractable=false).
  streaming_revenue_cents       integer CHECK (streaming_revenue_cents       IS NULL OR streaming_revenue_cents       >= 0),

  release_frequency  text,
  genre              text,
  team_status        text,
  monetization_status text,

  primary_goal    text,
  primary_blocker text,
  career_stage    text,
  artist_segment  text,

  -- Scoring. The deterministic score is authoritative; the Claude signal is bounded and advisory.
  lead_score          integer NOT NULL DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  lead_score_version  text    NOT NULL DEFAULT '1.0.0',
  claude_score_signal integer CHECK (claude_score_signal IS NULL OR (claude_score_signal >= 0 AND claude_score_signal <= 20)),
  score_band text NOT NULL DEFAULT 'unqualified'
    CHECK (score_band IN ('unqualified','nurture','self_serve','sales_priority','human_review')),

  purchase_intent        text,
  fan_ownership_maturity text,

  -- Per-field provenance: { field_key: { source, confidence, verified_at, trust } }
  -- This is what stops a Claude guess from overwriting a verified CRWN value.
  field_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  extra            jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_score ON lead_profiles (score_band, lead_score DESC);

DROP TRIGGER IF EXISTS trg_lead_profiles_touch ON lead_profiles;
CREATE TRIGGER trg_lead_profiles_touch BEFORE UPDATE ON lead_profiles
  FOR EACH ROW EXECUTE FUNCTION acquisition_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. lead_score_history — a score must be explainable from stored components
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_identity_id uuid NOT NULL REFERENCES lead_identities(id) ON DELETE CASCADE,
  session_id uuid REFERENCES lead_sessions(id) ON DELETE SET NULL,
  total_score   integer NOT NULL,
  score_version text NOT NULL,
  components    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { audience: 12, catalog: 8, ... }
  reason_codes  text[] NOT NULL DEFAULT '{}',
  band          text NOT NULL,
  source_event  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_score_hist ON lead_score_history (lead_identity_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8. acquisition_events — idempotency claim + outbox + analytics, one table
-- ---------------------------------------------------------------------------
-- Three jobs, one table, on purpose:
--   (a) IDEMPOTENCY: UNIQUE(idempotency_key) is claimed by INSERT (never check-then-insert),
--       exactly like processed_webhook_events in the Stripe webhook. 23505 = replay.
--   (b) OUTBOX: rows with status='pending' and a due next_attempt_at are drained by the
--       daily dispatcher (piggybacked on /api/cron/platform-crm — no new Vercel cron).
--   (c) ANALYTICS: every meaningful transition lands here with attribution.
-- A replayed webhook stores its original response so the retry returns the SAME answer.
CREATE TABLE IF NOT EXISTS acquisition_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,

  lead_identity_id uuid REFERENCES lead_identities(id) ON DELETE CASCADE,
  session_id       uuid REFERENCES lead_sessions(id)   ON DELETE CASCADE,
  result_id        uuid REFERENCES lead_magnet_results(id) ON DELETE SET NULL,

  -- The claim. NULL for pure analytics rows that need no dedupe.
  idempotency_key text,
  -- Cached response for a replayed inbound webhook, so a retry is byte-identical.
  response_snapshot jsonb,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Outbox processing
  status text NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('recorded','pending','processing','processed','failed','dead_letter','skipped')),
  attempt_count   integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz,
  processed_at    timestamptz,
  last_error_code text,
  last_error_at   timestamptz,

  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_acq_events_idem
  ON acquisition_events (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acq_events_name ON acquisition_events (event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_acq_events_session ON acquisition_events (session_id, occurred_at DESC);
-- The outbox drain query.
CREATE INDEX IF NOT EXISTS idx_acq_events_due ON acquisition_events (next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_acq_events_dead ON acquisition_events (created_at DESC)
  WHERE status = 'dead_letter';

-- ---------------------------------------------------------------------------
-- 9. EXTEND lead_magnet_results (nullable adds only — existing rows/queries unaffected)
-- ---------------------------------------------------------------------------
ALTER TABLE lead_magnet_results
  ADD COLUMN IF NOT EXISTS lead_identity_id uuid REFERENCES lead_identities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_session_id  uuid REFERENCES lead_sessions(id)   ON DELETE SET NULL,
  -- Hashed tokens. The existing plaintext public_token stays for the 4 existing tools;
  -- acquisition rows populate the HASH and never store the raw token.
  ADD COLUMN IF NOT EXISTS public_token_hash text,
  ADD COLUMN IF NOT EXISTS claim_token_hash  text,
  ADD COLUMN IF NOT EXISTS claim_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_token_used_at    timestamptz,
  -- The immutable first snapshot. When an artist corrects an input and recalculates,
  -- input_data moves but original_input_data never does.
  ADD COLUMN IF NOT EXISTS original_input_data jsonb,
  ADD COLUMN IF NOT EXISTS calculator_id   text,
  ADD COLUMN IF NOT EXISTS formula_version text,
  ADD COLUMN IF NOT EXISTS disclaimer_version text,
  ADD COLUMN IF NOT EXISTS sent_at         timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS view_count      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recalculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at      timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lm_results_public_hash
  ON lead_magnet_results (public_token_hash) WHERE public_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lm_results_claim_hash
  ON lead_magnet_results (claim_token_hash) WHERE claim_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lm_results_identity ON lead_magnet_results (lead_identity_id)
  WHERE lead_identity_id IS NOT NULL;
-- One result per (session, tool). Stops a duplicate webhook from minting two results.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lm_results_session_tool
  ON lead_magnet_results (lead_session_id, tool_slug) WHERE lead_session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 10. RLS — enable on EVERY new table, no client writes anywhere
-- ---------------------------------------------------------------------------
-- Reminder (schema-phase2-money-ledger-rls.sql learned this the hard way): RLS with
-- NO permissive policy = deny all. Policies below are read-only and narrowly scoped.
ALTER TABLE lead_identities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_answers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_score_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE acquisition_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE acquisition_campaigns      ENABLE ROW LEVEL SECURITY;

-- Identity: you may read your OWN linked identity. Nothing else. No client writes.
DROP POLICY IF EXISTS "self_read_lead_identity" ON lead_identities;
CREATE POLICY "self_read_lead_identity" ON lead_identities
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admin_read_lead_identities" ON lead_identities;
CREATE POLICY "admin_read_lead_identities" ON lead_identities
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Sessions / answers / messages / profile / score: readable only through YOUR identity.
DROP POLICY IF EXISTS "self_read_lead_sessions" ON lead_sessions;
CREATE POLICY "self_read_lead_sessions" ON lead_sessions
  FOR SELECT USING (
    lead_identity_id IN (SELECT id FROM lead_identities WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "admin_read_lead_sessions" ON lead_sessions;
CREATE POLICY "admin_read_lead_sessions" ON lead_sessions
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

DROP POLICY IF EXISTS "self_read_lead_answers" ON lead_answers;
CREATE POLICY "self_read_lead_answers" ON lead_answers
  FOR SELECT USING (
    lead_identity_id IN (SELECT id FROM lead_identities WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "admin_read_lead_answers" ON lead_answers;
CREATE POLICY "admin_read_lead_answers" ON lead_answers
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Conversation content is the most sensitive thing here. ADMIN ONLY.
-- A claimed user does not get an API to re-read their own Instagram DMs from CRWN;
-- there is no product reason for it, and it would be a fresh PII egress path.
DROP POLICY IF EXISTS "admin_read_lead_messages" ON lead_conversation_messages;
CREATE POLICY "admin_read_lead_messages" ON lead_conversation_messages
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

DROP POLICY IF EXISTS "self_read_lead_profile" ON lead_profiles;
CREATE POLICY "self_read_lead_profile" ON lead_profiles
  FOR SELECT USING (
    lead_identity_id IN (SELECT id FROM lead_identities WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "admin_read_lead_profiles" ON lead_profiles;
CREATE POLICY "admin_read_lead_profiles" ON lead_profiles
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Score history and the event log are internal. Admin only.
DROP POLICY IF EXISTS "admin_read_lead_scores" ON lead_score_history;
CREATE POLICY "admin_read_lead_scores" ON lead_score_history
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

DROP POLICY IF EXISTS "admin_read_acq_events" ON acquisition_events;
CREATE POLICY "admin_read_acq_events" ON acquisition_events
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

DROP POLICY IF EXISTS "admin_read_acq_campaigns" ON acquisition_campaigns;
CREATE POLICY "admin_read_acq_campaigns" ON acquisition_campaigns
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- ---------------------------------------------------------------------------
-- 11. Column-level freeze on the linkage columns
-- ---------------------------------------------------------------------------
-- Nobody has an UPDATE policy on these tables, so a client cannot write them at all.
-- This REVOKE is belt-and-braces: if a future migration adds a permissive UPDATE policy
-- by accident, the grant is still missing and the linkage columns stay unwritable.
-- (Learned from column-privileges-not-rls: the table grant must go first or the column
-- revoke is a no-op.)
REVOKE UPDATE ON lead_identities FROM anon, authenticated;
REVOKE UPDATE ON lead_sessions   FROM anon, authenticated;
REVOKE UPDATE ON lead_profiles   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON lead_answers               FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON lead_conversation_messages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON lead_score_history         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON acquisition_events         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON acquisition_campaigns      FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Feature flag — DARK by default. The engine ships OFF.
-- ---------------------------------------------------------------------------
-- Flip to true in admin_settings when ManyChat is configured and you have tested it.
-- The webhook returns 503 retry-later while this is false, so a misconfigured ManyChat
-- flow cannot write junk rows before you are ready.
INSERT INTO admin_settings (key, value)
VALUES ('acquisition_engine', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- Self-verify (fails LOUDLY on partial apply)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  required_tables text[] := ARRAY[
    'lead_identities','lead_sessions','lead_answers','lead_conversation_messages',
    'lead_profiles','lead_score_history','acquisition_events','acquisition_campaigns'
  ];
BEGIN
  FOREACH t IN ARRAY required_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'MIGRATION INCOMPLETE: table % missing', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'MIGRATION INCOMPLETE: RLS not enabled on %', t;
    END IF;
  END LOOP;

  -- The idempotency claim is the whole replay defense. If this index is missing,
  -- duplicate ManyChat deliveries double-process. Fail hard.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_acq_events_idem') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: uq_acq_events_idem missing (replay protection would be OFF)';
  END IF;

  -- One open session per tool; one result per session+tool. Both stop duplicate work.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_lead_sessions_open_per_tool') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: uq_lead_sessions_open_per_tool missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_lm_results_session_tool') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: uq_lm_results_session_tool missing';
  END IF;

  -- The extension of the EXISTING results table.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_magnet_results' AND column_name = 'public_token_hash'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: lead_magnet_results.public_token_hash missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_magnet_results' AND column_name = 'original_input_data'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: lead_magnet_results.original_input_data missing';
  END IF;

  -- Provenance is what stops a Claude guess overwriting verified data. Non-negotiable.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_profiles' AND column_name = 'field_provenance'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: lead_profiles.field_provenance missing';
  END IF;

  -- The kill switch must exist and must be OFF.
  IF NOT EXISTS (SELECT 1 FROM admin_settings WHERE key = 'acquisition_engine') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: acquisition_engine flag row missing';
  END IF;

  RAISE NOTICE 'OK: acquisition engine tables + RLS + indexes created. Flag is OFF (dark).';
  RAISE NOTICE 'NEXT: set MANYCHAT_WEBHOOK_SECRET (and optionally ANTHROPIC_API_KEY) in Vercel, then flip admin_settings.acquisition_engine.enabled = true.';
END $$;
