-- schema-phase2-fan-badges.sql
-- Fan-facing badge award primitive. Before this, missions.reward_type='badge'
-- was only a label with no award mechanism, and there was no way to give a fan a
-- status badge. Squads (Top Clipper, City Captain), City Unlocks (city badges),
-- Clip Bounties (winner badge) and the CRM all award through fan_badge_awards.
--
-- fan_badges = catalog (global rows have artist_id NULL; artists can add custom).
-- fan_badge_awards = a fan holding a badge in one artist's world.
-- Awards are written service-side via src/lib/fanBadges.ts (awardFanBadge).
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS fan_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid REFERENCES artist_profiles(id) ON DELETE CASCADE, -- NULL = global CRWN badge
  key text NOT NULL,
  label text NOT NULL,
  icon text,          -- emoji
  color text,         -- hex, defaults to gold in app
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- key is unique per artist, and unique among global badges
CREATE UNIQUE INDEX IF NOT EXISTS idx_fan_badges_artist_key
  ON fan_badges(artist_id, key) WHERE artist_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fan_badges_global_key
  ON fan_badges(key) WHERE artist_id IS NULL;

CREATE TABLE IF NOT EXISTS fan_badge_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid REFERENCES artist_profiles(id) ON DELETE CASCADE, -- NULL = platform badge
  fan_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  label text NOT NULL,        -- denormalized snapshot so display is stable
  icon text,
  color text,
  source text,                -- 'squad','city_unlock','bounty','mission','milestone','manual'
  source_id uuid,             -- e.g. squad_id / city_unlock_id / bounty_id
  awarded_by uuid,            -- artist user id, or NULL if system-awarded
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fan_id, artist_id, badge_key)
);

CREATE INDEX IF NOT EXISTS idx_fan_badge_awards_fan ON fan_badge_awards(fan_id);
CREATE INDEX IF NOT EXISTS idx_fan_badge_awards_artist ON fan_badge_awards(artist_id);

ALTER TABLE fan_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE fan_badge_awards ENABLE ROW LEVEL SECURITY;

-- Catalog: public read (badges are non-sensitive), artists manage their own custom badges
DROP POLICY IF EXISTS "Public read badge catalog" ON fan_badges;
CREATE POLICY "Public read badge catalog" ON fan_badges
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Artists manage own badges" ON fan_badges;
CREATE POLICY "Artists manage own badges" ON fan_badges
  FOR ALL USING (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid()));

-- Awards: a fan sees their own badges; the granting artist sees badges in their world.
DROP POLICY IF EXISTS "Fans read own badge awards" ON fan_badge_awards;
CREATE POLICY "Fans read own badge awards" ON fan_badge_awards
  FOR SELECT USING (fan_id = auth.uid());

DROP POLICY IF EXISTS "Artists read own-world badge awards" ON fan_badge_awards;
CREATE POLICY "Artists read own-world badge awards" ON fan_badge_awards
  FOR SELECT USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role inserts badge awards" ON fan_badge_awards;
CREATE POLICY "Service role inserts badge awards" ON fan_badge_awards
  FOR INSERT WITH CHECK (true);

-- Seed a small set of global badges (idempotent).
INSERT INTO fan_badges (artist_id, key, label, icon, color, description) VALUES
  (NULL, 'superfan',      'Superfan',        '👑', '#D4AF37', 'One of this artist''s most valuable fans'),
  (NULL, 'top_clipper',   'Top Clipper',     '✂️', '#D4AF37', 'A leading clipper by attributed subscribers'),
  (NULL, 'city_captain',  'City Captain',    '📍', '#D4AF37', 'Leads the push in their city'),
  (NULL, 'first_100',     'First 100',       '🔥', '#D4AF37', 'Among the first 100 supporters'),
  (NULL, 'promoter',      'Promoter',        '📣', '#D4AF37', 'Brings in new subscribers'),
  (NULL, 'bounty_winner', 'Bounty Winner',   '🏆', '#D4AF37', 'Won a clip bounty')
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public.fan_badges') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fan_badges missing';
  END IF;
  IF to_regclass('public.fan_badge_awards') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: fan_badge_awards missing';
  END IF;
  RAISE NOTICE 'OK: fan_badges + fan_badge_awards created';
END $$;

COMMIT;
