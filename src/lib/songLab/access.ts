// Song Lab capability gate — the ONE configuration boundary for GB's experiment.
//
// artist_profiles.song_lab_enabled is a server-only column (no client grant), modeled on
// launch_partner. Every Song Lab route and page asks THIS function; there is deliberately
// no slug check anywhere in the codebase, so widening or removing the experiment is a
// database UPDATE, never a deploy.
//
// Fails soft: before the migration runs (42703) or on any read fault, the answer is false
// and every surface stays dark. That keeps the code shippable ahead of the founder
// applying supabase/schema-phase2-song-lab.sql.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Is Song Lab enabled for this artist? Service-role callers only. */
export async function isSongLabEnabled(admin: any, artistId: string): Promise<boolean> {
  if (!artistId) return false;
  try {
    const { data, error } = await admin
      .from('artist_profiles')
      .select('song_lab_enabled')
      .eq('id', artistId)
      .maybeSingle();
    if (error) return false; // 42703 pre-migration, or any other fault: stay dark
    return data?.song_lab_enabled === true;
  } catch {
    return false;
  }
}

/**
 * Resolve an artist by slug AND require the gate in one read. Returns null when the artist
 * does not exist or Song Lab is not enabled for them, so public routes can 404 without
 * confirming which of the two it was.
 */
export async function songLabArtistBySlug(
  admin: any,
  slug: string,
): Promise<{ artistId: string; userId: string; slug: string } | null> {
  if (!slug) return null;
  try {
    const { data, error } = await admin
      .from('artist_profiles')
      .select('id, user_id, slug, song_lab_enabled')
      .eq('slug', slug)
      .maybeSingle();
    if (error || !data || data.song_lab_enabled !== true) return null;
    return { artistId: data.id, userId: data.user_id, slug: data.slug };
  } catch {
    return null;
  }
}
