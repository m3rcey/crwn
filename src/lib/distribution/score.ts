// Distribution Score: a deterministic, explainable ranking heuristic.
// The score is a prioritization aid, never a business truth. All weights live
// here so tuning is a one-file change. No AI is involved in ranking.
//
// A component that was genuinely unobserved (no engagement metrics visible on
// any matched post) is NULL, and the score renormalizes over the observed
// components, so missing data neither counts as zero evidence nor sinks a page.

export interface ScoreInput {
  followers: number | null;
  /** Days since the most recent matched post. Null when no dated post exists. */
  daysSinceLatest: number | null;
  /** Unique matched posts inside the window. */
  postCount: number;
  /** Average likes+comments across matched posts with observed metrics. */
  avgEngagement: number | null;
  /** Fraction (0-1) of matched posts with strong caption-level evidence. */
  strongEvidenceRatio: number;
  windowDays: number;
}

export const SCORE_WEIGHTS = {
  /** Audience size, log-scaled so followers never dominate everything. */
  audience: 30,
  /** How recently the page posted about the artist. */
  recency: 25,
  /** How often the page posted about the artist inside the window. */
  frequency: 25,
  /** Engagement rate on the matched posts. */
  engagement: 15,
  /** Strength of the artist-match evidence. */
  evidence: 5,
} as const;

/** Full frequency credit at this many matched posts in the window. */
export const FREQUENCY_SATURATION_POSTS = 6;
/** Full engagement credit at this engagement rate (likes+comments / followers). */
export const ENGAGEMENT_SATURATION_RATE = 0.02;
/** Audience sub-score: 0 at 10k followers, 1 at 10M, log-scaled. */
const AUDIENCE_LOG_FLOOR = 4; // log10(10_000)
const AUDIENCE_LOG_CEIL = 7; // log10(10_000_000)

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export interface ComputedScore {
  score: number;
  components: {
    audience: number | null;
    recency: number | null;
    frequency: number | null;
    engagement: number | null;
    evidence: number | null;
  };
}

export function computeDistributionScore(input: ScoreInput): ComputedScore {
  const audience =
    input.followers !== null && input.followers > 0
      ? clamp01((Math.log10(input.followers) - AUDIENCE_LOG_FLOOR) / (AUDIENCE_LOG_CEIL - AUDIENCE_LOG_FLOOR))
      : null;

  const recency =
    input.daysSinceLatest !== null && input.windowDays > 0
      ? clamp01(1 - input.daysSinceLatest / input.windowDays)
      : null;

  const frequency = clamp01(input.postCount / FREQUENCY_SATURATION_POSTS);

  let engagement: number | null = null;
  if (input.avgEngagement !== null) {
    if (input.followers !== null && input.followers > 0) {
      engagement = clamp01(input.avgEngagement / input.followers / ENGAGEMENT_SATURATION_RATE);
    } else {
      // Observed engagement but unknown audience: scale against a generous
      // absolute bar so the observation still counts.
      engagement = clamp01(input.avgEngagement / 10_000);
    }
  }

  const evidence = clamp01(input.strongEvidenceRatio);

  const parts: Array<[keyof typeof SCORE_WEIGHTS, number | null]> = [
    ['audience', audience],
    ['recency', recency],
    ['frequency', frequency],
    ['engagement', engagement],
    ['evidence', evidence],
  ];

  let weighted = 0;
  let availableWeight = 0;
  for (const [key, value] of parts) {
    if (value === null) continue;
    weighted += value * SCORE_WEIGHTS[key];
    availableWeight += SCORE_WEIGHTS[key];
  }

  const score = availableWeight > 0 ? Math.round((weighted / availableWeight) * 100) : 0;

  return {
    score,
    components: {
      audience: audience === null ? null : Math.round(audience * 100),
      recency: recency === null ? null : Math.round(recency * 100),
      frequency: Math.round(frequency * 100),
      engagement: engagement === null ? null : Math.round(engagement * 100),
      evidence: Math.round(evidence * 100),
    },
  };
}
