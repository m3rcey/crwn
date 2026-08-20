-- Show the launch partners on the homepage. READY TO RUN. Nothing to edit.
--
-- Open in the Supabase SQL Editor, press Run. It ends by listing who is featured.
--
-- WHY. The Featured row on /home shows only artists with music AND a photo AND a name that is
-- not still their signup email AND `featured_hidden = false`. Probed 2026-08-20, the curation
-- was inverted: it showed `julius-williams` (1 track, no paid tier, cannot take money) and hid
-- `giovannimaziq` (20 tracks) and `lagoo` (14 tracks), both Stripe-connected with priced tiers.
-- The homepage was showing the least finished artists and hiding the most finished ones.
--
-- Enrolling the launch cohort made that worse in a specific way: TWO OF THE THREE PARTNERS are
-- hidden from the one surface that sends fans to artists. The cohort exists to reach a first
-- paid member, and a fan cannot pay an artist they were never shown.
--
-- This unhides the two hidden partners. It does NOT hide anyone: `julius-williams` keeps his
-- tile. Featured is not a reward, and taking a tile away from an artist who is still building
-- is a punishment for being early. A short row is fixed by adding a finished artist, never by
-- lowering the bar or by padding with placeholders.
--
-- `gb` is already visible, so it is listed for completeness and the update is a no-op for him.

DO $$
DECLARE
  v_slugs text[] := ARRAY['gb', 'giovannimaziq', 'lagoo'];
  v_missing text;
BEGIN
  SELECT string_agg(s, ', ')
    INTO v_missing
    FROM unnest(v_slugs) AS s
   WHERE NOT EXISTS (SELECT 1 FROM artist_profiles ap WHERE ap.slug = s);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'No artist has slug(s): %. Nothing was changed.', v_missing;
  END IF;

  UPDATE artist_profiles SET featured_hidden = false WHERE slug = ANY (v_slugs);
END $$;

-- THE ANSWER: everyone who can now appear in the Featured row. The page still applies its own
-- completeness checks on top of this, so a name or photo missing here still keeps a tile out.
SELECT ap.slug,
       p.display_name,
       (p.avatar_url IS NOT NULL) AS has_photo,
       (SELECT count(*) FROM tracks t WHERE t.artist_id = ap.id AND t.is_active) AS tracks
  FROM artist_profiles ap
  LEFT JOIN profiles p ON p.id = ap.user_id
 WHERE ap.featured_hidden = false
 ORDER BY ap.slug;

-- To hide someone again:
-- UPDATE artist_profiles SET featured_hidden = true WHERE slug = 'their-slug' RETURNING slug;
