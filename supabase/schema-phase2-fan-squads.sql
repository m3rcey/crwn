-- schema-phase2-fan-squads.sql
-- Fan Squads / Ambassador Teams: artists organize fans into role-based groups
-- (Top Clippers, Street Team, City Captains, Release Squad, First 100, etc).
-- Squad ROLES are scoped to the squad — they are NOT app-level roles (those stay
-- fan/artist/admin, server-frozen). Squads reuse: fan_badges (badge_key), missions
-- (artist_squad_missions join), fan_events (activity), notifications.
-- Rules (auto-qualify) and rewards are stored as JSONB on the squad rather than as
-- separate tables — simpler, and they're config, not relational data.
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS artist_squads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text,
  type text NOT NULL DEFAULT 'custom' CHECK (type IN (
    'top_clippers','street_team','city_captains','release_squad','first_100',
    'true_regulars','fan_council','live_mods','college_reps','playlist_pushers',
    'vault_insiders','campaign_ambassadors','custom'
  )),
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused','archived')),
  visibility text NOT NULL DEFAULT 'invite_only' CHECK (visibility IN ('private','invite_only','application','public')),
  goal text,
  linked_city text,
  linked_segment_id uuid,             -- saved_segments.id (soft link)
  badge_key text,                     -- fan_badges catalog key awarded on join/qualify
  auto_qualify jsonb NOT NULL DEFAULT '{}',  -- { type, threshold, ... }
  rewards jsonb NOT NULL DEFAULT '[]',       -- [{ reward_type, reward_value, trigger }]
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artist_squads_artist ON artist_squads(artist_id);

CREATE TABLE IF NOT EXISTS artist_squad_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES artist_squads(id) ON DELETE CASCADE,
  fan_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','captain','mod','manager')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited','applied','active','removed','rejected')),
  joined_at timestamptz,
  invited_by uuid,
  approved_by uuid,
  contribution_score integer NOT NULL DEFAULT 0,
  revenue_generated integer NOT NULL DEFAULT 0,   -- cents
  subscribers_attributed integer NOT NULL DEFAULT 0,
  missions_completed integer NOT NULL DEFAULT 0,
  clips_posted integer NOT NULL DEFAULT 0,
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (squad_id, fan_id)
);

CREATE INDEX IF NOT EXISTS idx_squad_members_squad ON artist_squad_members(squad_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_fan ON artist_squad_members(fan_id);

CREATE TABLE IF NOT EXISTS artist_squad_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES artist_squads(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (squad_id, mission_id)
);

CREATE INDEX IF NOT EXISTS idx_squad_missions_squad ON artist_squad_missions(squad_id);

ALTER TABLE artist_squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_squad_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_squad_missions ENABLE ROW LEVEL SECURITY;

-- Squads: owner full control; public squads readable; members can see their squad.
DROP POLICY IF EXISTS "Artists manage own squads" ON artist_squads;
CREATE POLICY "Artists manage own squads" ON artist_squads
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Read public or member squads" ON artist_squads;
CREATE POLICY "Read public or member squads" ON artist_squads
  FOR SELECT USING (
    (visibility = 'public' AND status = 'active')
    OR artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
    OR id IN (SELECT squad_id FROM artist_squad_members WHERE fan_id = auth.uid() AND status = 'active')
  );

-- Members: owning artist manages; a fan sees their own membership rows.
DROP POLICY IF EXISTS "Artists manage own squad members" ON artist_squad_members;
CREATE POLICY "Artists manage own squad members" ON artist_squad_members
  FOR ALL USING (
    squad_id IN (SELECT id FROM artist_squads WHERE artist_id IN
      (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    squad_id IN (SELECT id FROM artist_squads WHERE artist_id IN
      (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Fans read own memberships" ON artist_squad_members;
CREATE POLICY "Fans read own memberships" ON artist_squad_members
  FOR SELECT USING (fan_id = auth.uid());

-- Squad<->mission links: owner manages; squad members can read.
DROP POLICY IF EXISTS "Artists manage own squad missions" ON artist_squad_missions;
CREATE POLICY "Artists manage own squad missions" ON artist_squad_missions
  FOR ALL USING (
    squad_id IN (SELECT id FROM artist_squads WHERE artist_id IN
      (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    squad_id IN (SELECT id FROM artist_squads WHERE artist_id IN
      (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Members read squad missions" ON artist_squad_missions;
CREATE POLICY "Members read squad missions" ON artist_squad_missions
  FOR SELECT USING (
    squad_id IN (SELECT squad_id FROM artist_squad_members WHERE fan_id = auth.uid() AND status = 'active')
  );

DO $$
BEGIN
  IF to_regclass('public.artist_squads') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: artist_squads missing'; END IF;
  IF to_regclass('public.artist_squad_members') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: artist_squad_members missing'; END IF;
  IF to_regclass('public.artist_squad_missions') IS NULL THEN RAISE EXCEPTION 'MIGRATION INCOMPLETE: artist_squad_missions missing'; END IF;
  RAISE NOTICE 'OK: fan squads tables created';
END $$;

COMMIT;
