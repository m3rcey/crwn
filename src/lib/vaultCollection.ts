// vaultCollection.ts — the Vault is a tier-gated artist PLAYLIST (founder decision D5).
//
// No Vault table, no Vault player, no Vault entitlement. The collection is a `playlists` row
// with is_free=false and a cumulative allow list; the ENTITLEMENT stays on each track, read by
// can_play_track like every other track. The playlist gate is presentation (a lock icon on the
// card); the track gate is what actually locks the audio. So "put this in the Vault" has to
// mean two things at once, and this module is the one place that rule lives:
//
//   1. the track joins the collection (playlist_tracks), and
//   2. the track's own gate becomes members-only for the Vault's rung and above, unless it
//      already admits that rung (a "Silver and above" track added to a Gold Vault stays
//      "Silver and above": the Vault NEVER NARROWS what a member already had).
//
// A public track added to the Vault therefore stops being public. That is the artist's
// explicit intent when they place it in a members-only collection, and the form says so
// before they save. Pure: the manager applies the returned updates through the same track
// write it always used.

import { classifyTrack, fieldsForClass, type TrackAccessFields } from '@/lib/membershipStrategy';
import { expandFromTier, rungFromAllowList, type LadderTier } from '@/lib/tierLadder';

export interface VaultTrackInput {
  id: string;
  is_free?: boolean | null;
  allowed_tier_ids?: string[] | null;
  public_release_date?: string | null;
}

export interface VaultTrackUpdate {
  trackId: string;
  fields: TrackAccessFields;
}

/** True when the track already plays for every rung in the Vault's allow list, members-only. */
export function trackAlreadyServesVault(track: VaultTrackInput, vaultTierIds: string[], now = new Date()): boolean {
  if (vaultTierIds.length === 0) return true;
  if (classifyTrack(track, now) !== 'member_only') return false;
  const allowed = track.allowed_tier_ids ?? [];
  return vaultTierIds.every((id) => allowed.includes(id));
}

/**
 * The track writes a gated collection implies. A track that already serves the Vault's rungs
 * returns no update. Any other track becomes member-only for the UNION of what it already
 * admitted and the Vault's rungs, so nothing a member had is taken away.
 */
export function vaultTrackUpdates(tracks: VaultTrackInput[], vaultTierIds: string[], now = new Date()): VaultTrackUpdate[] {
  if (vaultTierIds.length === 0) return [];
  const out: VaultTrackUpdate[] = [];
  for (const t of tracks) {
    if (trackAlreadyServesVault(t, vaultTierIds, now)) continue;
    const union = [...new Set([...(t.allowed_tier_ids ?? []), ...vaultTierIds])];
    out.push({ trackId: t.id, fields: fieldsForClass('member_only', { tierIds: union, now }) });
  }
  return out;
}

/** Plain words for the form: what saving will do to the selected tracks. */
export function describeVaultEffect(tracks: VaultTrackInput[], vaultTierIds: string[], tiers: LadderTier[], now = new Date()): string | null {
  const changing = vaultTrackUpdates(tracks, vaultTierIds, now).length;
  if (changing === 0) return null;
  const rung = rungFromAllowList(tiers, vaultTierIds);
  const name = tiers.find((t) => t.id === rung)?.name;
  const who = name ? `${name} and above` : 'the selected tiers';
  return `${changing} ${changing === 1 ? 'track' : 'tracks'} will become members only for ${who} when you save. Nothing a member already had is taken away.`;
}

/**
 * Find the collection a fast action should open for a rung: an active, gated artist playlist
 * whose allow list is exactly "this rung and above". Prefers one named like a vault. Returns
 * null when none exists, which tells the manager to open the create form prefilled instead.
 */
export function findVaultPlaylist<T extends { id: string; title: string; is_free?: boolean | null; allowed_tier_ids?: string[] | null; is_active?: boolean | null }>(
  playlists: T[],
  tiers: LadderTier[],
  tierId: string,
): T | null {
  const wanted = expandFromTier(tiers, tierId);
  if (wanted.length === 0) return null;
  const matches = playlists.filter((p) => {
    if (p.is_active === false || p.is_free !== false) return false;
    const list = p.allowed_tier_ids ?? [];
    return list.length === wanted.length && wanted.every((id) => list.includes(id));
  });
  if (matches.length === 0) return null;
  return matches.find((p) => /vault/i.test(p.title)) ?? matches[0];
}

export const VAULT_DEFAULT_TITLE = 'The Vault';
