-- Fan Automations: artist-facing comment-to-DM funnels (founder decision 2026-08-29).
--
-- WHAT THIS IS
-- Four tables behind the artist-facing "Fan Automations" feature: an artist connects their own
-- Instagram professional account or Facebook Page, CRWN listens for comments through a verified
-- Meta webhook, sends the one permitted private reply carrying a link to the artist's drop page,
-- captures an email there, admits the fan to the artist's free tier through the ONE canonical
-- writer (joinFreeTier), and offers the artist's Gold-equivalent tier with a Silver-equivalent
-- downsell through the ONE canonical Stripe checkout. This is entirely separate from CRWN's own
-- founder-facing ManyChat acquisition engine (H-07), which shares no table, route, keyword or
-- identifier with any of this.
--
-- A RATIFIED DEVIATION, STATED PLAINLY: artist_social_connections stores third-party access
-- tokens in a database row. The house rule ("a token lives in the server environment, never a
-- row") cannot hold for multi-tenant OAuth: every artist has their own token and the environment
-- belongs to the platform, not to a tenant. The compensating controls are all three of:
--   1. The table is CLOSED: RLS on, ZERO policies, ALL revoked from anon and authenticated by
--      name. The only read path is the service role.
--   2. The token column stores CIPHERTEXT, encrypted app-side with AES-256-GCM under
--      SOCIAL_TOKEN_ENC_KEY (a server env secret). A leaked row without the env key is noise.
--   3. One reader module: src/lib/fanAutomations/connections.ts. Nothing else may select this
--      table, the same single-reader rule as src/lib/stripe/connectAccount.ts.
--
-- IDEMPOTENCY IS THE PROPERTY THAT MATTERS MOST ON THE WEBHOOK SIDE. Meta redelivers webhooks
-- for up to 36 hours, and Meta permits exactly ONE private reply per comment, ever. The
-- UNIQUE(provider, comment_id) index on social_webhook_receipts is both the dedupe claim
-- (insert-as-claim, 23505 = already handled, same shape as processed_webhook_events) and the
-- enforcement of that one-reply policy.
--
-- NO MONEY COLUMN EXISTS IN ANY OF THESE TABLES AND NONE MAY BE ADDED. Conversions are DERIVED
-- by joining subscriptions on fan_user_id + tier + time window (the Fan Drives rule: the
-- automation is a dimension, never a source of truth about who paid what).

-- ── 1. Artist social connections ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.artist_social_connections (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id            uuid NOT NULL REFERENCES public.artist_profiles(id) ON DELETE CASCADE,

  provider             text NOT NULL CHECK (provider IN ('instagram', 'facebook')),
  -- The provider-owned id (IG professional account id / Facebook Page id). This, never a
  -- caller-supplied artist id, is how a webhook event is resolved to an artist.
  provider_account_id  text NOT NULL,
  provider_username    text,

  -- AES-256-GCM ciphertext (format v1.<iv>.<tag>.<ct>, base64url). NEVER plaintext, NEVER
  -- readable by a client role, NEVER returned to a browser, decrypted only inside
  -- src/lib/fanAutomations/connections.ts.
  access_token_enc     text NOT NULL,
  -- Instagram long-lived tokens expire after 60 days and are refreshed by the daily cron;
  -- long-lived Facebook Page tokens carry no expiry and leave this NULL.
  token_expires_at     timestamptz,
  token_refreshed_at   timestamptz,

  -- 'candidate' exists only for the Facebook multi-Page picker: the callback stores each of the
  -- user's Pages as a candidate and the artist activates exactly one. Candidates are never
  -- resolved by the webhook and never refreshed.
  status               text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('candidate', 'active', 'disconnected', 'expired', 'revoked')),
  webhook_subscribed   boolean NOT NULL DEFAULT false,

  connected_at         timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- A social account belongs to at most ONE artist at a time, or a webhook comment could fan out
-- to two artists' automations and DM the fan twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_conn_one_owner_per_account
  ON public.artist_social_connections (provider, provider_account_id)
  WHERE status = 'active';

-- One active connection per provider per artist (V1).
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_conn_one_active_per_artist
  ON public.artist_social_connections (artist_id, provider)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_social_conn_artist
  ON public.artist_social_connections (artist_id);

ALTER TABLE public.artist_social_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.artist_social_connections FROM anon, authenticated;

-- ── 2. Fan automations ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fan_automations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id             uuid NOT NULL REFERENCES public.artist_profiles(id) ON DELETE CASCADE,
  connection_id         uuid REFERENCES public.artist_social_connections(id) ON DELETE SET NULL,
  provider              text NOT NULL CHECK (provider IN ('instagram', 'facebook')),

  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'active', 'paused', 'archived')),

  -- The unguessable key in the DM link and the /drop/<token> page URL. Random base64url,
  -- minted server-side at create. It is a POINTER to this row, never authority over anything.
  public_token          text NOT NULL UNIQUE,

  -- Trigger. Provider media ids ([] = any post) and lowercase keywords ([] = any comment).
  trigger_media_ids     jsonb NOT NULL DEFAULT '[]',
  trigger_keywords      jsonb NOT NULL DEFAULT '[]',

  -- What the fan sees. The public reply lands under their comment; the DM is the ONE private
  -- reply Meta permits, and CRWN appends the drop link to it at send time.
  public_reply          text NOT NULL DEFAULT 'Check your DMs 👑',
  dm_message            text NOT NULL DEFAULT '',

  -- The lead magnet. 'upload' = a file in R2 delivered by short-lived signed URL after email
  -- capture (never a public URL); 'track' = an existing FREE track on the artist's page.
  magnet_kind           text CHECK (magnet_kind IN ('upload', 'track')),
  magnet_title          text NOT NULL DEFAULT '',
  magnet_description    text NOT NULL DEFAULT '',
  magnet_file_key       text,
  magnet_file_name      text,
  magnet_track_id       uuid,

  -- The upsell. Tier ids are POINTERS re-validated server-side on every render and every
  -- checkout (the tier must be active and belong to this artist); prices are NEVER stored here.
  gold_tier_id          uuid REFERENCES public.subscription_tiers(id) ON DELETE SET NULL,
  gold_item_title       text NOT NULL DEFAULT '',
  gold_item_description text NOT NULL DEFAULT '',
  silver_tier_id        uuid REFERENCES public.subscription_tiers(id) ON DELETE SET NULL,

  activated_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fan_automations_media_is_array   CHECK (jsonb_typeof(trigger_media_ids) = 'array'),
  CONSTRAINT fan_automations_keywords_is_array CHECK (jsonb_typeof(trigger_keywords) = 'array'),
  CONSTRAINT fan_automations_reply_len        CHECK (char_length(public_reply) <= 300),
  CONSTRAINT fan_automations_dm_len           CHECK (char_length(dm_message) <= 900)
);

CREATE INDEX IF NOT EXISTS idx_fan_automations_artist
  ON public.fan_automations (artist_id);

CREATE INDEX IF NOT EXISTS idx_fan_automations_active_conn
  ON public.fan_automations (connection_id)
  WHERE status = 'active';

ALTER TABLE public.fan_automations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fan_automations FROM anon, authenticated;

-- ── 3. Webhook receipts (dedupe + evidence) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.social_webhook_receipts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider             text NOT NULL CHECK (provider IN ('instagram', 'facebook')),
  provider_account_id  text NOT NULL,
  comment_id           text NOT NULL,
  media_id             text,
  commenter_id         text,
  commenter_username   text,
  -- First 200 characters only: enough to debug a keyword miss, no more fan content than needed.
  comment_text         text,

  automation_id        uuid REFERENCES public.fan_automations(id) ON DELETE SET NULL,
  matched              boolean NOT NULL DEFAULT false,
  public_reply_status  text NOT NULL DEFAULT 'skipped' CHECK (public_reply_status IN ('sent', 'failed', 'skipped')),
  dm_status            text NOT NULL DEFAULT 'skipped' CHECK (dm_status IN ('sent', 'failed', 'skipped')),
  -- Provider error summary, passed through redaction first. Never a token, never a full body.
  error_detail         text,

  created_at           timestamptz NOT NULL DEFAULT now()
);

-- THE claim. Insert-as-claim on every delivery; 23505 means this comment was already handled and
-- the redelivery does nothing. This is also what makes Meta's one-private-reply-per-comment rule
-- physically unbreakable from CRWN's side.
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_webhook_receipts_claim
  ON public.social_webhook_receipts (provider, comment_id);

CREATE INDEX IF NOT EXISTS idx_social_webhook_receipts_automation
  ON public.social_webhook_receipts (automation_id, created_at);

ALTER TABLE public.social_webhook_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_webhook_receipts FROM anon, authenticated;

-- ── 4. Funnel leads (attribution spine) ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fan_automation_leads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id       uuid NOT NULL REFERENCES public.fan_automations(id) ON DELETE CASCADE,
  artist_id           uuid NOT NULL,
  email               text NOT NULL,
  first_name          text,
  -- The auth user the capture resolved to (created or reused, Song Lab identityDecision rules).
  -- NULL when a confirmed account owns the email: that path writes no membership and this row
  -- deliberately cannot name whose account it collided with.
  fan_user_id         uuid,
  membership_result   text CHECK (membership_result IN ('created', 'already_member', 'sign_in_required')),

  provider            text,
  comment_id          text,
  media_id            text,

  magnet_delivered_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Duplicate form submission is a re-delivery, never a second lead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fan_automation_leads_dedupe
  ON public.fan_automation_leads (automation_id, email);

CREATE INDEX IF NOT EXISTS idx_fan_automation_leads_artist
  ON public.fan_automation_leads (artist_id, created_at);

ALTER TABLE public.fan_automation_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fan_automation_leads FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Self-verify. A partial apply must fail loudly here. ─────────────────────────────────────
DO $$
DECLARE
  t text;
  n integer;
BEGIN
  FOREACH t IN ARRAY ARRAY['artist_social_connections', 'fan_automations', 'social_webhook_receipts', 'fan_automation_leads'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '% table was not created', t;
    END IF;

    SELECT count(*) INTO n FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND c.relname = t AND c.relrowsecurity;
    IF n <> 1 THEN
      RAISE EXCEPTION 'RLS is not enabled on %', t;
    END IF;

    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t;
    IF n <> 0 THEN
      RAISE EXCEPTION '% has % policies; it must have none (service role only)', t, n;
    END IF;

    -- The compensating control for the ratified token-in-a-row deviation: no client role may
    -- hold ANY privilege on ANY of these tables. This is the assertion that makes the
    -- encrypted token column acceptable.
    SELECT count(*) INTO n FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = t
       AND grantee IN ('anon', 'authenticated');
    IF n <> 0 THEN
      RAISE EXCEPTION '% still grants % privileges to anon/authenticated; the REVOKE did not land', t, n;
    END IF;

    -- No money columns anywhere in this feature. Conversions are derived from subscriptions.
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t
       AND column_name ~ '(amount|cents|payout|price|commission|revenue|earn|balance|fee)';
    IF n <> 0 THEN
      RAISE EXCEPTION '% has % money columns; it must have none', t, n;
    END IF;
  END LOOP;

  -- The one deliberate credential column, and only that one, only there, only ciphertext.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('fan_automations', 'social_webhook_receipts', 'fan_automation_leads')
     AND column_name ~ '(token_enc|secret|access_token)';
  IF n <> 0 THEN
    RAISE EXCEPTION 'a credential column leaked outside artist_social_connections';
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artist_social_connections'
     AND column_name = 'access_token_enc';
  IF n <> 1 THEN
    RAISE EXCEPTION 'artist_social_connections.access_token_enc is missing';
  END IF;

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'social_webhook_receipts'
     AND indexname = 'idx_social_webhook_receipts_claim';
  IF n <> 1 THEN
    RAISE EXCEPTION 'the webhook dedupe claim index is missing; duplicate DMs are possible';
  END IF;

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'artist_social_connections'
     AND indexname = 'idx_social_conn_one_owner_per_account';
  IF n <> 1 THEN
    RAISE EXCEPTION 'the one-owner-per-social-account index is missing; a comment could DM through two artists';
  END IF;
END $$;

-- PROOF OF COMMIT, and the last statement on purpose. No grid means it did not commit.
-- Expect: 4 tables, rls = yes on all, policies = 0 on all, anon/authenticated grants = 0.
SELECT 'A. THIS GRID IS FROM'::text AS what,
       'schema-phase3-fan-automations.sql (fan automations: 4 closed tables)'::text AS detail
UNION ALL
SELECT 'table: ' || t, COALESCE(to_regclass('public.' || t)::text, 'MISSING - did not commit')
  FROM unnest(ARRAY['artist_social_connections', 'fan_automations', 'social_webhook_receipts', 'fan_automation_leads']) AS t
UNION ALL
SELECT 'policies across all 4 (must be 0)', count(*)::text FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('artist_social_connections', 'fan_automations', 'social_webhook_receipts', 'fan_automation_leads')
UNION ALL
SELECT 'client-role grants across all 4 (must be 0)', count(*)::text
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('artist_social_connections', 'fan_automations', 'social_webhook_receipts', 'fan_automation_leads')
   AND grantee IN ('anon', 'authenticated')
 ORDER BY 1;
