-- ============================================================
-- princedre-top-songs-pins.sql
--
-- RUN AFTER schema-phase2-track-pins.sql (it needs tracks.pin_rank).
--
-- Pins Prince Dre's Top Songs (founder, 2026-09-30): the two most-watched songs from
-- each of his eight projects, the same 16 his Bronze tier leads with (DRE_BRONZE_SINGLES
-- plus the two vote songs among them, in src/lib/offerExperience/reference/princeDre.ts
-- on the worktree-dre-projects branch). Ordered by those YouTube view counts, most first.
--
-- Pins only. It changes no access: which tier hears a song is still is_free /
-- allowed_tier_ids. Safe to re-run: it clears his pins first, then sets these 16.
-- ============================================================

DO $$
DECLARE
  dre uuid;
  n int;
  missing text;
BEGIN
  SELECT id INTO dre FROM artist_profiles WHERE slug = 'princedre';
  IF dre IS NULL THEN
    RAISE EXCEPTION 'princedre not found';
  END IF;

  CREATE TEMP TABLE dre_pins (title text PRIMARY KEY, rank smallint NOT NULL) ON COMMIT DROP;
  INSERT INTO dre_pins (title, rank) VALUES
    ('Wishing Well', 1),      -- 1.94M  The Return Of The Prince
    ('Hommie', 2),            -- 1.62M  Fresh Prince Of O'Block
    ('MunnaGang', 3),         -- 866K   Fresh Prince Of O'Block
    ('From The O', 4),        -- 717K   Shotta In Da Jungle
    ('In My Eyes', 5),        -- 653K   Only The O In My Eyes
    ('Hide N Seek', 6),       -- 605K   Blood Brothaz
    ('Send It Up', 7),        -- 580K   The Return Of The Prince
    ('Life I Live', 8),       -- 522K   Life I Live
    ('Im A Ridah', 9),        -- 467K   Blood Brothaz
    ('Come From', 10),        -- 284K   Life I Live
    ('My Savages', 11),       -- 221K   Only The O In My Eyes
    ('TurntUp4JMunna', 12),   -- 140K   Shotta In Da Jungle
    ('I Get High', 13),       -- 46K    O Block Ass Nigga
    ('Chasin Dough', 14),     -- 45K    Im Reloaded
    ('Reloaded', 15),         -- 13K    Im Reloaded
    ('Always Made It', 16);   -- 11K    O Block Ass Nigga

  -- Every title must match exactly ONE active track, or nothing is written.
  SELECT string_agg(p.title || ' (' || coalesce(c.cnt, 0) || ')', ', ')
    INTO missing
    FROM dre_pins p
    LEFT JOIN (
      SELECT title, count(*) AS cnt FROM tracks
       WHERE artist_id = dre AND is_active = true GROUP BY title
    ) c ON c.title = p.title
   WHERE coalesce(c.cnt, 0) <> 1;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Not exactly one active track for: %', missing;
  END IF;

  UPDATE tracks SET pin_rank = NULL WHERE artist_id = dre AND pin_rank IS NOT NULL;
  UPDATE tracks t SET pin_rank = p.rank
    FROM dre_pins p
   WHERE t.artist_id = dre AND t.is_active = true AND t.title = p.title;

  SELECT count(*) INTO n FROM tracks WHERE artist_id = dre AND pin_rank IS NOT NULL;
  IF n <> 16 THEN
    RAISE EXCEPTION 'Expected 16 pinned tracks, found %', n;
  END IF;
  RAISE NOTICE 'princedre: 16 Top Songs pinned';
END $$;
