// Song Lab server-side authorization helper.
//
// Artist identity is ALWAYS session-derived: the caller never supplies an artistId. Every
// management route resolves the signed-in user's own artist_profiles row and then requires
// the song_lab_enabled gate, so a request cannot name another artist's lab and the feature
// stays dark for artists it is not enabled for (403, not a hidden button).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { awardFanBadge } from '@/lib/fanBadges';

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

/**
 * The tier a claim on this offer will enroll: the offer's configured tier when it
 * is this artist's own active FREE tier, else the artist's oldest active free tier,
 * else null. ONE resolver shared by the claim route and the vote-first landing so
 * the ballot the page shows is the ballot the claim can actually deliver.
 */
export async function resolveOfferEnrollTier(
  admin: any,
  artistId: string,
  offerTierId: string | null,
): Promise<string | null> {
  if (offerTierId) {
    const { data: tier } = await admin
      .from('subscription_tiers')
      .select('id, price, artist_id')
      .eq('id', offerTierId)
      .eq('artist_id', artistId)
      .eq('is_active', true)
      .maybeSingle();
    if (tier && tier.price === 0) return tier.id;
  }
  const { data: freeTier } = await admin
    .from('subscription_tiers')
    .select('id')
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .eq('price', 0)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return freeTier?.id ?? null;
}

/**
 * The ONE lab-vote writer: upsert on UNIQUE(decision_id, fan_id) so a re-vote
 * changes the choice and never double-counts, plus the idempotent Day One A&R
 * badge. Callers run checkVote FIRST; this only records an allowed vote.
 * Returns false when the write failed.
 */
export async function recordLabVote(
  admin: any,
  decision: { id: string; artist_id: string; project_id: string | null },
  fanId: string,
  optionId: string,
): Promise<boolean> {
  const { error } = await admin
    .from('song_lab_votes')
    .upsert({
      decision_id: decision.id,
      artist_id: decision.artist_id,
      fan_id: fanId,
      option_id: optionId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'decision_id,fan_id' });
  if (error) {
    console.error('[song-lab] vote upsert failed:', error.message);
    return false;
  }
  awardFanBadge(admin, {
    artistId: decision.artist_id,
    fanId,
    badgeKey: 'day_one_anr',
    label: 'Day One A&R',
    icon: '🌅',
    source: 'milestone',
    sourceId: decision.project_id,
  }).catch(() => {});
  return true;
}
