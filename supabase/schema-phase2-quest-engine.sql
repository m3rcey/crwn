-- schema-phase2-quest-engine.sql
-- RISE MODE + SUPPORTER MODE / QUEST ENGINE — Phase 1 (backbone).
--
-- Adds the progression + quest layer that WRAPS existing CRWN systems. It does
-- not gate access to anything (feature access stays governed by platform tier);
-- "unlocks" here are progressive-disclosure state, not permissions.
--
-- Five additive tables:
--   quest_templates  — the catalog. Code registry (src/lib/quests/templates.ts) is
--                      the source of truth and upserts into this table by `key`.
--                      AI/admin/artist-authored quests can also be inserted here.
--   quest_instances  — a quest ASSIGNED to one user, denormalized from its template
--                      so completed quests keep their text/reward as-shown.
--   user_progression — the missing primitive: XP, level, streak, artist build, fan role.
--                      One global row (artist_id NULL) + optional per-artist rows.
--   quest_unlocks    — what a completion revealed (guidance state only).
--   xp_ledger        — append-only, idempotent XP grants (evaluator re-runs safely).
--
-- Completion progress is derived from the existing fan_events log + authoritative
-- domain tables (subscriptions, road_campaigns, etc.) by src/lib/quests/evaluator.ts.
--
-- Apply manually in the Supabase SQL Editor. Idempotent + safe to re-run.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. quest_templates — the catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quest_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,                 -- stable slug, e.g. 'artist_build_first_offer'
  title text NOT NULL,
  subtitle text,
  description text,
  why_it_matters text,
  category text NOT NULL,                   -- e.g. 'setup','offer','campaign','support','promotion' ...
  quest_type text NOT NULL DEFAULT 'side_quest' CHECK (quest_type IN (
    'main_quest','side_quest','daily_move','weekly_goal','boss_quest','live_quest',
    'onboarding_quest','ai_recommended_quest','fulfillment_quest','retention_quest',
    'campaign_quest','promotion_quest','daily_assignment','questline_step'
  )),
  required_role text NOT NULL CHECK (required_role IN ('artist','fan')),
  difficulty text NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy','medium','hard','boss')),
  estimated_time text,                      -- free text: 'under 2 minutes','10 minutes','ongoing' ...
  required_feature text,                    -- feature the quest teaches, e.g. 'campaign_hub'
  level_key text,                           -- artist level / fan stage this belongs to
  prerequisites jsonb NOT NULL DEFAULT '[]',   -- array of prerequisite template keys
  steps jsonb NOT NULL DEFAULT '[]',           -- array of {title, hint?}
  completion_condition jsonb NOT NULL DEFAULT '{"kind":"manual"}',
  reward jsonb NOT NULL DEFAULT '{}',          -- {xp, badges[], unlocks[], proofCard, content[]}
  unlocks jsonb NOT NULL DEFAULT '[]',         -- disclosure keys revealed on completion
  build_tags text[] NOT NULL DEFAULT '{}',     -- artist builds this quest is prioritized for
  can_stream_live boolean NOT NULL DEFAULT false,
  repeatable boolean NOT NULL DEFAULT false,
  priority_score integer NOT NULL DEFAULT 100,
  sort_order integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'system' CHECK (source IN (
    'system','onboarding','ai','campaign','offer','calendar','live','fan_action','manual','admin'
  )),
  created_by text NOT NULL DEFAULT 'system' CHECK (created_by IN ('system','artist','ai','admin')),
  created_by_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quest_templates_role_active ON quest_templates(required_role, is_active);
CREATE INDEX IF NOT EXISTS idx_quest_templates_level ON quest_templates(level_key);
CREATE INDEX IF NOT EXISTS idx_quest_templates_category ON quest_templates(category);

ALTER TABLE quest_templates ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read the active catalog (needed to render "available" quests).
DROP POLICY IF EXISTS "Read active quest templates" ON quest_templates;
CREATE POLICY "Read active quest templates" ON quest_templates
  FOR SELECT USING (is_active = true OR created_by_user_id = auth.uid());
-- Writes are service-role only (code sync / admin / AI). No client policy = denied.

-- ---------------------------------------------------------------------------
-- 2. quest_instances — a quest assigned to one user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quest_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('artist','fan')),
  -- The artist this quest is ABOUT. Artist-side = own artist_profiles.id.
  -- Fan-side = the supported artist. NULL only for global platform quests.
  artist_id uuid REFERENCES artist_profiles(id) ON DELETE CASCADE,
  template_key text,                        -- FK-by-slug to quest_templates.key (nullable for custom)

  -- Denormalized definition (snapshot at assignment — survives template edits)
  title text NOT NULL,
  subtitle text,
  description text,
  why_it_matters text,
  category text NOT NULL,
  quest_type text NOT NULL DEFAULT 'side_quest',
  difficulty text NOT NULL DEFAULT 'easy',
  estimated_time text,
  steps jsonb NOT NULL DEFAULT '[]',
  completion_condition jsonb NOT NULL DEFAULT '{"kind":"manual"}',
  reward jsonb NOT NULL DEFAULT '{}',
  unlocks jsonb NOT NULL DEFAULT '[]',

  status text NOT NULL DEFAULT 'available' CHECK (status IN (
    'locked','available','active','in_progress','ready_to_complete',
    'completed','skipped','expired','failed','archived'
  )),
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  current_step integer NOT NULL DEFAULT 0,
  total_steps integer NOT NULL DEFAULT 0,

  -- Links into existing systems (all nullable; a quest points at what it wraps)
  related_campaign_id uuid,     -- road_campaigns.id
  related_tier_id uuid,         -- subscription_tiers.id (offers)
  related_product_id uuid,      -- products.id (offers)
  related_mission_id uuid,      -- missions.id
  related_live_id uuid,         -- live_sessions.id
  related_demand_id uuid,       -- proof_of_demand.id
  related_city_unlock_id uuid,  -- city_unlocks.id
  related_bounty_id uuid,       -- clip_bounties.id
  related_city text,

  priority_score integer NOT NULL DEFAULT 100,
  repeatable boolean NOT NULL DEFAULT false,
  can_stream_live boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'system',
  created_by text NOT NULL DEFAULT 'system',
  expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quest_instances_user_status ON quest_instances(user_id, status);
CREATE INDEX IF NOT EXISTS idx_quest_instances_user_role ON quest_instances(user_id, role);
CREATE INDEX IF NOT EXISTS idx_quest_instances_artist ON quest_instances(artist_id);
CREATE INDEX IF NOT EXISTS idx_quest_instances_type ON quest_instances(quest_type);
-- A user gets at most one live (non-terminal) instance of a given template per artist.
CREATE UNIQUE INDEX IF NOT EXISTS uq_quest_instance_open
  ON quest_instances(user_id, template_key, COALESCE(artist_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE template_key IS NOT NULL
    AND status NOT IN ('completed','skipped','expired','failed','archived');

ALTER TABLE quest_instances ENABLE ROW LEVEL SECURITY;

-- User reads their own quests. Artists may also read fan quests pointed at their artist
-- world (powers "what are my fans working on"). All writes are service-role (completion
-- is server-derived — a client must never flip its own quest to completed).
DROP POLICY IF EXISTS "Read own or artist-world quest instances" ON quest_instances;
CREATE POLICY "Read own or artist-world quest instances" ON quest_instances
  FOR SELECT USING (
    user_id = auth.uid()
    OR (role = 'fan' AND artist_id IN (
      SELECT id FROM artist_profiles WHERE user_id = auth.uid()
    ))
  );

-- ---------------------------------------------------------------------------
-- 3. user_progression — XP / level / streak / build / role
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_progression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- NULL = the user's GLOBAL progression. Non-null = progression within one artist's world.
  artist_id uuid REFERENCES artist_profiles(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global','artist')),
  role text NOT NULL CHECK (role IN ('artist','fan')),

  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  level_key text,                            -- 'setup','first_supporters','campaign_starter' | fan stage

  streak_count integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_active_date date,

  -- Artist-side identity
  artist_build_primary text,                 -- 'come_up','vault','live','movement','creator_ceo' ...
  artist_build_secondary text,
  -- Fan-side identity (global primary role; per-artist role lives on the artist-scoped row)
  fan_role text,                             -- 'listener','supporter','day_one','promoter','clipper' ...

  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One global row per user; one row per (user, artist).
CREATE UNIQUE INDEX IF NOT EXISTS uq_progression_global
  ON user_progression(user_id) WHERE artist_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_progression_artist
  ON user_progression(user_id, artist_id) WHERE artist_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_progression_artist ON user_progression(artist_id);

ALTER TABLE user_progression ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read own or artist-world progression" ON user_progression;
CREATE POLICY "Read own or artist-world progression" ON user_progression
  FOR SELECT USING (
    user_id = auth.uid()
    OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 4. quest_unlocks — progressive-disclosure state (NOT access control)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quest_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  artist_id uuid REFERENCES artist_profiles(id) ON DELETE CASCADE,
  unlock_key text NOT NULL,                  -- e.g. 'fan_missions','campaign_hub','clip_bounties'
  source_quest_id uuid REFERENCES quest_instances(id) ON DELETE SET NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_unlock_global
  ON quest_unlocks(user_id, unlock_key) WHERE artist_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_unlock_artist
  ON quest_unlocks(user_id, artist_id, unlock_key) WHERE artist_id IS NOT NULL;

ALTER TABLE quest_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read own quest unlocks" ON quest_unlocks;
CREATE POLICY "Read own quest unlocks" ON quest_unlocks
  FOR SELECT USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. xp_ledger — append-only, idempotent XP grants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS xp_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  artist_id uuid REFERENCES artist_profiles(id) ON DELETE CASCADE,
  quest_instance_id uuid REFERENCES quest_instances(id) ON DELETE SET NULL,
  amount integer NOT NULL,
  reason text NOT NULL,                      -- 'quest_complete','streak_bonus','milestone' ...
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: a given quest instance grants a given reason at most once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_xp_ledger_grant
  ON xp_ledger(user_id, quest_instance_id, reason) WHERE quest_instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_xp_ledger_user ON xp_ledger(user_id);

ALTER TABLE xp_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read own xp ledger" ON xp_ledger;
CREATE POLICY "Read own xp ledger" ON xp_ledger
  FOR SELECT USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Feature flag: dark-launch switch for the whole Quest Engine
-- ---------------------------------------------------------------------------
-- Reuses the existing admin_settings key/value store (same table the artist_gate uses).
INSERT INTO admin_settings (key, value)
VALUES ('quest_engine', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. SELF-VERIFY — fail loudly on a partial apply (per DEV_RULES onboarding safety net)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.quest_templates') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: quest_templates missing'; END IF;
  IF to_regclass('public.quest_instances') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: quest_instances missing'; END IF;
  IF to_regclass('public.user_progression') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: user_progression missing'; END IF;
  IF to_regclass('public.quest_unlocks') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: quest_unlocks missing'; END IF;
  IF to_regclass('public.xp_ledger') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: xp_ledger missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'quest_instances' AND cmd = 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: quest_instances has no SELECT policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin_settings WHERE key = 'quest_engine') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: quest_engine feature flag row missing';
  END IF;
  RAISE NOTICE 'OK: quest engine tables, RLS, and feature flag verified.';
END $$;

COMMIT;
