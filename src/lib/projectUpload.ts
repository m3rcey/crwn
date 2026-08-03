// Project-based catalog upload (onboarding music step).
//
// The pure logic behind "add an album/EP/mixtape, a single, or loose tracks":
// payload builders, ordering, validation, and the artwork rule. No IO here, so
// every decision is testable without a database.
//
// REPOSITORY CONVENTIONS THIS ENCODES (verified against production 2026-08-01):
// - A "project" IS an `albums` row. There is no separate project/EP/mixtape
//   model and no release_type; EP and mixtape are labels on the same container.
// - Tracks join a project via `album_tracks` with `track_number` starting at 1.
//   (`album_tracks.position` does not exist in production; `tracks.album_id`
//   exists but is dead: nothing reads or writes it. The junction table is the
//   sole source of truth.)
// - A SINGLE is a standalone track: no albums row, its own optional artwork.
// - Every rendering surface shows `track.album_art_url` only (🎵 fallback);
//   there is NO render-time album→track artwork inheritance. The established
//   mechanism (AlbumManager) is to copy the album-art URL STRING onto the
//   tracks: one storage upload, N references. `artworkBackfill` encodes that.
// - Loose tracks need no artwork: the 🎵/gradient fallback is the product's
//   existing behaviour, so nothing forces a cover.

export type ProjectType = 'project' | 'single' | 'loose';

export interface ProjectAccess {
  isFree: boolean;
  allowedTierIds: string[];
}

/** The `albums` insert payload, matching AlbumManager/QuickCreateAlbumModal. */
export function albumInsertPayload(opts: {
  artistId: string;
  title: string;
  albumArtUrl: string | null;
  access: ProjectAccess;
  releaseDate?: string;
}): Record<string, unknown> {
  return {
    artist_id: opts.artistId,
    title: opts.title.trim(),
    description: null,
    album_art_url: opts.albumArtUrl,
    release_date: opts.releaseDate ?? new Date().toISOString().split('T')[0],
    is_free: opts.access.isFree,
    allowed_tier_ids: opts.access.isFree ? [] : opts.access.allowedTierIds,
    is_active: true,
    price: null,
  };
}

/**
 * `album_tracks` rows in play order. track_number is 1-based and derived from
 * array order, so the review screen's order IS the album order. Duplicate track
 * ids are dropped (first occurrence wins): a retry that re-reports an already
 * linked track must not produce a second join row or renumber the album.
 */
export function albumTrackRows(
  albumId: string,
  trackIdsInOrder: string[],
  startAt: number = 1,
): { album_id: string; track_id: string; track_number: number }[] {
  const seen = new Set<string>();
  const rows: { album_id: string; track_id: string; track_number: number }[] = [];
  for (const trackId of trackIdsInOrder) {
    if (!trackId || seen.has(trackId)) continue;
    seen.add(trackId);
    rows.push({ album_id: albumId, track_id: trackId, track_number: startAt + rows.length });
  }
  return rows;
}

/**
 * What to write to each linked track's album_art_url. Only fills EMPTY slots:
 * a track that already carries its own artwork keeps it (matches the intent of
 * track-specific art; the album cover is the fallback, not an overwrite).
 */
export function artworkBackfill(
  albumArtUrl: string | null,
  tracks: { id: string; album_art_url?: string | null }[],
): { trackIds: string[]; albumArtUrl: string } | null {
  if (!albumArtUrl) return null;
  const trackIds = tracks.filter((t) => !t.album_art_url).map((t) => t.id);
  if (trackIds.length === 0) return null;
  return { trackIds, albumArtUrl };
}

/** Move an item within the review list (up/down arrows; clamped, pure). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const clamped = Math.max(0, Math.min(list.length - 1, to));
  if (clamped === from) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(clamped, 0, item);
  return next;
}

export interface ProjectValidation {
  ok: boolean;
  errors: string[];
}

/**
 * What each project type requires before saving. Mirrors the product rules:
 * a project needs a title and at least one track; artwork is encouraged but
 * never blocks (the fallback renders); a single needs its one file; loose
 * tracks need only files.
 */
export function validateProject(
  type: ProjectType,
  draft: { title?: string; trackCount: number },
): ProjectValidation {
  const errors: string[] = [];
  if (type === 'project') {
    if (!draft.title?.trim()) errors.push('Give the project a title');
    if (draft.trackCount < 1) errors.push('Add at least one track');
  } else if (type === 'single') {
    if (!draft.title?.trim()) errors.push('Give the single a title');
    if (draft.trackCount !== 1) errors.push('A single is exactly one audio file');
  } else if (draft.trackCount < 1) {
    errors.push('Add at least one track');
  }
  return { ok: errors.length === 0, errors };
}

export const PROJECT_TYPE_OPTIONS: { value: ProjectType; label: string; hint: string }[] = [
  {
    value: 'project',
    label: 'An album, EP, or mixtape',
    hint: 'One cover, one title, all its tracks together. Upload the artwork once; every track wears it.',
  },
  {
    value: 'single',
    label: 'One featured track',
    hint: 'Fastest. It starts free so new fans have something to hear today.',
  },
  {
    value: 'loose',
    label: 'A batch of tracks (no project)',
    hint: 'Demos, unreleased songs, or a mixed catalog. No cover needed; add art per track only if you want it.',
  },
];
