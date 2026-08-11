-- Z3 diagnostic. READ ONLY except for one cache-reload NOTIFY. Creates nothing, changes no data.
--
-- Why this exists: after schema-phase3-recommendation-outcomes.sql was reported as run, the
-- production API still answers `PGRST205 / Could not find the table
-- 'public.constraint_recommendations' in the schema cache`, while peer tables (support_conversations,
-- artist_profiles) resolve normally through the same API in the same project
-- (ecpqtuidtsncjfwtkvwc). That rules out a general outage and points at one of two things:
--   1. the migration did not actually land (most likely: the SQL editor runs the whole script in
--      ONE transaction, so any error, including the self-verify block firing, rolls back the
--      CREATE TABLE too and leaves no trace), or
--   2. it landed and PostgREST has not reloaded its schema cache.
--
-- Run this whole file. Read the single result grid, then see the NOTIFY at the bottom.

SELECT 'table'::text AS what,
       COALESCE(to_regclass('public.constraint_recommendations')::text,
                'MISSING - the migration did NOT land, re-run schema-phase3-recommendation-outcomes.sql and read the error') AS detail
UNION ALL
SELECT 'index: ' || indexname, 'present'
  FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'constraint_recommendations'
UNION ALL
SELECT 'policy: ' || policyname, 'FOR ' || cmd
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'constraint_recommendations'
UNION ALL
SELECT 'rls enabled', CASE WHEN c.relrowsecurity THEN 'yes' ELSE 'NO - fix before use' END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'constraint_recommendations'
UNION ALL
SELECT 'column: ' || column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'constraint_recommendations'
 ORDER BY 1;

-- HOW TO READ IT
--   'table' = MISSING ...  -> the migration did not land. Re-run the migration and read the error
--                             message the editor prints; do not assume a green tick.
--   'table' = constraint_recommendations, and you see 3 indexes, 1 policy (FOR SELECT), rls
--             enabled = yes, and ~15 columns -> the DDL is fine and the problem was only the API
--             schema cache. The NOTIFY below fixes that.
--
-- Expected when healthy: exactly ONE policy, and its cmd must be SELECT. Any INSERT/UPDATE/DELETE/
-- ALL policy on this table is a defect: all writes are service-role only, by design.

-- Force the API to re-read the schema. Harmless if it is already current.
NOTIFY pgrst, 'reload schema';
