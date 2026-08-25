-- Internal speed-to-lead SMS alert consent (2026-08-25)
--
-- ONE table holding the consent of JNW Creative Enterprises, Inc.'s own authorized personnel to
-- receive internal operational lead alerts by SMS. Written only by /api/sms-alert-consent, which
-- is the server behind the public form at /sms-alert-consent.
--
-- WHY NOT REUSE sms_consent_log. It is structurally impossible and semantically false:
--   * artist_id is UUID NOT NULL REFERENCES artist_profiles(id), and this consent belongs to no
--     artist. There is no honest value to put there.
--   * its action CHECK is ('keyword_received','double_optin_confirmed','opted_out',
--     'import_consent') — four FAN-MARKETING actions from the SMS product removed 2026-07-31.
--     None of them describes a staff member ticking a box on a web form.
--   * that table is a dormant historical record. Writing new rows into it would blur the line
--     between "consent history from the removed product" and "consent for the one narrow
--     internal campaign", which is exactly the distinction the Brain is keeping.
-- acquisition_events was also rejected: it is the LEAD acquisition outbox, its rows are read by
-- acquisition analytics, and an internal staff consent is not a lead event.
--
-- DATA MINIMIZATION. Phone, the exact words agreed to, the version of those words, when, from
-- where, and the network/browser the submission came from. No name, no email, no account, no
-- role. Twilio needs to know a specific number agreed to specific language at a specific time.
--
-- SECURITY. RLS is ON with NO policies, and grants are revoked from anon and authenticated by
-- name. Service role bypasses RLS, so the route can write; nothing else can read. A consent log
-- is a list of real personal phone numbers and must never be publicly readable.

CREATE TABLE IF NOT EXISTS internal_sms_alert_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- E.164, normalized server-side. Never trusted from the browser.
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),

  -- The SERVER's copy of what was agreed to. Storing the client's version would prove nothing.
  consent_version text NOT NULL,
  consent_text text NOT NULL,

  -- Where the consent came from, e.g. 'web_form:/sms-alert-consent'.
  source text NOT NULL,

  -- Standard web opt-in evidence.
  ip_address text,
  user_agent text,

  -- Set when the person replies STOP or asks to be removed. Consent history is append-only:
  -- a withdrawal is recorded, never a deletion, or the record stops being evidence.
  revoked_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_sms_alert_consents_phone
  ON internal_sms_alert_consents (phone_e164, created_at DESC);

ALTER TABLE internal_sms_alert_consents ENABLE ROW LEVEL SECURITY;

-- No policies on purpose: with RLS enabled and no policy, anon and authenticated read nothing.
-- Revoking the grants by name as well, because a table grant is what actually exposes columns,
-- and REVOKE ... FROM PUBLIC does not remove Supabase's per-role grants.
REVOKE ALL ON internal_sms_alert_consents FROM PUBLIC;
REVOKE ALL ON internal_sms_alert_consents FROM anon;
REVOKE ALL ON internal_sms_alert_consents FROM authenticated;

-- SELF-VERIFY: fail LOUDLY if any piece did not land, so a partial apply errors in the SQL
-- editor instead of leaving a consent form that silently stores nothing.
DO $$
BEGIN
  IF to_regclass('public.internal_sms_alert_consents') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: table internal_sms_alert_consents is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.internal_sms_alert_consents'::regclass AND relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: RLS is not enabled on internal_sms_alert_consents — a consent log of real phone numbers would be world-readable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_name = 'internal_sms_alert_consents' AND grantee IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: anon or authenticated still holds a grant on internal_sms_alert_consents';
  END IF;
  RAISE NOTICE 'OK: internal_sms_alert_consents created, RLS enabled, anon/authenticated grants revoked.';
END $$;
