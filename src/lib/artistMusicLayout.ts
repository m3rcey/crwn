// The shape of the Music tab on an artist's public page. Pure.
//
// The tab reads like a streaming artist page (founder, 2026-09-30): the newest release on top,
// then Top Songs, then Albums, then Singles and Playlists. Everything here is DERIVED on read
// from rows the page already loaded; nothing about the layout is stored except the artist's own
// pins (`tracks.pin_rank`, migration schema-phase2-track-pins.sql).
//
// TOP SONGS ARE PINS, THEN PLAYS. The artist decides what leads; play count fills the rest.
// Pins are deliberately NOT `tracks.position`: that is the running order, bulk upload writes it
// for every track in a batch, so treating it as a pin would pin a whole catalog and play count
// would never matter (production had exactly that: 94 tracks, positions 0 to 93).

export const TOP_SONGS_LIMIT = 20;
/** Rows per swipeable column in Top Songs, as on a streaming artist page. */
export const TOP_SONGS_PER_COLUMN = 4;

export interface RankableTrack {
  id: string;
  /** The artist's pin: 1 leads. Null or absent means not pinned (and absent before the migration). */
  pin_rank?: number | null;
  play_count?: number | null;
}

/**
 * Pinned tracks first by pin_rank, then everything else by plays, most first. Ties keep the
 * INPUT order, so hand this the running order (orderTracksForDisplay) and an artist with no
 * plays and no pins gets their own order back. Returns a new array, capped at `limit`.
 */
export function rankTopSongs<T extends RankableTrack>(tracks: readonly T[], limit = TOP_SONGS_LIMIT): T[] {
  const indexed = tracks.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    const pa = a.t.pin_rank ?? null;
    const pb = b.t.pin_rank ?? null;
    if (pa != null && pb != null) return pa - pb || a.i - b.i;
    if (pa != null) return -1;
    if (pb != null) return 1;
    return (b.t.play_count ?? 0) - (a.t.play_count ?? 0) || a.i - b.i;
  });
  return indexed.slice(0, Math.max(0, limit)).map((x) => x.t);
}

/** Split a list into columns of `size` for the swipeable Top Songs rows. */
export function toColumns<T>(items: readonly T[], size = TOP_SONGS_PER_COLUMN): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The next pin for a track the artist pins now: after every existing pin. */
export function nextPinRank(tracks: readonly RankableTrack[]): number {
  return tracks.reduce((max, t) => Math.max(max, t.pin_rank ?? 0), 0) + 1;
}

export function pinnedCount(tracks: readonly RankableTrack[]): number {
  return tracks.filter((t) => t.pin_rank != null).length;
}

export interface ReleaseAlbum {
  id: string;
  title: string;
  release_date?: string | null;
  created_at?: string | null;
}
export interface ReleaseTrack {
  id: string;
  title: string;
  release_date?: string | null;
  created_at?: string | null;
}

/** Tracks that belong to no album: the artist's singles. Keeps input order. */
export function standaloneTracks<T extends { id: string }>(tracks: readonly T[], albumTrackIds: ReadonlySet<string>): T[] {
  return tracks.filter((t) => !albumTrackIds.has(t.id));
}

export type LatestRelease<A, T> = { kind: 'album'; album: A; date: string | null } | { kind: 'single'; track: T; date: string | null };

const when = (r: { release_date?: string | null; created_at?: string | null }) => {
  const d = Date.parse(r.release_date ?? '');
  return Number.isNaN(d) ? Number.NEGATIVE_INFINITY : d;
};
const made = (r: { created_at?: string | null }) => {
  const d = Date.parse(r.created_at ?? '');
  return Number.isNaN(d) ? Number.NEGATIVE_INFINITY : d;
};

/**
 * The newest release: an album, or a single (a track in no album), whichever has the later
 * release_date; the later upload breaks a tie. A track inside an album is never a release of its
 * own. Null when the artist has neither.
 */
export function latestRelease<A extends ReleaseAlbum, T extends ReleaseTrack>(
  albums: readonly A[],
  tracks: readonly T[],
  albumTrackIds: ReadonlySet<string>,
): LatestRelease<A, T> | null {
  const candidates: { release: LatestRelease<A, T>; row: ReleaseAlbum | ReleaseTrack }[] = [
    ...albums.map((album) => ({ release: { kind: 'album' as const, album, date: album.release_date ?? null }, row: album })),
    ...standaloneTracks(tracks, albumTrackIds).map((track) => ({
      release: { kind: 'single' as const, track, date: track.release_date ?? null },
      row: track,
    })),
  ];
  let best: (typeof candidates)[number] | null = null;
  for (const c of candidates) {
    if (!best) { best = c; continue; }
    const d = when(c.row) - when(best.row);
    if (d > 0 || (d === 0 && made(c.row) > made(best.row))) best = c;
    else if (Number.isNaN(d) && when(best.row) === Number.NEGATIVE_INFINITY && made(c.row) > made(best.row)) best = c;
  }
  return best ? best.release : null;
}

/** "SEP 30, 2026" from a date-only or full ISO string, read as a calendar date (no timezone shift). */
export function releaseDateLabel(date: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!m) return null;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[Number(m[2]) - 1];
  if (!month) return null;
  return `${month} ${Number(m[3])}, ${m[1]}`;
}

/** The year shown under an album cover. */
export function releaseYear(date: string | null | undefined): string | null {
  const m = /^(\d{4})/.exec(date ?? '');
  return m ? m[1] : null;
}
