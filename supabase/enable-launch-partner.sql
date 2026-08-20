-- Enable the First Revenue Launch cohort for chosen artists.
-- Founder action. Requires schema-phase2-launch-partner.sql to be applied first.
--
-- 1) Edit v_slugs below to the chosen launch partners (start with THREE).
-- 2) Run it in the Supabase SQL editor.
-- 3) The guarantee checklist appears on their command screen on next load.
--
-- WHY THIS IS NOT A PLAIN UPDATE ANY MORE (2026-08-20). It used to be
-- `UPDATE ... WHERE slug IN ('replace-with-artist-slug')`, which does something worse than
-- fail: run it unedited, or with one slug mistyped, and Postgres reports success having
-- changed NOTHING. The founder then believes three artists are in the cohort and moves on,
-- and the guarantee checklist never appears for anyone. A founder action whose failure mode
-- is silence is a founder action that will eventually be wrong without anyone knowing.
--
-- So: an unedited list aborts, an unknown slug aborts and names it, and the run ends with a
-- SELECT of the actual cohort, because the SQL editor does not display RAISE NOTICE and
-- "Success" alone has never proved anything.

DO $$
DECLARE
  -- EDIT THIS LINE. Three slugs, comma separated, each in single quotes.
  v_slugs text[] := ARRAY['replace-with-artist-slug'];

  v_missing text;
  v_count   int;
BEGIN
  IF 'replace-with-artist-slug' = ANY (v_slugs) THEN
    RAISE EXCEPTION
      'Edit v_slugs first: it still holds the placeholder. Nothing was changed.';
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

-- THE ANSWER. This is the only output the SQL editor will show you, and it is the whole
-- point: these are the artists who are now in the cohort. If this comes back EMPTY, nothing
-- is enabled, whatever the run said above.
SELECT slug, launch_partner
  FROM artist_profiles
 WHERE launch_partner = true
 ORDER BY slug;

-- To remove an artist from the cohort:
-- UPDATE artist_profiles SET launch_partner = false WHERE slug = 'their-slug' RETURNING slug;
