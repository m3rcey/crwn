-- Z8 diagnostic. READ ONLY except one cache-reload NOTIFY. Creates nothing, changes no data.
--
-- Why: after schema-phase3-tier-transitions.sql was reported as run, the production API still
-- answers `PGRST205 / Could not find the table 'public.tier_transitions' in the schema cache`,
-- while `constraint_recommendations` (created in this same project only one session ago) and
-- `subscriptions` both resolve normally through the same API. A stale cache cannot explain that,
-- so the likely answer is the script did not commit.
--
-- The most common cause, and it is not your fault: the Supabase editor runs ONLY THE SELECTION when
-- any text is selected, and still reports success for the part it ran. The whole script is one
-- transaction, so a single error anywhere, including the self-verify block doing its job, rolls the
-- CREATE TABLE back and leaves nothing behind.
--
-- Run this whole file (Ctrl+A first). Read the single result grid.

SELECT 'table'::text AS what,
       COALESCE(to_regclass('public.tier_transitions')::text,
                'MISSING - the migration did NOT commit. Re-run schema-phase3-tier-transitions.sql and send me the error the editor prints') AS detail
UNION ALL
SELECT 'index: ' || indexname, 'present'
  FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'tier_transitions'
UNION ALL
SELECT 'policy: ' || policyname, 'FOR ' || cmd
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tier_transitions'
UNION ALL
SELECT 'rls enabled', CASE WHEN c.relrowsecurity THEN 'yes' ELSE 'NO - stop and tell Claude' END
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'tier_transitions'
UNION ALL
SELECT 'check: ' || conname, 'present'
  FROM pg_constraint WHERE conrelid = to_regclass('public.tier_transitions') AND contype = 'c'
UNION ALL
SELECT 'fk: ' || conname,
       CASE confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
                        WHEN 'r' THEN 'RESTRICT' WHEN 'd' THEN 'SET DEFAULT' ELSE confdeltype::text END
  FROM pg_constraint WHERE conrelid = to_regclass('public.tier_transitions') AND contype = 'f'
UNION ALL
SELECT 'row count', (SELECT count(*)::text FROM pg_class
                      WHERE relname = 'tier_transitions' AND relnamespace = 'public'::regnamespace)
UNION ALL
SELECT 'column count', count(*)::text
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'tier_transitions'
 ORDER BY 1;

-- HOW TO READ IT
--   'table' = MISSING ...  -> it did not commit. Re-run the migration and send me the error.
--   'table' = tier_transitions, with 4 indexes (3 plus the primary key), exactly 1 policy whose cmd
--             is SELECT, rls enabled = yes, a CHECK named tier_transitions_real_movement, fan and
--             tier foreign keys reading SET NULL, and 11 columns
--          -> the DDL is correct and only the API cache was stale. The NOTIFY below fixes that,
--             and I can run the full production verification immediately.
--
-- Expected: exactly ONE policy, and its cmd MUST be SELECT. Any INSERT/UPDATE/DELETE/ALL policy on
-- this table is a defect: all writes are service-role only, by design.

NOTIFY pgrst, 'reload schema';
