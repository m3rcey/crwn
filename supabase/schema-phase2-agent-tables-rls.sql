-- schema-phase2-agent-tables-rls.sql
--
-- Close a WRITE hole on two agent tables.
--
-- THE BUG: agent_coordination and artist_agent_actions each had a single policy
--   FOR ALL TO public USING (true)
-- `FOR ALL` covers INSERT/UPDATE/DELETE, and `public` is every role including
-- anon. So anyone holding the public anon key could insert, edit or delete rows:
-- forge entries in the agent action log, or corrupt the coordination locks that
-- stop the autonomous agent double-running. Confirmed via pg_policies
-- (roles = {public}, qual = true).
--
-- WHY NO WRITER NEEDS THAT POLICY: every write to these tables comes from
-- server-side code using the service-role client (the cron routes and lib/ai/*),
-- and service_role BYPASSES RLS entirely. It never consulted this policy. The
-- only browser access is AiManagerCard.tsx reading artist_agent_actions for the
-- signed-in artist, filtered by artist_id. agent_coordination has no client
-- access at all.
--
-- THE FIX:
--   agent_coordination   -> drop the policy. No client reads or writes it.
--   artist_agent_actions -> drop the policy, add a scoped SELECT so an artist
--                           reads only their OWN rows. Writes stay service-role.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
--
-- The mutating part is wrapped in its own BEGIN/COMMIT so it lands INDEPENDENTLY
-- of the verification below. The Supabase editor runs a bare script as one
-- implicit transaction, so an earlier version of this file that had no COMMIT
-- rolled the whole fix back when its verify block hit a type error. The fix and
-- its check must not share a fate.

BEGIN;

-- RLS is already enabled on both (confirmed in the full pg_class sweep), but
-- assert it so this file is safe in isolation.
ALTER TABLE agent_coordination   ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_agent_actions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Drop every permissive FOR ALL / world policy on these two tables.
-- Named policies are dropped by discovery, because the live name may differ
-- from what any migration in this repo wrote.
-- ============================================================
DO $$
DECLARE
  pol RECORD;
  dropped INTEGER := 0;
BEGIN
  FOR pol IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('agent_coordination', 'artist_agent_actions')
       AND permissive = 'PERMISSIVE'
       AND cmd = 'ALL'
  LOOP
    RAISE NOTICE 'dropping FOR ALL policy % on %', quote_literal(pol.policyname), pol.tablename;
    EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
    dropped := dropped + 1;
  END LOOP;
  RAISE NOTICE 'dropped % FOR ALL polic(y/ies)', dropped;
END $$;

-- ============================================================
-- artist_agent_actions: the artist reads their own action log.
-- (Writes remain service-role only, which bypasses RLS.)
-- ============================================================
DROP POLICY IF EXISTS "Artists read their own agent actions" ON artist_agent_actions;
CREATE POLICY "Artists read their own agent actions"
  ON artist_agent_actions FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- agent_coordination intentionally gets NO policy: with RLS on and no policy,
-- non-service roles can do nothing, and service_role bypasses RLS. That is
-- exactly the desired state (server-only table).

COMMIT;

-- ============================================================
-- Self-verify (runs AFTER the fix is committed, so a bug here cannot undo it).
-- Assert facts about the schema, not behaviour observed from this superuser
-- session (which bypasses RLS).
-- ============================================================
DO $$
DECLARE
  n INTEGER;
BEGIN
  -- No permissive policy on either table may still grant write to a non-service
  -- role. pg_policies.roles is name[], so the literal array is cast to name[].
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('agent_coordination', 'artist_agent_actions')
     AND permissive = 'PERMISSIVE'
     AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
     AND roles && ARRAY['public','anon','authenticated']::name[];
  IF n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: % world-writable polic(y/ies) still exist on the agent tables', n;
  END IF;

  -- agent_coordination must have zero policies (server-only).
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'agent_coordination';
  IF n <> 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: agent_coordination should have no policies, found %', n;
  END IF;

  -- artist_agent_actions must expose exactly the scoped SELECT and nothing world-writable.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'artist_agent_actions' AND policyname = 'Artists read their own agent actions'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: scoped SELECT policy missing on artist_agent_actions';
  END IF;

  RAISE NOTICE 'schema-phase2-agent-tables-rls: OK (write hole closed, artist read scoped)';
END $$;

-- Show what survives.
SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('agent_coordination', 'artist_agent_actions')
 ORDER BY tablename, cmd;

-- ============================================================
-- VERIFY FROM OUTSIDE afterwards (the SQL editor bypasses RLS):
--
--   # write attempt as anon MUST fail (expect 401/403, not 201):
--   curl -s -o /dev/null -w "%{http_code}\n" -X POST \
--     "$SUPABASE_URL/rest/v1/agent_coordination" \
--     -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
--     -d '{"lock_key":"probe"}'
--
--   # anon read of another artist's actions MUST return [] :
--   curl -s "$SUPABASE_URL/rest/v1/artist_agent_actions?select=id&limit=1" \
--     -H "apikey: $ANON_KEY"
-- ============================================================
