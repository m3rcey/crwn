// The running order of an artist's tracks on their public page. Pure.
//
// WHY THIS IS A MODULE AND NOT FOUR LINES INLINE. It was four lines inline, in
// src/app/[slug]/page.tsx, and the result was computed into `sortedTracks` and then never
// used: the render passed the raw array. So the artist's chosen running order silently did
// nothing for as long as that code existed, and nothing failed, because a discarded sort looks
// exactly like a working one. A pure function with a test cannot be discarded quietly.
//
// IT IS ALSO THE PLAYBACK ORDER. ArtistProfileContent hands this same array to GatedTrackPlayer
// as `trackList`, which becomes the player's queue, so this decides what plays after what when
// a listener presses play and lets it run.

export interface OrderableTrack {
  /** The artist's explicit running order. Null for tracks that have never been arranged. */
  position?: number | null;
  /** ISO timestamp. The fallback ordering, newest first. */
  created_at?: string | null;
}

/**
 * Arranged tracks first, in the artist's order; everything else after, newest first.
 *
 * Two rules, and the second one matters more than it looks: a track with a position is ALWAYS
 * ahead of one without. An artist who has arranged only their first three tracks gets those
 * three at the top, not scattered through a date-ordered list.
 *
 * Returns a NEW array. `Array.prototype.sort` mutates, and the input here is a server-fetched
 * array that other reads on the page also hold.
 */
export function orderTracksForDisplay<T extends OrderableTrack>(tracks: readonly T[]): T[] {
  return [...tracks].sort((a, b) => {
    const pa = a.position ?? null;
    const pb = b.position ?? null;
    if (pa != null && pb != null) return pa - pb;
    if (pa != null) return -1;
    if (pb != null) return 1;
    return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
  });
}
