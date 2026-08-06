-- Enable (or disable) the First Revenue Launch cohort for chosen artists.
-- Founder action. Requires schema-phase2-launch-partner.sql to be applied first.
--
-- 1) Edit the slug list below to the chosen launch partners (start with THREE).
-- 2) Run it in the Supabase SQL editor.
-- 3) The guarantee checklist appears on their command screen on next load.

UPDATE artist_profiles
SET launch_partner = true
WHERE slug IN ('replace-with-artist-slug');

-- To remove an artist from the cohort:
-- UPDATE artist_profiles SET launch_partner = false WHERE slug = 'replace-with-artist-slug';

-- See who is currently in the cohort:
SELECT slug, launch_partner FROM artist_profiles WHERE launch_partner = true;
