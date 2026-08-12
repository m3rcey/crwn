-- READ-ONLY state check (changes nothing). Run in the Supabase SQL editor and
-- paste Claude the full output.
--
-- Purpose: four feature states are marked 'unverified' in the architecture
-- registry (src/lib/architecture/invariants.ts, EXPECTED_MIGRATION_STATE +
-- FEATURES) because TODO.md and the Brain docs contradict each other about
-- them. This query answers all four from production.

-- 1. Flag values the docs disagree about.
SELECT key, value
FROM admin_settings
WHERE key IN ('producer_sessions', 'live_tips', 'royalty_readiness');

-- 2. Are the disputed migrations applied? Each row: object we expect the
--    migration to have created, and whether it exists.
SELECT 'schema-phase2-royalty-readiness.sql' AS migration,
       to_regclass('public.royalty_readiness') IS NOT NULL AS applied
UNION ALL
SELECT 'schema-phase2-producer-sessions.sql',
       to_regclass('public.session_submissions') IS NOT NULL
UNION ALL
SELECT 'schema-phase2-sub-avatar.sql',
       to_regclass('public.sub_avatar_audit') IS NOT NULL
UNION ALL
SELECT 'schema-phase2-earnings-live-tip-type.sql',
       EXISTS (
         SELECT 1
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = 'earnings'
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) LIKE '%live_tip%'
       );
