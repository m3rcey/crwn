-- Stop seeding the PUBLIC display name from the private signup email.
--
-- profiles.display_name is an artist's public name everywhere (home feed,
-- explore, /[slug]). handle_new_user() seeded it with
--   COALESCE(raw_user_meta_data->>'display_name', NEW.email)
-- so any user who didn't pass a display_name at signup got their raw EMAIL as
-- their public name. When they then clicked past /welcome without editing it,
-- the email shipped as their artist name (visible on the Featured Artists grid).
--
-- Fix: fall back to NULL, not the email. The /welcome step (required, non-empty)
-- is the single place a real name gets set. display_name is nullable and every
-- render site already falls back (`display_name || 'Artist'`), so NULL is safe.
--
-- This does NOT rewrite existing rows. Artists whose display_name is already an
-- email keep it until they re-save their name; the app now (a) never re-seeds an
-- email into the /welcome field and (b) hides email-named artists from Featured.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, display_name)
  VALUES (
    NEW.id,
    'fan',
    -- Only a name explicitly supplied at signup (e.g. an OAuth account name).
    -- Never the email: it is private and reads as a broken public name.
    NULLIF(NEW.raw_user_meta_data->>'display_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Self-verify: fail loudly if the function did not land as intended.
DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NULL THEN
    RAISE EXCEPTION 'handle_new_user() is missing after migration';
  END IF;
  IF pg_get_functiondef('public.handle_new_user()'::regprocedure) LIKE '%NEW.email%' THEN
    RAISE EXCEPTION 'handle_new_user() still seeds display_name from NEW.email';
  END IF;
END $$;
