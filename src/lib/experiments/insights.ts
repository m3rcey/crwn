// Pure aggregation + deterministic insight cards for experience comparison.
//
// Rules (enforced here, not left to the UI): sample sizes are always shown; comparisons name the
// period; language is DIRECTIONAL ("higher", "more"), never causal; NO winner is declared when a
// sample is too small; and NO fabricated confidence percentage is ever produced. Statistical
// conclusions are intentionally NOT computed by an LLM.

export interface ExperienceStats {
  key: string;
  title: string;
  eligible: number;
  exposed: number;
  toolCompletions: number;
  builderStarts: number;
  signupCompletions: number;
  featurePublications: number;
  firstDollars: number;
}

/** Minimum per-arm denominator before any comparison is allowed to state a direction. */
export const MIN_SAMPLE = 30;

export function rate(numerator: number, denominator: number): number | null {
  if (!denominator || denominator <= 0) return null;
  return numerator / denominator;
}

export interface InsightCard {
  metricLabel: string;
  period: string;
  /** Directional sentence, or an insufficient-data message. Never causal, never a confidence %. */
  text: string;
  sufficient: boolean;
  a: { key: string; num: number; den: number };
  b: { key: string; num: number; den: number };
}

function pctLabel(r: number | null): string {
  return r == null ? 'n/a' : `${(r * 100).toFixed(1)}%`;
}

/** Compare one rate metric between two experiences, honoring the sufficiency + no-causality rules. */
export function compareRate(
  a: { title: string; num: number; den: number },
  b: { title: string; num: number; den: number },
  metricLabel: string,
  period: string,
): InsightCard {
  const sufficient = a.den >= MIN_SAMPLE && b.den >= MIN_SAMPLE;
  const ra = rate(a.num, a.den);
  const rb = rate(b.num, b.den);
  let text: string;
  if (!sufficient) {
    text = `Not enough data to compare ${metricLabel} yet. Need at least ${MIN_SAMPLE} per experience (have ${a.den} and ${b.den}).`;
  } else if (ra == null || rb == null || ra === rb) {
    text = `${metricLabel} was about the same for ${a.title} (${pctLabel(ra)}) and ${b.title} (${pctLabel(rb)}) during ${period}.`;
  } else {
    const [hi, lo] = ra > rb ? [a, b] : [b, a];
    const [rhi, rlo] = ra > rb ? [ra, rb] : [rb, ra];
    text = `${hi.title} produced a higher ${metricLabel} than ${lo.title} during ${period} (${pctLabel(rhi)} vs ${pctLabel(rlo)}, ${hi.num}/${hi.den} vs ${lo.num}/${lo.den}).`;
  }
  return {
    metricLabel,
    period,
    text,
    sufficient,
    a: { key: a.title, num: a.num, den: a.den },
    b: { key: b.title, num: b.num, den: b.den },
  };
}

/** Build the standard set of comparison cards between two experiences. */
export function buildInsights(a: ExperienceStats, b: ExperienceStats, period: string): InsightCard[] {
  return [
    compareRate(
      { title: a.title, num: a.builderStarts, den: a.toolCompletions },
      { title: b.title, num: b.builderStarts, den: b.toolCompletions },
      'builder-start rate',
      period,
    ),
    compareRate(
      { title: a.title, num: a.signupCompletions, den: a.toolCompletions },
      { title: b.title, num: b.signupCompletions, den: b.toolCompletions },
      'signup completion rate',
      period,
    ),
    compareRate(
      { title: a.title, num: a.featurePublications, den: a.signupCompletions },
      { title: b.title, num: b.featurePublications, den: b.signupCompletions },
      'published-feature rate',
      period,
    ),
    compareRate(
      { title: a.title, num: a.firstDollars, den: a.signupCompletions },
      { title: b.title, num: b.firstDollars, den: b.signupCompletions },
      'first-dollar rate',
      period,
    ),
  ];
}

/** Dedup event rows by a key (exposure dedup). Keeps first occurrence, stable order. */
export function dedupeBy<T>(rows: T[], keyOf: (r: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = keyOf(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}
