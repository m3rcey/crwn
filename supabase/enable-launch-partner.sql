-- Enable the First Revenue Launch cohort. READY TO RUN as shipped.
--
-- The three slugs below were chosen from launch-partner-candidates.sql on 2026-08-20: they are
-- the only three real artists with NOTHING blocking them, meaning music, a photo, a real name,
-- Stripe connected, and at least one paid tier carrying a live Stripe price. An artist missing
-- any of those cannot reach a first paid member no matter how willing they are.
--
--   gb              GB THE G1FT      1 track,  2 priced tiers, 1 active member
--   giovannimaziq   Giovanni Maziq   20 tracks, 1 priced tier
--   lagoo           Lago             14 tracks, 3 priced tiers
--
-- DELIBERATELY EXCLUDED, all technically "ready":
--   m3rcey              the founder's own test artist (CLAUDE.md names it as such)
--   lago                the founder's onboarding test account (joshn.wms+onboardj@)
--   <their-real-slug>   a literal placeholder row, see the note at the bottom of this file
--
-- CHECK ONE THING BEFORE RUNNING: `lagoo` and `lago` are two different accounts both named
-- "Lago". `lago` is the onboarding test account. If `lagoo` is also yours, delete its line
-- below and put a real artist in its place, because enrolling your own account teaches you
-- nothing about delivery hours.
--
-- WHAT THIS FILE CANNOT KNOW, and what actually decides the cohort: prior direct sales, an
-- exportable fan list, and whether they will actually send the campaign. Confirm those three
-- per artist before running. The database has no opinion on any of them.

DO $$
DECLARE
  -- The chosen partners. Three, not five to ten: you are learning delivery hours, not scaling.
  v_slugs text[] := ARRAY['gb', 'giovannimaziq', 'lagoo'];

  v_missing text;
  v_count   int;
BEGIN
  IF 'replace-with-artist-slug' = ANY (v_slugs) THEN
    RAISE EXCEPTION 'Edit v_slugs first: it still holds the placeholder. Nothing was changed.';
  END IF;

  IF array_length(v_slugs, 1) IS NULL THEN
    RAISE EXCEPTION 'v_slugs is empty. Nothing was changed.';
  END IF;

  -- A typo must abort, not quietly enrol two artists out of three.
  SELECT string_agg(s, ', ')
    INTO v_missing
    FROM unnest(v_slugs) AS s
   WHERE NOT EXISTS (SELECT 1 FROM artist_profiles ap WHERE ap.slug = s);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'No artist has slug(s): %. Check the spelling. Nothing was changed.', v_missing;
  END IF;

  UPDATE artist_profiles SET launch_partner = true WHERE slug = ANY (v_slugs);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> array_length(v_slugs, 1) THEN
    RAISE EXCEPTION 'Expected to update % artist(s) but updated %. Nothing was committed.',
      array_length(v_slugs, 1), v_count;
  END IF;
END $$;

-- THE ANSWER. This is the only output the SQL editor will show you, and it is the whole point:
-- these are the artists now in the cohort. If it comes back EMPTY, nothing is enabled,
-- whatever the run said above.
SELECT slug, launch_partner
  FROM artist_profiles
 WHERE launch_partner = true
 ORDER BY slug;

-- To remove an artist from the cohort:
-- UPDATE artist_profiles SET launch_partner = false WHERE slug = 'their-slug' RETURNING slug;
--
-- SEPARATE PROBLEM, NOT FIXED HERE because deleting a row is destructive and yours to approve:
-- production carries an artist whose slug is the literal string `<their-real-slug>` and whose
-- display name is `<their real name>`. It has a track, a priced tier and an uploaded photo, and
-- it is publicly reachable. It is hidden from the Featured row today, but only because
-- `featured_hidden` happens to be true; nothing about the name would have stopped it, since the
-- presentable-name check only rejects an unedited signup EMAIL. Say the word and I will write
-- the cleanup.
