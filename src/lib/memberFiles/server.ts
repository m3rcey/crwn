// Server helpers for member files. Every authority decision lives here or in core.ts.
//
// Two rules this module exists to keep:
//   1. The artist is resolved from the SESSION, never from a request body. A caller can
//      name a bundle id; they can never name whose bundle it is.
//   2. A file KEY never leaves the server. The fan-facing payload carries titles, names
//      and sizes; bytes are reachable only through a short-lived signed URL minted after
//      the entitlement check.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerSupabaseClient } from '@/lib/supabase/server';

export type ArtistAuth =
  | { ok: true; userId: string; artistId: string; slug: string }
  | { ok: false; status: 401 | 403; error: string };

/** Resolve the signed-in caller's OWN artist row. Never accepts an artist id. */
export async function requireMemberFilesArtist(admin: any): Promise<ArtistAuth> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };

  const { data: artist } = await admin
    .from('artist_profiles')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!artist) return { ok: false, status: 403, error: 'No artist profile' };
  return { ok: true, userId: user.id, artistId: artist.id, slug: artist.slug };
}

/**
 * The caller's ACTIVE tier for one artist, or null. This is the single source of the
 * entitlement input; nothing downstream may take a tier from a request.
 */
export async function activeTierFor(
  admin: any,
  artistId: string,
  fanId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('subscriptions')
    .select('tier_id')
    .eq('fan_id', fanId)
    .eq('artist_id', artistId)
    .eq('status', 'active')
    .maybeSingle();
  return data?.tier_id ?? null;
}

/**
 * Tier ids to display names, for telling a fan which rung a locked bundle belongs to.
 * Cheapest first, so the label names the lowest qualifying rung.
 */
export async function tierNamesFor(
  admin: any,
  artistId: string,
  tierIds: string[],
): Promise<string[]> {
  if (!tierIds.length) return [];
  const { data } = await admin
    .from('subscription_tiers')
    .select('id, name, price')
    .eq('artist_id', artistId)
    .in('id', tierIds)
    .order('price', { ascending: true });
  return (data || []).map((t: { name: string }) => t.name);
}
