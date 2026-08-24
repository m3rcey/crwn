// Distribution ranking: TWO deterministic, explainable scores plus a combined
// priority. All weights live here so tuning is a one-file change. No AI.
//
// The first live Ryan Leslie test proved a single blended score fails: a
// 1K-follower superfan posting the artist nine times ranked #1 over every
// page with real reach. So the concept is split:
//
//   AFFINITY          "How strong is the evidence this page cares about THIS
//                      artist?"  A tiny fan page may legitimately max this.
//   DISTRIBUTION      "How valuable could distribution from this page be?"
//   VALUE              Reach-dominated. A 1K page can never beat a healthy
//                      500K page here, whatever it posts.
//   PRIORITY           A geometric blend that rewards BOTH. Multiplicative on
//                      purpose: averaging would let a maxed affinity rescue a
//                      near-zero reach (the exact pathology being fixed).
//
// A component that was genuinely unobserved (hidden engagement) is NULL and
// its score renormalizes over the observed components: missing data neither
// counts as zero evidence nor sinks a page.

export const AFFINITY_WEIGHTS = {
  /** How recently the page posted about the artist. */
  recency: 40,
  /** Unique matched posts inside the window. */
  frequency: 35,
  /** Fraction of matches with strong caption-level evidence. */
  evidence: 15,
  /** Engagement RATE on matched posts (audience-relative, so a small page can score). */
  engagement: 10,
} as const;

export const DISTRIBUTION_WEIGHTS = {
  /** Audience size, log-scaled 10K -> 10M. Deliberately dominant. */
  audience: 70,
  /** Absolute engagement on matched posts, log-scaled 100 -> 100K. */
  engagement: 30,
} as const;

/**
 * Priority = 100 * (distributionValue/100)^0.6 * (affinity/100)^0.4.
 * Distribution gets the larger exponent: the founder is buying reach first,
 * demonstrated interest second. Multiplication means a page needs SOME of
 * both to rank at all.
 */
export const PRIORITY_EXPONENTS = { distribution: 0.6, affinity: 0.4 } as const;

/** Full frequency credit at this many matched posts in the window. */
export const FREQUENCY_SATURATION_POSTS = 6;
/** Full affinity-engagement credit at this engagement rate (likes+comments / followers). */
export const ENGAGEMENT_SATURATION_RATE = 0.02;
/** Audience sub-score: 0 at 10k followers, 1 at 10M, log-scaled. */
const AUDIENCE_LOG_FLOOR = 4; // log10(10_000)
const AUDIENCE_LOG_CEIL = 7; // log10(10_000_000)
/** Absolute-engagement sub-score: 0 at 100 likes+comments, 1 at 100K. */
const ENGAGEMENT_LOG_FLOOR = 2; // log10(100)
const ENGAGEMENT_LOG_CEIL = 5; // log10(100_000)

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function weighted(parts: Array<[number | null, number]>): number {
  let sum = 0;
  let availableWeight = 0;
  for (const [value, weight] of parts) {
    if (value === null) continue;
    sum += value * weight;
    availableWeight += weight;
  }
  return availableWeight > 0 ? (sum / availableWeight) * 100 : 0;
}

export interface AffinityInput {
  /** Days since the most recent matched post. Null when no dated post exists. */
  daysSinceLatest: number | null;
  /** Unique matched posts inside the window. */
  postCount: number;
  /** Fraction (0-1) of matched posts with strong caption-level evidence. */
  strongEvidenceRatio: number;
  /** Average likes+comments across matched posts with observed metrics. */
  avgEngagement: number | null;
  followers: number | null;
  windowDays: number;
}

export interface ComputedAffinity {
  affinity: number;
  components: {
    recency: number | null;
    frequency: number;
    evidence: number;
    engagement: number | null;
  };
}

export function computeAffinity(input: AffinityInput): ComputedAffinity {
  const recency =
    input.daysSinceLatest !== null && input.windowDays > 0
      ? clamp01(1 - input.daysSinceLatest / input.windowDays)
      : null;
  const frequency = clamp01(input.postCount / FREQUENCY_SATURATION_POSTS);
  const evidence = clamp01(input.strongEvidenceRatio);

  let engagement: number | null = null;
  if (input.avgEngagement !== null) {
    if (input.followers !== null && input.followers > 0) {
      engagement = clamp01(input.avgEngagement / input.followers / ENGAGEMENT_SATURATION_RATE);
    } else {
      engagement = clamp01(input.avgEngagement / 10_000);
    }
  }

  const affinity = weighted([
    [recency, AFFINITY_WEIGHTS.recency],
    [frequency, AFFINITY_WEIGHTS.frequency],
    [evidence, AFFINITY_WEIGHTS.evidence],
    [engagement, AFFINITY_WEIGHTS.engagement],
  ]);

  return {
    affinity: Math.round(affinity),
    components: {
      recency: recency === null ? null : Math.round(recency * 100),
      frequency: Math.round(frequency * 100),
      evidence: Math.round(evidence * 100),
      engagement: engagement === null ? null : Math.round(engagement * 100),
    },
  };
}

export interface DistributionValueInput {
  followers: number | null;
  /** Average likes+comments across matched posts with observed metrics. */
  avgEngagement: number | null;
}

export interface ComputedDistributionValue {
  distributionValue: number;
  components: { audience: number | null; engagement: number | null };
}

export function computeDistributionValue(input: DistributionValueInput): ComputedDistributionValue {
  // followers === null means enrichment never observed a count (renormalize);
  // a small OBSERVED count scores an honest zero, which is the whole point.
  const audience =
    input.followers !== null
      ? input.followers > 0
        ? clamp01((Math.log10(input.followers) - AUDIENCE_LOG_FLOOR) / (AUDIENCE_LOG_CEIL - AUDIENCE_LOG_FLOOR))
        : 0
      : null;

  const engagement =
    input.avgEngagement !== null
      ? input.avgEngagement > 0
        ? clamp01((Math.log10(input.avgEngagement) - ENGAGEMENT_LOG_FLOOR) / (ENGAGEMENT_LOG_CEIL - ENGAGEMENT_LOG_FLOOR))
        : 0
      : null;

  const distributionValue = weighted([
    [audience, DISTRIBUTION_WEIGHTS.audience],
    [engagement, DISTRIBUTION_WEIGHTS.engagement],
  ]);

  return {
    distributionValue: Math.round(distributionValue),
    components: {
      audience: audience === null ? null : Math.round(audience * 100),
      engagement: engagement === null ? null : Math.round(engagement * 100),
    },
  };
}

export function computePriority(affinity: number, distributionValue: number): number {
  const a = clamp01(affinity / 100);
  const d = clamp01(distributionValue / 100);
  return Math.round(100 * Math.pow(d, PRIORITY_EXPONENTS.distribution) * Math.pow(a, PRIORITY_EXPONENTS.affinity));
}
