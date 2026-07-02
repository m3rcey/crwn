-- ============================================================================
-- ONE-OFF CLEANUP (NOT a migration): remove test artist accounts created while
-- testing the onboarding wizard — the "joshn.wms+onboard…" emails.
--
-- Run in the Supabase SQL Editor. STEP 1 previews; STEP 2 deletes.
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
-- STEP 2 — DELETE. Run this only after STEP 1 looks right.
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

  -- Storage files. avatars/banners are keyed by user id (name = '<uid>/...');
  -- audio, album-art and product-files are keyed by artist id ('<aid>/...').
  -- Removes them from the bucket listings so nothing is left dangling.
  DELETE FROM storage.objects o
  WHERE (o.bucket_id = 'avatars'
         AND EXISTS (SELECT 1 FROM unnest(uids) x WHERE o.name LIKE x::text || '/%'))
     OR (aids IS NOT NULL
         AND o.bucket_id IN ('audio', 'album-art', 'product-files')
         AND EXISTS (SELECT 1 FROM unnest(aids) x WHERE o.name LIKE x::text || '/%'));

  -- Core rows (cascade-linked) + the auth users themselves.
  IF aids IS NOT NULL THEN
    DELETE FROM public.artist_profiles WHERE id = ANY(aids);
  END IF;
  DELETE FROM public.profiles WHERE id = ANY(uids);
  DELETE FROM auth.users      WHERE id = ANY(uids);

  RAISE NOTICE 'Deleted % user(s) and % artist profile(s).',
    array_length(uids, 1), COALESCE(array_length(aids, 1), 0);
END $$;
