-- schema-phase2-fan-testimonials.sql
--
-- Automated Fan Testimonials V1.
-- Canonical architecture: docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md
--
-- CRWN automatically asks a fan who has EXPERIENCED value (a promise delivered to them, or thirty
-- days paid and still active) one contextual question, stores their exact words with an explicit
-- permission scope, and puts it in the artist's PRIVATE library. Nothing is published until the
-- artist explicitly features it. Automatic collection is never automatic publication.
--
-- SHAPE OF THE SECURITY MODEL, and why it looks unusual:
--   Both base tables are CLOSED to anon and authenticated (RLS on, grants revoked, no client
--   policies), exactly like the money/CRM tables in schema-phase2-sec-012. Every read and write
--   goes through a server route that establishes its own authority, because middleware excludes
--   /api/ and the service role bypasses RLS. The ONE public surface is the view at the bottom,
--   which enumerates a safe column list and applies the publication predicate itself.
--
-- SAFE BEFORE THIS RUNS: every code path probes for these relations and degrades to "no
-- testimonials" (42P01 / undefined table). The cron returns skipped, the fan card renders nothing,
-- the artist library shows an empty state, and the public section is absent.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run. Self-verifies at the end.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) The ASK. Server-generated only; a client may never create one.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fan_testimonial_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id     uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  -- D3: a real fan account hard-delete removes the ask and the statement with it. CRWN has no
  -- hard-delete surface today; this is the relation that makes the ratified rule true when it does.
  fan_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trigger_kind  text NOT NULL CHECK (trigger_kind IN ('promise_fulfilled', 'member_30d')),
  -- POINTER to the canonical evidence, never a snapshot of it. Re-read at render so a refund or a
  -- cancellation degrades the claim instead of leaving a stale one in public.
  evidence_kind text NOT NULL CHECK (evidence_kind IN ('fulfillment_event', 'subscription')),
  evidence_id   uuid NOT NULL,
  prompt_key    text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'submitted', 'declined', 'expired')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  delivered_at  timestamptz,
  responded_at  timestamptz,
  expires_at    timestamptz NOT NULL
);

-- Dedupe lives in the DATABASE, not in the cron, because a rule enforced only in application code
-- is a rule two concurrent runs can break.
--   (a) at most ONE outstanding ask per (fan, artist)
CREATE UNIQUE INDEX IF NOT EXISTS idx_testimonial_req_one_pending
  ON fan_testimonial_requests (artist_id, fan_id)
  WHERE status = 'pending';
--   (b) a given trigger fires at most ONCE per (fan, artist), ever
CREATE UNIQUE INDEX IF NOT EXISTS idx_testimonial_req_once_per_trigger
  ON fan_testimonial_requests (artist_id, fan_id, trigger_kind);

CREATE INDEX IF NOT EXISTS idx_testimonial_req_fan ON fan_testimonial_requests (fan_id, status);
CREATE INDEX IF NOT EXISTS idx_testimonial_req_artist ON fan_testimonial_requests (artist_id);

-- ---------------------------------------------------------------------------
-- 2) The STATEMENT. The body is the fan's, permanently.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fan_testimonials (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable so a future unsolicited path needs no migration. V1 always sets it.
  request_id   uuid REFERENCES fan_testimonial_requests(id) ON DELETE SET NULL,
  artist_id    uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  fan_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  context_kind text CHECK (context_kind IS NULL OR context_kind IN ('promise', 'membership')),
  context_id   uuid,
  -- WHICH QUESTION was asked, not the rendered sentence. Rewording later cannot orphan a row.
  prompt_key   text NOT NULL,

  -- The fan's exact words. Frozen by trg_freeze_testimonial_body below.
  body         text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 600),

  display_identity text NOT NULL DEFAULT 'anonymous'
                     CHECK (display_identity IN ('display_name', 'anonymous')),
  -- 'external' (press kits, socials, paid media) is deliberately not a V1 value: it is a
  -- materially different right. Adding it later is a CHECK change plus asking the fan again.
  consent_scope    text NOT NULL DEFAULT 'private_to_artist'
                     CHECK (consent_scope IN ('private_to_artist', 'crwn_only')),
  -- Consent proof: which fan approved which words for what usage, and when.
  consent_version  text NOT NULL DEFAULT 'testimonial-consent@1',
  consent_at       timestamptz,

  verification_evidence_kind text CHECK (
    verification_evidence_kind IS NULL OR verification_evidence_kind IN ('subscription')
  ),
  verification_evidence_id   uuid,

  moderation_status text NOT NULL DEFAULT 'auto_ok'
                      CHECK (moderation_status IN ('auto_ok', 'flagged', 'blocked')),

  submitted_at timestamptz NOT NULL DEFAULT now(),
  featured_at  timestamptz,
  hidden_at    timestamptz,
  withdrawn_at timestamptz,

  -- One statement per fan per context. A second ask about the same thing cannot duplicate a row.
  CONSTRAINT fan_testimonials_unique_context UNIQUE (artist_id, fan_id, context_kind, context_id)
);

CREATE INDEX IF NOT EXISTS idx_testimonials_artist ON fan_testimonials (artist_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_testimonials_fan ON fan_testimonials (fan_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_featured
  ON fan_testimonials (artist_id, featured_at DESC)
  WHERE consent_scope = 'crwn_only' AND featured_at IS NOT NULL
    AND hidden_at IS NULL AND withdrawn_at IS NULL AND moderation_status = 'auto_ok';

-- ---------------------------------------------------------------------------
-- 3) TESTIMONIAL-001. The artist manages VISIBILITY. The fan owns AUTHORSHIP.
-- ---------------------------------------------------------------------------
-- Reverts frozen columns instead of raising, matching schema-phase2-sec-003-profiles-identity-freeze:
-- a raise would let a caller distinguish "blocked" from "no such row", and a revert can never break
-- a legitimate update that only touches featured_at / hidden_at / withdrawn_at.
--
-- The READ-BACK is therefore the evidence that this works, never the status code.
--
-- consent_scope is frozen in ONE direction: a fan may narrow crwn_only -> private_to_artist
-- (that is what withdrawal of publication permission means). Widening back to crwn_only requires
-- asking the fan again, so it is reverted here.
CREATE OR REPLACE FUNCTION freeze_testimonial_authorship()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.id                         := OLD.id;
  NEW.body                       := OLD.body;
  NEW.fan_id                     := OLD.fan_id;
  NEW.artist_id                  := OLD.artist_id;
  NEW.prompt_key                 := OLD.prompt_key;
  NEW.display_identity           := OLD.display_identity;
  NEW.context_kind               := OLD.context_kind;
  NEW.context_id                 := OLD.context_id;
  NEW.submitted_at               := OLD.submitted_at;
  NEW.consent_version            := OLD.consent_version;
  NEW.verification_evidence_kind := OLD.verification_evidence_kind;
  NEW.verification_evidence_id   := OLD.verification_evidence_id;

  IF NEW.consent_scope IS DISTINCT FROM OLD.consent_scope
     AND NOT (OLD.consent_scope = 'crwn_only' AND NEW.consent_scope = 'private_to_artist') THEN
    NEW.consent_scope := OLD.consent_scope;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_testimonial_body ON fan_testimonials;
CREATE TRIGGER trg_freeze_testimonial_body
  BEFORE UPDATE ON fan_testimonials
  FOR EACH ROW EXECUTE FUNCTION freeze_testimonial_authorship();

-- ---------------------------------------------------------------------------
-- 4) Closed to every client role. Server routes establish their own authority.
-- ---------------------------------------------------------------------------
ALTER TABLE fan_testimonial_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE fan_testimonials         ENABLE ROW LEVEL SECURITY;

-- Postgres checks TABLE PRIVILEGES before RLS, so the REVOKE is the real control and the RLS
-- enable is the belt to its braces. Both, deliberately: a later migration that grants a role by
-- accident still finds no permissive policy waiting for it.
REVOKE ALL ON public.fan_testimonial_requests FROM anon, authenticated;
REVOKE ALL ON public.fan_testimonials         FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) The ONE public surface.
-- ---------------------------------------------------------------------------
-- A plain (non security_invoker) view runs as its OWNER, which is how artist_profiles_public
-- already serves the public artist page from a base table anon cannot read. The predicate and the
-- column list are the privacy boundary, so both live here rather than in a caller.
--
-- WHAT IS ABSENT AND MUST STAY ABSENT: fan_id, email, tier id, tier NAME, tier price, any amount,
-- subscription id, the evidence pointer, consent internals, moderation state, exact join date.
--
-- THE PAIR RULE (TESTIMONIAL-006). Tier and tenure are each safe alone and are a spend disclosure
-- together: "Gold member for 8 months" beside a public $25/month price is roughly $200 of lifetime
-- spend. That is the invertibility defect src/lib/leaderboardPrivacy.ts exists to prevent. This
-- view emits BUCKETED tenure and NEVER a tier, so the pair cannot be assembled from it.
DROP VIEW IF EXISTS fan_testimonials_public;
CREATE VIEW fan_testimonials_public AS
SELECT
  t.id,
  t.artist_id,
  t.body,
  t.context_kind,
  t.submitted_at,
  -- Display identity. profiles.display_name is public and historically defaulted to the signup
  -- EMAIL, so an email-like name is forced anonymous here as well as in src/lib/publicName.ts.
  -- A fan who hides their name is still a verified human, which the app renders as the anonymous
  -- label; NULL here means exactly that, not a missing value.
  CASE
    WHEN t.display_identity = 'display_name'
     AND p.display_name IS NOT NULL
     AND btrim(p.display_name) <> ''
     AND position('@' in p.display_name) = 0
      THEN btrim(p.display_name)
    ELSE NULL
  END AS display_name,
  -- Verification, DERIVED from the live relationship on every read (TESTIMONIAL-005). No stored
  -- label, nothing the artist or the client can assert. A cancelled or refunded relationship
  -- yields NULL here and the badge simply disappears; the fan's words are untouched.
  CASE
    WHEN s.id IS NULL OR s.status <> 'active' THEN NULL
    WHEN s.is_founder THEN 'Founding supporter'
    WHEN s.is_paid_tier THEN 'Verified supporter'
    ELSE 'Member'
  END AS verification_label,
  -- Coarse buckets only. Under three months says nothing useful and narrows a join date.
  CASE
    WHEN s.id IS NULL OR s.status <> 'active' OR s.started_at IS NULL THEN NULL
    WHEN now() - s.started_at >= interval '365 days' THEN 'Supporter for over a year'
    WHEN now() - s.started_at >= interval '180 days' THEN 'Supporter for 6+ months'
    WHEN now() - s.started_at >= interval  '90 days' THEN 'Supporter for 3+ months'
    ELSE NULL
  END AS tenure_label
FROM fan_testimonials t
JOIN profiles p ON p.id = t.fan_id
-- The price is COLLAPSED TO A BOOLEAN in here and never reaches the projection above. That mirrors
-- verificationEvidenceFor() in src/lib/testimonials/server.ts, where the same collapse happens
-- before anything escapes the function: if a price cannot enter the SELECT list, no combination of
-- emitted columns can reconstruct spend. Structure, not vigilance.
LEFT JOIN LATERAL (
  SELECT
    sub.id,
    sub.status,
    sub.is_founder,
    sub.started_at,
    COALESCE(st.price, 0) > 0 AS is_paid_tier
  FROM subscriptions sub
  LEFT JOIN subscription_tiers st ON st.id = sub.tier_id
  WHERE sub.fan_id = t.fan_id AND sub.artist_id = t.artist_id
  LIMIT 1
) s ON true
-- The publication predicate. Consent is load-bearing: an artist featuring a response the fan
-- marked private must never publish it.
WHERE t.consent_scope = 'crwn_only'
  AND t.featured_at IS NOT NULL
  AND t.hidden_at IS NULL
  AND t.withdrawn_at IS NULL
  AND t.moderation_status = 'auto_ok';

GRANT SELECT ON public.fan_testimonials_public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) D4. The artist's one control. ON by default.
-- ---------------------------------------------------------------------------
-- OFF stops FUTURE automated asks. It never deletes a testimonial, never unfeatures one, and never
-- touches fan access, subscriptions, payments or any other communication.
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS testimonial_requests_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN artist_profiles.testimonial_requests_enabled IS
  'D4: automatically ask fans for testimonials. ON by default. OFF suppresses future automated requests only.';

-- No GRANT and no artist_profiles_public rebuild, on purpose: this is a private operating setting
-- read server-side by the cron and by the artist''s own settings route. The public page has no
-- business knowing whether an artist asks for testimonials.

-- ---------------------------------------------------------------------------
-- Self-verify. Assert the PROPERTIES, not merely that objects exist.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rel_count int;
  v_grants    int;
  v_cols      text;
BEGIN
  IF to_regclass('public.fan_testimonial_requests') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fan_testimonial_requests missing';
  END IF;
  IF to_regclass('public.fan_testimonials') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fan_testimonials missing';
  END IF;
  IF to_regclass('public.fan_testimonials_public') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fan_testimonials_public view missing';
  END IF;

  -- RLS is actually ENABLED on both base tables (a policy on a table without RLS is decorative).
  SELECT count(*) INTO v_rel_count
    FROM pg_class
   WHERE relname IN ('fan_testimonial_requests', 'fan_testimonials')
     AND relnamespace = 'public'::regnamespace
     AND relrowsecurity;
  IF v_rel_count <> 2 THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: RLS not enabled on both testimonial tables (got %)', v_rel_count;
  END IF;

  -- The base tables are CLOSED to client roles. This is the property that makes the view the only
  -- public surface; asserting the view exists would certify nothing on its own.
  SELECT count(*) INTO v_grants
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('fan_testimonial_requests', 'fan_testimonials')
     AND grantee IN ('anon', 'authenticated');
  IF v_grants <> 0 THEN
    RAISE EXCEPTION 'SECURITY: % client grant(s) remain on the testimonial base tables', v_grants;
  END IF;

  -- The public view is readable, or the artist page silently shows nothing forever.
  SELECT count(*) INTO v_grants
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name = 'fan_testimonials_public'
     AND grantee IN ('anon', 'authenticated')
     AND privilege_type = 'SELECT';
  IF v_grants < 2 THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fan_testimonials_public is not SELECTable by anon + authenticated';
  END IF;

  -- TESTIMONIAL-006: the forbidden columns are not in the public view, by construction.
  SELECT string_agg(column_name, ',') INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'fan_testimonials_public';
  IF v_cols ~ '(^|,)(fan_id|tier_id|price|amount|email|consent_scope|moderation_status|verification_evidence_id)(,|$)' THEN
    RAISE EXCEPTION 'SECURITY: public testimonial view exposes a forbidden column. Columns: %', v_cols;
  END IF;

  -- TESTIMONIAL-001: the authorship freeze is actually attached.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_freeze_testimonial_body'
       AND tgrelid = 'public.fan_testimonials'::regclass
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: authorship freeze trigger missing on fan_testimonials';
  END IF;

  -- Dedupe is enforced by the database, not by the cron.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_testimonial_req_one_pending') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: one-pending-request index missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_testimonial_req_once_per_trigger') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: once-per-trigger index missing';
  END IF;

  -- D4 toggle.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'artist_profiles'
       AND column_name = 'testimonial_requests_enabled'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: artist_profiles.testimonial_requests_enabled missing';
  END IF;

  RAISE NOTICE 'OK: fan testimonials V1 (2 tables closed to clients, 1 public view, authorship freeze, dedupe indexes, artist toggle)';
END $$;

COMMIT;
