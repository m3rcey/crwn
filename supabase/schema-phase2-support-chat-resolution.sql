-- ============================================================
-- Support chat: how a conversation ended, and whether it was any good
-- ============================================================
-- Josh's call, 2026-08-01: the chat should not offer "Talk to a human" up front.
-- The assistant gets the first attempt, and a human is brought in only when the
-- USER says it did not solve their problem. Each session then ends with a short
-- survey, for both AI-resolved and human-resolved threads, so we can tell whether
-- support is actually working instead of guessing from escalation counts.
--
-- Adds four columns to support_conversations. Nothing here changes existing rows'
-- behaviour: every column is nullable, so a conversation that predates this simply
-- has no resolution recorded.
--
-- resolved_by tells you WHICH half worked. "ai" with a 5 is the outcome to
-- optimise for; "human" with a 2 is the one to go read.

BEGIN;

ALTER TABLE support_conversations
  ADD COLUMN IF NOT EXISTS resolved_by TEXT
    CHECK (resolved_by IS NULL OR resolved_by IN ('ai', 'human')),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS satisfaction_rating INTEGER
    CHECK (satisfaction_rating IS NULL OR (satisfaction_rating BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS satisfaction_comment TEXT;

-- Reporting: "how did support do this week" reads rating + who resolved it.
CREATE INDEX IF NOT EXISTS idx_support_conversations_resolution
  ON support_conversations (resolved_at DESC)
  WHERE resolved_at IS NOT NULL;

COMMIT;

-- ============================================================
-- Self-verify: every column must exist, or the survey silently no-ops and we
-- would think support was fine because nothing ever came back.
-- ============================================================
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(c, ', ') INTO missing
    FROM unnest(ARRAY['resolved_by', 'resolved_at', 'satisfaction_rating', 'satisfaction_comment']) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_name = 'support_conversations' AND column_name = c
   );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: support_conversations missing column(s): %', missing;
  END IF;

  RAISE NOTICE 'schema-phase2-support-chat-resolution: OK';
END $$;
