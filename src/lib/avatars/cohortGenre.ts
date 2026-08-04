// Genre as a DIMENSION of the sub-avatar cohorts, not a competing bucket.
//
// Why this exists. The scorer's qualification bar (large audience plus proven direct sales)
// reliably outscores every genre segment, so every big seller lands in Highest Priority Empire
// Builder whatever they make, and the genre cohorts quietly become "artists who did not qualify
// as big sellers". Comparing cohort revenue then answers "which cohort holds the biggest
// artists?" (tautologically, the one defined that way) instead of "which content works?".
//
// Cutting each cohort BY genre restores the question worth asking: did the empire-builder funnel
// bring more hip-hop or R&B artists, and which of them actually converted? Genre and priority are
// orthogonal, so they belong on different axes.
//
// THE ONE HONESTY RULE HERE: `other` and `unknown` are different facts and are never merged.
//   - `other`: the artist told us their genre and it is neither family we act on.
//   - `unknown`: the artist never told us, because they had not answered yet (every anonymous
//     top-of-funnel row) or skipped the optional question.
// Folding unknown into other would report an absence of data as a measured result, which is the
// null-is-not-zero rule this codebase keeps everywhere else.

import type { GenreFamily } from './taxonomy';

export type GenreKey = GenreFamily | 'unknown';

/** Fixed output order, so a genre with no identities renders as a visible zero, never a gap. */
export const GENRE_KEYS: GenreKey[] = ['hiphop', 'rnb', 'other', 'unknown'];

export const GENRE_LABELS: Record<GenreKey, string> = {
  hiphop: 'Hip-hop',
  rnb: 'R&B',
  other: 'Other genre',
  unknown: 'Not stated yet',
};

/** One identity (an artist or a signed-up user) inside a cohort. */
export interface CohortIdentity {
  id: string;
  genre: GenreKey;
  /** Whether this identity reached a first paid fan inside the window. */
  firstPaid: boolean;
  /** Realized, refund-netted GMV attributed to this identity. Cents. */
  gmvCents: number;
}

export interface GenreCohortRow {
  genre: GenreKey;
  label: string;
  identities: number;
  firstPaidArtists: number;
  gmvCapturedCents: number;
  /**
   * First-paid rate within this genre slice, or null when the slice is too small to rate.
   * Null rather than 0, so "no data" and "nobody converted" stay distinguishable.
   */
  firstPaidRate: number | null;
}

/** Below this many identities a within-genre rate is noise, so it is reported as null. */
export const GENRE_MIN_SAMPLE = 5;

/**
 * Aggregate a cohort's identities by genre. Always returns all four rows in a fixed order.
 * Pure; no I/O.
 */
export function buildGenreBreakdown(
  identities: CohortIdentity[],
  opts: { minSample?: number } = {},
): GenreCohortRow[] {
  const minSample = opts.minSample ?? GENRE_MIN_SAMPLE;
  const seen = new Set<string>();

  const acc: Record<GenreKey, { identities: number; firstPaidArtists: number; gmvCapturedCents: number }> = {
    hiphop: { identities: 0, firstPaidArtists: 0, gmvCapturedCents: 0 },
    rnb: { identities: 0, firstPaidArtists: 0, gmvCapturedCents: 0 },
    other: { identities: 0, firstPaidArtists: 0, gmvCapturedCents: 0 },
    unknown: { identities: 0, firstPaidArtists: 0, gmvCapturedCents: 0 },
  };

  for (const it of identities) {
    // One identity counts once, however many events it produced.
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    const bucket = acc[it.genre] ?? acc.unknown;
    bucket.identities += 1;
    if (it.firstPaid) bucket.firstPaidArtists += 1;
    bucket.gmvCapturedCents += Number.isFinite(it.gmvCents) && it.gmvCents > 0 ? Math.round(it.gmvCents) : 0;
  }

  return GENRE_KEYS.map((genre) => {
    const a = acc[genre];
    return {
      genre,
      label: GENRE_LABELS[genre],
      identities: a.identities,
      firstPaidArtists: a.firstPaidArtists,
      gmvCapturedCents: a.gmvCapturedCents,
      firstPaidRate: a.identities >= minSample ? a.firstPaidArtists / a.identities : null,
    };
  });
}

/** Validate a `?genre=` filter value. Anything unrecognized means "no filter", never a guess. */
export function parseGenreFilter(raw: string | null | undefined): GenreKey | null {
  const g = (raw || '').trim().toLowerCase();
  return (GENRE_KEYS as string[]).includes(g) ? (g as GenreKey) : null;
}
