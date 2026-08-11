// crossArtistEvidence.ts — Z10: aggregate patterns across artists, or an honest refusal.
//
// PURE. Takes an array of ALREADY-COMPUTED per-artist rates and aggregates them. It holds no
// database client, so it cannot widen its own cohort, and the caller decides who is in it.
//
// WHY THIS EXISTS, AND WHAT IT REPLACES
// -------------------------------------
// CRWN already had a cross-artist path (`ai/crossArtistPatterns.ts`) that shipped into every
// artist's Manager prompt. It had three defects, and Z10 exists partly to make them impossible:
//   1. Its `n` counted outcome ROWS while its copy said "Across n artists". Two rows from ONE
//      artist produced a "cross-artist" claim.
//   2. That claim carried the other artist's MRR movement in dollars.
//   3. It told an artist-facing model to "weight these patterns when choosing actions", which is
//      an adaptive cross-artist recommendation CRWN's claim ladder does not support.
// So here: the privacy floor counts DISTINCT ARTISTS, no money is aggregated at all, and the
// output is admin evidence rather than prompt copy.
//
// THREE SEPARATE GATES, NOT ONE NUMBER
// ------------------------------------
//   PRIVACY floor   - how many distinct artists before an aggregate may EXIST at all.
//   EVIDENCE floor  - how many underlying observations across them.
//   RELIABILITY gate- whether one artist dominates, which makes a "cohort" a disguise for one.
// Collapsing these into a single `n >= x` is how a benchmark ends up describing one loud artist.
//
// NOT A SCORE, NOT A RANKING, NOT MONEY. No percentile, no health index, no revenue.

/** Pin the methodology. Changing cohort selection, gates or method means a new version. */
export const CROSS_ARTIST_EVIDENCE_VERSION = 'crossArtistEvidence@1';

/**
 * Minimum DISTINCT artists before an aggregate may exist.
 *
 * Founder policy, and deliberately not a statistical claim. Set at 8 because that is the figure the
 * Zero To One strategy already used for comparable-artist evidence; it is here as one named
 * constant so raising it is a one-line decision rather than an archaeology exercise. It is a
 * PRIVACY floor first: below it, an artist reading an aggregate can start reasoning about which
 * specific peers produced it.
 */
export const PRIVACY_MIN_ARTISTS = 8;

/** Minimum total underlying observations across those artists. */
export const EVIDENCE_MIN_OBSERVATIONS = 200;

/**
 * No single artist may account for more than this share of the observations.
 *
 * Without it, "the cohort median" can be one artist with 40,000 visits and seven artists with
 * thirty. The aggregate would be technically cross-artist and practically a portrait of one
 * business, which is both misleading and a privacy problem.
 */
export const RELIABILITY_MAX_ARTIST_SHARE = 0.5;

/** One artist's contribution. The caller computes these; this module never reads a database. */
export interface ArtistContribution {
  /** Opaque to this module. NEVER copied into the output. */
  artistId: string;
  /** The artist's own measured rate, already eligible under their own sample floor. */
  rate: number;
  /** How many observations that rate was measured over. Becomes the weighting evidence. */
  observations: number;
}

export type CohortStatus =
  | 'available'
  | 'below_privacy_floor'
  | 'below_evidence_floor'
  | 'dominated_by_one_artist';

export interface CrossArtistAggregate {
  version: string;
  metric: string;
  cohort: string;
  status: CohortStatus;
  /**
   * The MEDIAN of per-artist rates, not a pooled event rate.
   *
   * Pooled (total joins / total visits) lets the largest artist set the number for everyone. The
   * median of artist-level rates answers "what is typical for an artist here", which is the
   * question a benchmark is actually asked. Null whenever the aggregate is unavailable: an
   * unavailable cohort has no value, and 0 would read as "everyone converts at zero".
   */
  medianArtistRate: number | null;
  /** Distinct artists contributing. Never a list, never an id. */
  artistCount: number;
  /** Total underlying observations. Distinct from artistCount on purpose. */
  observationCount: number;
  /** The largest single artist's share of observations, for auditability. */
  maxArtistShare: number | null;
  /** Earliest date any of this evidence could exist. Prospective systems have short horizons. */
  observedSince: string | null;
  /** Plain sentence. Says "unavailable and why" as readily as it says a number. */
  explanation: string;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Aggregate one metric across artists, or refuse.
 *
 * Refusing is a first-class outcome. A benchmark CRWN cannot stand behind is worth less than the
 * admission that it does not have one yet, and the willingness to say so is the part of this that
 * is actually hard to copy.
 */
export function aggregateAcrossArtists(input: {
  metric: string;
  cohort: string;
  contributions: ArtistContribution[];
  observedSince?: string | null;
}): CrossArtistAggregate {
  const { metric, cohort } = input;
  const observedSince = input.observedSince ?? null;

  // Defensive: one artist appearing twice must not count twice toward the privacy floor.
  const byArtist = new Map<string, ArtistContribution>();
  for (const c of input.contributions) {
    if (!Number.isFinite(c.rate) || !Number.isFinite(c.observations) || c.observations <= 0) continue;
    const existing = byArtist.get(c.artistId);
    if (!existing || c.observations > existing.observations) byArtist.set(c.artistId, c);
  }
  const contributions = [...byArtist.values()];

  const artistCount = contributions.length;
  const observationCount = contributions.reduce((s, c) => s + c.observations, 0);
  const maxArtistShare = observationCount > 0
    ? Math.max(...contributions.map((c) => c.observations)) / observationCount
    : null;

  const base = {
    version: CROSS_ARTIST_EVIDENCE_VERSION,
    metric,
    cohort,
    medianArtistRate: null,
    artistCount,
    observationCount,
    maxArtistShare,
    observedSince,
  };

  if (artistCount < PRIVACY_MIN_ARTISTS) {
    return {
      ...base, status: 'below_privacy_floor',
      explanation: `Unavailable: ${artistCount} of the ${PRIVACY_MIN_ARTISTS} distinct artists needed before an aggregate may exist.`,
    };
  }
  if (observationCount < EVIDENCE_MIN_OBSERVATIONS) {
    return {
      ...base, status: 'below_evidence_floor',
      explanation: `Unavailable: ${observationCount} observations across ${artistCount} artists, below the ${EVIDENCE_MIN_OBSERVATIONS} needed.`,
    };
  }
  if (maxArtistShare !== null && maxArtistShare > RELIABILITY_MAX_ARTIST_SHARE) {
    return {
      ...base, status: 'dominated_by_one_artist',
      explanation: `Unavailable: one artist accounts for ${Math.round(maxArtistShare * 100)}% of the observations, so this would describe them rather than the cohort.`,
    };
  }

  const value = median(contributions.map((c) => c.rate));
  return {
    ...base,
    status: 'available',
    medianArtistRate: value,
    explanation: `Median ${metric} across ${artistCount} artists in the ${cohort} cohort is ${(value * 100).toFixed(1)}%, from ${observationCount} observations${observedSince ? ` since ${observedSince}` : ''}.`,
  };
}
