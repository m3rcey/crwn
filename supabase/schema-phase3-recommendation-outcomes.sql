-- Z3: recommendation-to-outcome linkage.
--
-- The Constraint Engine (src/lib/constraint/engine.ts) is deterministic and READS ONLY: it names
-- the one thing limiting an artist and returns one action, then forgets it. So CRWN has never been
-- able to answer "what did we recommend, did they act, and did the metric move afterwards" for any
-- recommendation except the AI Manager's (artist_agent_actions + schema-phase2-agent-outcomes.sql).
-- This table is that missing primitive for the DETERMINISTIC recommendation path.
--
-- ONE table, deliberately. Recommendation, action, baseline observation, later observation and
-- outcome are five CONCEPTS but one lifecycle, and splitting them would buy joins and nothing else.
--
-- Why not reuse artist_agent_actions: that table is the DeepSeek Manager's, keyed on AI-generated
-- action types, driven by a status machine for auto-execution, and swept by a cron that computes a
-- financial delta and feeds it back into the AI prompt. A deterministic constraint diagnosis shares
-- none of that lifecycle, and mixing them would both pollute the Manager's learning input and
-- subject constraint recommendations to a 7-day money window that is wrong for, say, a 90-day
-- promise-completion rate.
--
-- WHAT THIS TABLE MAY NEVER HOLD: a causal claim. Nothing here says a recommendation produced a
-- result. `outcome` records whether the CONSTRAINT cleared while the recommendation was open, which
-- is association, not causation, because anything else the artist did in the window is invisible
-- here and several recommendations can target the same metric.
--
-- Apply manually in the Supabase SQL editor. Additive only, no destructive statement. Self-verifies
-- at the end. Until it runs, the issuance path swallows 42P01 and the product behaves exactly as it
-- does today, so applying it IS the launch.

CREATE TABLE IF NOT EXISTS constraint_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,

  -- WHAT CRWN RECOMMENDED ---------------------------------------------------
  -- The engine's ConstraintType. Machine identity, never the prose title.
  constraint_type TEXT NOT NULL,
  -- '<CONSTRAINT>:<DomainCheck|advisory>'. Survives copy edits to the button label, and separates
  -- the two different actions REACH can issue.
  action_key TEXT NOT NULL,
  -- The DomainCheck that proves the move was made. NULL = advisory, and can never be marked done.
  verified_by TEXT,
  -- Sample sufficiency at issue time ('low' | 'medium' | 'high'), the engine's own vocabulary.
  confidence TEXT NOT NULL,

  -- WHAT CRWN BELIEVED AT THE TIME -----------------------------------------
  -- The diagnosis's evidence lines as [{metric, value, unit, state}]. `state` is the Money Model's
  -- canonical complete|modeled|missing, and a null value means MISSING, never zero.
  -- Written once, at issue. The measurement path must never rewrite it.
  baseline_evidence JSONB NOT NULL,

  -- WHETHER THE ARTIST ACTED ------------------------------------------------
  -- Set when the verified_by DomainCheck passes. Completion of the action, NOT success of the
  -- recommendation: these are deliberately separate columns and must stay that way.
  action_completed_at TIMESTAMPTZ,

  -- WHAT WAS OBSERVED LATER -------------------------------------------------
  observed_evidence JSONB,
  -- The engine's answer at measurement time. NULL when it could not evaluate.
  constraint_now TEXT,
  -- 'not_measured_yet' | 'insufficient_evidence' | 'constraint_cleared' | 'constraint_persists'.
  -- insufficient_evidence is NOT success: too little data reads identically to a perfect month.
  outcome TEXT NOT NULL DEFAULT 'not_measured_yet',
  measured_at TIMESTAMPTZ,

  -- Days after issued_at when the outcome may first be read, from the engine's OWN lookback policy
  -- for this stage. NULL where the policy defines no window (RETENTION, FIRST_PAID, DEPTH): those
  -- stay open and unmeasured rather than being judged against an invented deadline.
  measure_after_days INTEGER,

  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IDENTITY. One OPEN recommendation per artist per constraint: the dashboard, and any other surface
-- that renders the same diagnosis, all resolve to this row instead of inserting another. This is
-- what makes "one recommendation shown on many surfaces is one recommendation" true in the database
-- rather than in application discipline.
CREATE UNIQUE INDEX IF NOT EXISTS idx_constraint_rec_open_unique
  ON constraint_recommendations(artist_id, constraint_type)
  WHERE outcome = 'not_measured_yet';

-- The measurement cron: open rows, oldest first.
CREATE INDEX IF NOT EXISTS idx_constraint_rec_due
  ON constraint_recommendations(issued_at)
  WHERE outcome = 'not_measured_yet';

-- The artist's own history, and the admin roll-up.
CREATE INDEX IF NOT EXISTS idx_constraint_rec_artist
  ON constraint_recommendations(artist_id, issued_at DESC);

-- RLS. The artist may READ their own recommendations and nothing else. There is no client INSERT,
-- UPDATE or DELETE policy at all: every write goes through the API with the service-role client, so
-- an artist can never fabricate a recommendation, backdate a baseline, or mark their own outcome
-- cleared. Same shape as support_conversations.
--
-- Note the ownership hop: artist_profiles.user_id is the auth user, and this policy names ONLY
-- id/user_id, never a revoked column, so it cannot 42501 the whole statement.
ALTER TABLE constraint_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_reads_own_recommendations" ON constraint_recommendations;
CREATE POLICY "owner_reads_own_recommendations" ON constraint_recommendations
  FOR SELECT USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- Self-verify. A partial apply errors loudly here instead of half-landing.
DO $$
BEGIN
  IF to_regclass('public.constraint_recommendations') IS NULL THEN
    RAISE EXCEPTION 'constraint_recommendations table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'constraint_recommendations' AND indexname = 'idx_constraint_rec_open_unique'
  ) THEN
    RAISE EXCEPTION 'open-recommendation unique index missing: duplicate recommendations would be possible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'constraint_recommendations' AND policyname = 'owner_reads_own_recommendations'
  ) THEN
    RAISE EXCEPTION 'owner read policy missing on constraint_recommendations';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'constraint_recommendations' AND cmd <> 'SELECT'
  ) THEN
    RAISE EXCEPTION 'constraint_recommendations must have no client write policy; writes are service-role only';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'constraint_recommendations' AND column_name = 'baseline_evidence'
  ) THEN
    RAISE EXCEPTION 'baseline_evidence column missing';
  END IF;
END $$;
