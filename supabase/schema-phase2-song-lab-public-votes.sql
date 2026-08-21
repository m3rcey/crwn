-- Public vote participants: one narrow table, and the reason a new one was unavoidable.
--
-- A live-show attendee types an email and taps CAST MY VOTE. When that address is new,
-- CRWN creates an unverified CAPTURED CONTACT and the vote hangs off it, which is what
-- schema-phase2-song-lab.sql already supports. When the address already belongs to a
-- VERIFIED account there is nowhere safe to put the vote:
--
--   * song_lab_votes.fan_id is NOT NULL REFERENCES profiles(id), and profiles.id is
--     REFERENCES auth.users(id), so a counted vote REQUIRES an auth identity;
--   * one email can only ever have one auth user, so no second identity can be made;
--   * writing it against the existing account's fan_id would attribute an opinion to a
--     real person who never expressed it, award them the participation badge, and let
--     anyone speak in a stranger's name by typing their address;
--   * song_lab_offer_claims has the same NOT NULL fan_id;
--   * fan_contacts and lead_magnet_results have no decision or option concept at all.
--
-- Hence this table. It holds a vote and nothing else: no account link, no readable email,
-- no membership, no rights. It is deliberately NOT an identity table.
--
-- participant_key is an HMAC of the normalized address, keyed by a server-derived subkey
-- (src/lib/songLab/publicParticipant.ts). Storing the address itself would create a list of
-- attendee emails nobody needs to read, and storing the matched user id would assert "this
-- user voted", which is precisely the claim CRWN must not make. The digest gives the one
-- property required, stable deduplication, and nothing else.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS song_lab_public_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES song_lab_decisions(id) ON DELETE CASCADE,
  -- Denormalized for artist-scoped reads and RLS, exactly like song_lab_votes.
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  option_id text NOT NULL,
  -- HMAC-SHA256 hex digest. NEVER an email, never a user id.
  participant_key text NOT NULL,
  -- Which door they came through, same allowlist as song_lab_offer_claims.source.
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One counted vote per participant per decision, the same rule song_lab_votes enforces
  -- for account votes. A re-vote UPDATES the choice; it never adds a second row.
  CONSTRAINT song_lab_public_vote_unique UNIQUE (decision_id, participant_key),
  CONSTRAINT song_lab_public_vote_key_shape CHECK (participant_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT song_lab_public_vote_source CHECK (source IS NULL OR source IN ('qr', 'jubo', 'sms', 'link'))
);

CREATE INDEX IF NOT EXISTS idx_song_lab_public_votes_decision ON song_lab_public_votes(decision_id);
CREATE INDEX IF NOT EXISTS idx_song_lab_public_votes_artist ON song_lab_public_votes(artist_id, created_at);

ALTER TABLE song_lab_public_votes ENABLE ROW LEVEL SECURITY;

-- REVOKE FIRST. A table-level grant left in place is what turned session_polls into a
-- public read once before; the revoke is what makes the policy below meaningful.
REVOKE ALL ON song_lab_public_votes FROM anon, authenticated;

-- The artist may read their own rows (aggregate reporting). Nobody else reads anything,
-- and NOBODY writes from a client: every write is service-role, through the one route.
DROP POLICY IF EXISTS "Artist reads own public votes" ON song_lab_public_votes;
CREATE POLICY "Artist reads own public votes" ON song_lab_public_votes
  FOR SELECT USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

COMMIT;

-- ── Self-verify (runs AFTER commit; a raised assertion here means the assertion is wrong,
--    not that the change rolled back: probe before concluding anything) ─────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'song_lab_public_votes' AND n.nspname = 'public' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: song_lab_public_votes missing or RLS not enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'song_lab_public_vote_unique'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: one-vote-per-participant constraint missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'song_lab_public_vote_key_shape'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: participant_key shape CHECK missing (a raw email could be stored)';
  END IF;

  -- No Data API role may touch this table in any way.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_name = 'song_lab_public_votes'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon/authenticated can WRITE public votes';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_name = 'song_lab_public_votes' AND grantee = 'anon'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon can reach song_lab_public_votes';
  END IF;
END $$;

-- Human-readable receipt (Supabase hides RAISE NOTICE; report in a result set).
SELECT
  (SELECT count(*) FROM song_lab_public_votes) AS public_votes,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'song_lab_public_votes') AS policies,
  'song lab public votes applied' AS status;
