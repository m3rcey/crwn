-- Fan invites: permission-attested imported contacts become invitable through the EXISTING
-- campaigns sender (no second broadcast system).
--
-- Two additive changes:
--   1. fan_contacts gains the import-time permission attestation (who attested is implied by
--      ownership; when and under which consent text version are recorded). Contacts imported
--      before this migration have NULL attestation and are NEVER invitable until re-imported
--      with the confirmation. Import keeps working before this runs (the route strips these
--      columns on PGRST204).
--   2. campaign_sends learns contact recipients: fan_id becomes nullable, contact_id is added,
--      and a CHECK guarantees every send row still belongs to exactly one real recipient.
--
-- RLS: both tables already have RLS enabled with owner policies; additive columns inherit them.
-- Safe to run more than once.

ALTER TABLE fan_contacts ADD COLUMN IF NOT EXISTS consent_attested_at timestamptz;
ALTER TABLE fan_contacts ADD COLUMN IF NOT EXISTS consent_attestation_version text;

ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES fan_contacts(id) ON DELETE SET NULL;
ALTER TABLE campaign_sends ALTER COLUMN fan_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_sends_recipient_check') THEN
    ALTER TABLE campaign_sends
      ADD CONSTRAINT campaign_sends_recipient_check CHECK (fan_id IS NOT NULL OR contact_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_campaign_sends_contact
  ON campaign_sends (contact_id) WHERE contact_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Self-verify (fails LOUDLY on partial apply)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fan_contacts' AND column_name = 'consent_attested_at'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fan_contacts.consent_attested_at missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fan_contacts' AND column_name = 'consent_attestation_version'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fan_contacts.consent_attestation_version missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_sends' AND column_name = 'contact_id'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: campaign_sends.contact_id missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_sends' AND column_name = 'fan_id' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: campaign_sends.fan_id is still NOT NULL';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_sends_recipient_check') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: campaign_sends_recipient_check missing';
  END IF;

  RAISE NOTICE 'OK: fan invites (contact attestation + contact sends) ready';
END $$;
