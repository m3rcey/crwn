// Song Lab server-side authorization helper.
//
// Artist identity is ALWAYS session-derived: the caller never supplies an artistId. Every
// management route resolves the signed-in user's own artist_profiles row and then requires
// the song_lab_enabled gate, so a request cannot name another artist's lab and the feature
// stays dark for artists it is not enabled for (403, not a hidden button).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerSupabaseClient } from '@/lib/supabase/server';

export type SongLabArtistAuth =
  | { ok: true; userId: string; artistId: string; slug: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Resolve the signed-in caller's own artist row and require the Song Lab gate.
 * `admin` is the route's service-role client (the gate column is server-only).
 */
export async function requireSongLabArtist(admin: any): Promise<SongLabArtistAuth> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };

  const { data: artist, error } = await admin
    .from('artist_profiles')
    .select('id, slug, song_lab_enabled')
    .eq('user_id', user.id)
    .maybeSingle();

  // Pre-migration (42703) or no artist row: not available. Same answer either way.
  if (error || !artist || artist.song_lab_enabled !== true) {
    return { ok: false, status: 403, error: 'Song Lab is not available for this account' };
  }
  return { ok: true, userId: user.id, artistId: artist.id, slug: artist.slug };
}
