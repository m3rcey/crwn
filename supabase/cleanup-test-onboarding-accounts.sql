-- ============================================================================
-- ONE-OFF CLEANUP (NOT a migration): remove test artist accounts created while
-- testing the onboarding wizard — the "joshn.wms+onboard…" emails.
--
-- Run in the Supabase SQL Editor. STEP 1 previews the accounts; STEP 2 lists
-- their storage files (delete those in the Storage dashboard — SQL can't);
-- STEP 3 deletes the DB rows + auth users.
-- Scoped strictly to the matched user ids, so nothing else is touched.
-- Deleting the profiles auto-removes them from Featured Artists / Explore
-- (those are derived from active profiles with music + avatar, not a list).
-- The founder email joshn.wms@gmail.com does NOT match (no "+onboard").
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1 — PREVIEW. Run this ALONE first and eyeball the rows.
-- ---------------------------------------------------------------------------
SELECT u.id, u.email, p.display_name, ap.slug
FROM auth.users u
LEFT JOIN public.profiles p        ON p.id = u.id
LEFT JOIN public.artist_profiles ap ON ap.user_id = u.id
WHERE u.email ILIKE 'joshn.wms+onboard%'
ORDER BY u.email;

-- ---------------------------------------------------------------------------
-- STEP 2 — LIST storage folders to delete (run BEFORE STEP 3, while the rows
-- still exist to resolve the ids). storage.objects can't be DELETEd via SQL, so
-- copy these paths and delete them in the Supabase Storage dashboard (or via the
-- Storage API). Deleting a top-level folder (the '<uuid>/' prefix) removes all
-- files under it. This is OPTIONAL — orphaned files show nowhere once the rows
-- are gone; it just frees space.
-- ---------------------------------------------------------------------------
SELECT o.bucket_id, o.name
FROM storage.objects o
WHERE (o.bucket_id = 'avatars'
       AND o.name LIKE ANY (SELECT id::text || '/%' FROM auth.users WHERE email ILIKE 'joshn.wms+onboard%'))
   OR (o.bucket_id IN ('audio', 'album-art', 'product-files')
       AND o.name LIKE ANY (
         SELECT ap.id::text || '/%'
         FROM public.artist_profiles ap
         JOIN auth.users u ON u.id = ap.user_id
         WHERE u.email ILIKE 'joshn.wms+onboard%'))
ORDER BY o.bucket_id, o.name;

-- ---------------------------------------------------------------------------
-- STEP 3 — DELETE the DB rows + users. Run this after STEP 1 looks right (and,
-- if you want storage cleaned, after handling STEP 2's list).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  uids uuid[];
  aids uuid[];
  r    record;
BEGIN
  SELECT array_agg(id) INTO uids
  FROM auth.users
  WHERE email ILIKE 'joshn.wms+onboard%';

  IF uids IS NULL THEN
    RAISE NOTICE 'No matching users — nothing to do.';
    RETURN;
  END IF;

  SELECT array_agg(id) INTO aids
  FROM public.artist_profiles
  WHERE user_id = ANY(uids);

  -- Clear every row in any PUBLIC table whose single-column FK points at one of
  -- the target artist_profiles / profiles / auth.users rows — cascade or not.
  -- Several passes drain FK chains (e.g. sequences -> sequence_steps) regardless
  -- of order. Strictly scoped to the target ids.
  FOR pass IN 1..5 LOOP
    FOR r IN
      SELECT (nsp.nspname || '.' || quote_ident(rel.relname)) AS ref_table,
             att.attname                                       AS ref_col,
             tgt.relname                                       AS parent_table
      FROM pg_constraint con
      JOIN pg_class      rel  ON rel.oid  = con.conrelid
      JOIN pg_namespace  nsp  ON nsp.oid  = rel.relnamespace
      JOIN pg_class      tgt  ON tgt.oid  = con.confrelid
      JOIN pg_namespace  tnsp ON tnsp.oid = tgt.relnamespace
      JOIN pg_attribute  att  ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
      WHERE con.contype = 'f'
        AND array_length(con.conkey, 1) = 1        -- single-column FKs only
        AND nsp.nspname = 'public'                  -- only clean public schema
        -- NEVER sweep the parent tables themselves — deleting profiles/artist_profiles
        -- here would cascade before their non-cascade children (sequences) are cleared.
        -- They're removed explicitly, in order, after the sweep.
        AND rel.relname NOT IN ('profiles', 'artist_profiles')
        AND (
          (tgt.relname = 'artist_profiles' AND tnsp.nspname = 'public') OR
          (tgt.relname = 'profiles'        AND tnsp.nspname = 'public') OR
          (tgt.relname = 'users'           AND tnsp.nspname = 'auth')
        )
    LOOP
      IF r.parent_table = 'artist_profiles' THEN
        IF aids IS NOT NULL THEN
          EXECUTE format('DELETE FROM %s WHERE %I = ANY($1)', r.ref_table, r.ref_col) USING aids;
        END IF;
      ELSE
        -- profiles.id and auth.users.id are the same uuid as the auth user id.
        EXECUTE format('DELETE FROM %s WHERE %I = ANY($1)', r.ref_table, r.ref_col) USING uids;
      END IF;
    END LOOP;
  END LOOP;

  -- NOTE: Storage files are NOT deleted here — Supabase blocks direct DELETE on
  -- storage.objects (storage.protect_delete). Run "STEP 2" above BEFORE this block
  -- to list the folders, then delete them from the Storage dashboard (or Storage
  -- API). Orphaned files are harmless — they no longer appear anywhere in the app
  -- once these rows are gone.

  -- Core rows (cascade-linked) + the auth users themselves.
  IF aids IS NOT NULL THEN
    DELETE FROM public.artist_profiles WHERE id = ANY(aids);
  END IF;
  DELETE FROM public.profiles WHERE id = ANY(uids);
  DELETE FROM auth.users      WHERE id = ANY(uids);

  RAISE NOTICE 'Deleted % user(s) and % artist profile(s).',
    array_length(uids, 1), COALESCE(array_length(aids, 1), 0);
END $$;
