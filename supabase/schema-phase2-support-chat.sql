-- Support chat: users chat with a CRWN AI assistant on /support; when the AI cannot
-- answer (or the user asks for a person), the conversation escalates to the founder,
-- who replies from the admin console's Support tab.
--
-- Mirrors the direct-messages architecture: clients READ via RLS (+ realtime on
-- support_messages); ALL writes go through the API with the service-role client.
-- The AI, escalation, and founder-notification logic live in code
-- (src/app/api/support/chat, src/app/api/admin/support-chat), not the DB.
--
-- Apply manually in the Supabase SQL editor. Self-verifies at the end.
-- No dark-launch flag: the /support chat UI detects a missing table (42P01) and
-- falls back to the contact form until this runs, so applying it IS the launch.

-- 1) Conversations. One row per support thread. status drives the UX:
--    ai              -> the assistant answers
--    human_requested -> escalated, founder notified, awaiting first human reply
--    human_active    -> the founder has replied at least once
--    closed          -> resolved (user can still start a new conversation)
CREATE TABLE IF NOT EXISTS support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ai' CHECK (status IN ('ai', 'human_requested', 'human_active', 'closed')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_preview TEXT,
  founder_unread INTEGER NOT NULL DEFAULT 0,
  escalated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_conversations_user ON support_conversations(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_conversations_status ON support_conversations(status, last_message_at DESC);

-- 2) Messages. sender is 'user', 'ai', or 'human' (the founder).
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'ai', 'human')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_conversation ON support_messages(conversation_id, created_at);

-- 3) RLS: the owner can READ their conversations and messages. No client
--    INSERT/UPDATE/DELETE policies on either table; every write goes through the
--    API with the service-role client (same rule as dm_conversations/dm_messages).
ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_conversations_select_own ON support_conversations;
CREATE POLICY support_conversations_select_own ON support_conversations
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS support_messages_select_own ON support_messages;
CREATE POLICY support_messages_select_own ON support_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_conversations c
      WHERE c.id = support_messages.conversation_id AND c.user_id = auth.uid()
    )
  );

-- 4) Realtime on messages, so the chat updates without reloads (same as dm_messages).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE support_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Self-verify: fail loudly on a partial apply instead of silently half-landing.
DO $$
DECLARE n INTEGER;
BEGIN
  IF to_regclass('public.support_conversations') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: support_conversations table missing';
  END IF;
  IF to_regclass('public.support_messages') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: support_messages table missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.support_conversations'::regclass AND relrowsecurity = true) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: RLS not enabled on support_conversations';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.support_messages'::regclass AND relrowsecurity = true) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: RLS not enabled on support_messages';
  END IF;

  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_conversations';
  IF n < 1 THEN RAISE EXCEPTION 'MIGRATION FAILED: expected 1 policy on support_conversations, found %', n; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_messages';
  IF n < 1 THEN RAISE EXCEPTION 'MIGRATION FAILED: expected 1 policy on support_messages, found %', n; END IF;

  -- No write policies may exist: writes are service-role only.
  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN ('support_conversations', 'support_messages')
    AND cmd <> 'SELECT';
  IF n > 0 THEN RAISE EXCEPTION 'MIGRATION FAILED: found % non-SELECT policies; writes must stay service-role only', n; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_messages'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: support_messages not in supabase_realtime publication';
  END IF;

  RAISE NOTICE 'schema-phase2-support-chat: OK (support chat goes live as soon as the app is deployed)';
END $$;
