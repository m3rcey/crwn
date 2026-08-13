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

-- 3. SEC-003 (cybersecurity audit 2026-08-12). The profiles freeze trigger.
--    This one CANNOT be proved by an anonymous probe, which is why it declares
--    liveCheck 'sql-check' in EXPECTED_MIGRATION_STATE. Two reasons: the finding is
--    about what an AUTHENTICATED user may WRITE, not what anon may read, and
--    PostgREST cannot see a trigger at all. The trigger also reverts silently rather
--    than raising, so the write returns 204 either way and the status code proves
--    nothing. Reading the installed function source is the honest check.
--    Expect applied = true.
SELECT 'schema-phase2-sec-003-profiles-identity-freeze.sql' AS migration,
       (
         SELECT bool_and(position('NEW.' || col IN p.prosrc) > 0)
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN unnest(ARRAY['is_active', 'stripe_connect_id', 'email', 'phone', 'is_approved']) AS col
         WHERE n.nspname = 'public'
           AND p.proname = 'freeze_profiles_protected_cols'
       ) AS applied;

-- 4. Team Split funded reserve (2026-08-12). Declares liveCheck 'sql-check' because both
--    functions it adds are deliberately REVOKED from anon and authenticated, so an anonymous
--    probe can only ever answer "denied", which is indistinguishable from "never created". The
--    honest check asks the catalog whether the objects exist AND whether they are still closed to
--    the Data API roles, which is the security property that matters.
--    Expect applied = true after running supabase/schema-phase2-team-split-funded-reserve.sql.
SELECT 'schema-phase2-team-split-funded-reserve.sql' AS migration,
       (
         to_regprocedure('public.accept_team_split_deal(uuid,uuid,boolean,numeric)') IS NOT NULL
         AND to_regprocedure('public.team_split_committed_percent(uuid,uuid,text,uuid,numeric,text,numeric)') IS NOT NULL
         AND EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'team_split_earnings' AND column_name = 'funded_reserve_cents')
         AND EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'team_split_payouts' AND column_name = 'payee_kind')
         AND EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tsp_idempotency')
         AND NOT has_function_privilege('authenticated', 'public.accept_team_split_deal(uuid,uuid,boolean,numeric)', 'EXECUTE')
         AND NOT has_function_privilege('anon', 'public.accept_team_split_deal(uuid,uuid,boolean,numeric)', 'EXECUTE')
       ) AS applied;
