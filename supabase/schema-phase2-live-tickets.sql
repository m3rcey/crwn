-- ─────────────────────────────────────────────────────────────────────────────
-- Live pre-sale tickets  (feature: gate a live behind tiers + pre-sell access)
--
-- The tier gate on live_sessions (is_free + allowed_tier_ids) already exists and
-- is enforced at the LiveKit token mint. This migration adds the OTHER access
-- path: a one-time paid "ticket" a fan can buy BEFORE (pre-sale) or during a
-- gated live. Buying a ticket grants that fan access even without the tier.
--
-- live_sessions.price (cents) already exists as an unused stub from
-- schema-phase2-livestreams.sql; a non-null, > 0 price means "ticketed".
-- Mirrors booking_purchases: buyer inserts a pending row at checkout, the Stripe
-- webhook (service role) flips it to 'paid'.
-- ─────────────────────────────────────────────────────────────────────────────

-- Defensive: guarantee the price column exists even if the livestreams migration
-- landed before the column was added.
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS price INTEGER;

CREATE TABLE IF NOT EXISTS live_ticket_purchases (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                 UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  buyer_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id                  UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id   TEXT,
  amount                     INTEGER NOT NULL,               -- cents actually charged
  platform_fee               INTEGER NOT NULL DEFAULT 0,     -- cents
  status                     TEXT NOT NULL DEFAULT 'pending' -- 'pending' | 'paid' | 'refunded'
                             CHECK (status IN ('pending', 'paid', 'refunded')),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Access-gate lookup: "does this buyer hold a paid ticket to this session?"
CREATE INDEX IF NOT EXISTS idx_live_tickets_session_buyer
  ON live_ticket_purchases (session_id, buyer_id, status);
-- Artist's ticket sales for a session.
CREATE INDEX IF NOT EXISTS idx_live_tickets_artist
  ON live_ticket_purchases (artist_id);

ALTER TABLE live_ticket_purchases ENABLE ROW LEVEL SECURITY;

-- Buyer may create their own pending ticket at checkout (matches booking_purchases).
DROP POLICY IF EXISTS "buyer_inserts_own_ticket" ON live_ticket_purchases;
CREATE POLICY "buyer_inserts_own_ticket" ON live_ticket_purchases
  FOR INSERT WITH CHECK (auth.uid() = buyer_id AND status = 'pending');

-- Buyer reads their own tickets.
DROP POLICY IF EXISTS "buyer_reads_own_tickets" ON live_ticket_purchases;
CREATE POLICY "buyer_reads_own_tickets" ON live_ticket_purchases
  FOR SELECT USING (auth.uid() = buyer_id);

-- Artist reads tickets sold on their own sessions.
DROP POLICY IF EXISTS "artist_reads_own_session_tickets" ON live_ticket_purchases;
CREATE POLICY "artist_reads_own_session_tickets" ON live_ticket_purchases
  FOR SELECT USING (
    artist_id IN (
      SELECT id FROM artist_profiles WHERE user_id = auth.uid()
    )
  );

-- (Status transitions to 'paid'/'refunded' happen via the service-role webhook,
--  which bypasses RLS — no UPDATE policy is granted to clients on purpose.)

-- ─── Self-verify (fails loudly on a partial apply) ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_sessions' AND column_name = 'price'
  ) THEN
    RAISE EXCEPTION 'live_sessions.price column missing after migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'live_ticket_purchases'
  ) THEN
    RAISE EXCEPTION 'live_ticket_purchases table missing after migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'live_ticket_purchases' AND policyname = 'buyer_inserts_own_ticket'
  ) THEN
    RAISE EXCEPTION 'buyer_inserts_own_ticket policy missing after migration';
  END IF;
END $$;
