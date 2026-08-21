// Song Lab server-side authorization helper.
//
// Artist identity is ALWAYS session-derived: the caller never supplies an artistId. Every
// management route resolves the signed-in user's own artist_profiles row and then requires
// the song_lab_enabled gate, so a request cannot name another artist's lab and the feature
// stays dark for artists it is not enabled for (403, not a hidden button).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { awardFanBadge } from '@/lib/fanBadges';
import {
  resolveShowPhase,
  isValidTimeZone,
  DEFAULT_SHOW_TIMEZONE,
  type ShowPhase,
  type ShowPoll,
} from './schedule';

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

/** Columns every poll consumer needs. One list so the page and the claim route agree. */
export const SHOW_POLL_COLUMNS =
  'id, project_id, artist_id, stage_label, question, options, status, is_free, allowed_tier_ids, opens_at, closes_at, winning_option_id';

/**
 * Every PUBLISHED poll behind one lead magnet, newest schedule first.
 *
 * Two shapes, one resolver. An offer bound to a PROJECT is an event that can hold several
 * shows (Julius plays two sets behind one printed QR code); an offer bound to a single
 * DECISION is the original one-poll magnet and still works untouched. Drafts never load,
 * so an artist's scratch poll can never reach a fan.
 */
export async function loadEventPolls(
  admin: any,
  artistId: string,
  offer: { project_id?: string | null; decision_id?: string | null },
): Promise<ShowPoll[]> {
  if (offer.project_id) {
    const { data } = await admin
      .from('song_lab_decisions')
      .select(SHOW_POLL_COLUMNS)
      .eq('artist_id', artistId)
      .eq('project_id', offer.project_id)
      .neq('status', 'draft')
      .order('created_at', { ascending: true });
    return (data || []) as ShowPoll[];
  }
  if (offer.decision_id) {
    const { data } = await admin
      .from('song_lab_decisions')
      .select(SHOW_POLL_COLUMNS)
      .eq('artist_id', artistId)
      .eq('id', offer.decision_id)
      .neq('status', 'draft')
      .maybeSingle();
    return data ? [data as ShowPoll] : [];
  }
  return [];
}

/**
 * The event's display timezone. Read with select('*') ON PURPOSE: `show_timezone` arrives
 * with schema-phase2-song-lab-live-shows.sql, and naming a not-yet-existing column would
 * fail the whole query and 404 a live lead magnet. Absent column simply falls back.
 */
export async function eventTimeZone(admin: any, projectId: string | null | undefined): Promise<string> {
  if (!projectId) return DEFAULT_SHOW_TIMEZONE;
  const { data } = await admin.from('song_lab_projects').select('*').eq('id', projectId).maybeSingle();
  const tz = data?.show_timezone;
  return isValidTimeZone(tz) ? tz : DEFAULT_SHOW_TIMEZONE;
}

/**
 * Which poll this lead magnet is showing right now, decided on the SERVER. The landing
 * page and /api/song-lab/claim both call this, so a fan can never vote into a show the
 * page is no longer showing (a phone that loaded at 7:58 and submitted at 8:02 gets a
 * refusal, not a silent vote in the next set).
 */
export async function resolveOfferPhase(
  admin: any,
  artistId: string,
  offer: { project_id?: string | null; decision_id?: string | null },
  now: Date = new Date(),
): Promise<{ polls: ShowPoll[]; phase: ShowPhase; timeZone: string }> {
  const polls = await loadEventPolls(admin, artistId, offer);
  const phase = resolveShowPhase(polls, now);
  // The zone is only needed to SAY when the next set opens, so it is loaded only then.
  const timeZone = phase.kind === 'between'
    ? await eventTimeZone(admin, offer.project_id ?? phase.nextPoll.project_id ?? null)
    : DEFAULT_SHOW_TIMEZONE;
  return { polls, phase, timeZone };
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
