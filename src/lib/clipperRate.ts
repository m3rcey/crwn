/**
 * Clipper rev-share ramp resolver.
 *
 * An artist can pay clippers a high cut at launch and step it down over time
 * (campaign clock). The schedule is an ordered list of steps; each step pays
 * `percent` for `days` days. Once every step has elapsed, the rate falls back to
 * the standard rate (artist_profiles.clipper_commission_rate).
 *
 * Resolved lazily — there is no cron. The same row read at checkout yields the
 * current rate purely from the calendar, and the checkout caps it at
 * (100 - platformFeePercent) and locks it into Stripe metadata.
 */

export interface ClipperRateStep {
  /** Cut paid to the clipper during this step, integer percent (0-100). */
  percent: number;
  /** How many days this step lasts before moving to the next. */
  days: number;
}

export interface ClipperRampPreset {
  id: string;
  label: string;
  description: string;
  steps: ClipperRateStep[];
}

/**
 * Starter presets. The standard (post-ramp) rate is set separately by the artist
 * and applies once these steps elapse, so presets only describe the high->down curve.
 */
export const CLIPPER_RAMP_PRESETS: ClipperRampPreset[] = [
  {
    id: 'aggressive',
    label: 'Aggressive launch',
    description: '100% for 30 days, then 50% for 60 days, then your standard rate.',
    steps: [
      { percent: 100, days: 30 },
      { percent: 50, days: 60 },
    ],
  },
  {
    id: 'balanced',
    label: 'Balanced ramp',
    description: '50% for 30 days, then 30% for 60 days, then your standard rate.',
    steps: [
      { percent: 50, days: 30 },
      { percent: 30, days: 60 },
    ],
  },
  {
    id: 'flat',
    label: 'No ramp',
    description: 'Always pay your standard rate. No time-based step-down.',
    steps: [],
  },
];

const MS_PER_DAY = 86_400_000;

/**
 * Resolve the clipper cut that is live right now.
 *
 * @returns integer percent. The standard rate is returned when there is no
 * schedule, no campaign start, or the schedule has fully elapsed.
 */
export function resolveClipperRate(params: {
  schedule?: ClipperRateStep[] | null;
  campaignStartedAt?: string | null;
  standardRate: number;
  now?: Date;
}): number {
  const { schedule, campaignStartedAt, standardRate } = params;
  const standard = Math.max(0, Math.round(standardRate || 0));

  if (!schedule || schedule.length === 0 || !campaignStartedAt) {
    return standard;
  }

  const start = new Date(campaignStartedAt).getTime();
  if (Number.isNaN(start)) return standard;

  const now = (params.now ?? new Date()).getTime();
  const elapsedDays = Math.floor((now - start) / MS_PER_DAY);
  if (elapsedDays < 0) return standard; // campaign scheduled for the future

  let cumulative = 0;
  for (const step of schedule) {
    cumulative += Math.max(0, step.days || 0);
    if (elapsedDays < cumulative) {
      return Math.max(0, Math.round(step.percent || 0));
    }
  }
  return standard;
}

export interface ClipperRateChange {
  /** ISO date the cut changes. */
  date: string;
  /** Cut before this date. */
  from: number;
  /** Cut on/after this date. */
  to: number;
}

export interface ClipperRateTimeline {
  /** The cut live right now. */
  currentRate: number;
  /** Every upcoming (future-dated) change, in chronological order. */
  changes: ClipperRateChange[];
  /** The next change, or null if the rate is flat / fully ramped. */
  nextChange: ClipperRateChange | null;
}

/**
 * Compute the full future schedule of rate changes so clippers can be shown
 * exactly when (and to what) their cut drops — no surprises. Drops are derived
 * deterministically from the campaign start + step days, so this needs no cron.
 */
export function resolveClipperRateTimeline(params: {
  schedule?: ClipperRateStep[] | null;
  campaignStartedAt?: string | null;
  standardRate: number;
  now?: Date;
}): ClipperRateTimeline {
  const { schedule, campaignStartedAt, standardRate } = params;
  const currentRate = resolveClipperRate(params);
  const now = (params.now ?? new Date()).getTime();

  if (!schedule || schedule.length === 0 || !campaignStartedAt) {
    return { currentRate, changes: [], nextChange: null };
  }
  const start = new Date(campaignStartedAt).getTime();
  if (Number.isNaN(start)) return { currentRate, changes: [], nextChange: null };

  const standard = Math.max(0, Math.round(standardRate || 0));
  const changes: ClipperRateChange[] = [];
  let cumulative = 0;
  for (let i = 0; i < schedule.length; i++) {
    cumulative += Math.max(0, schedule[i].days || 0);
    const date = start + cumulative * MS_PER_DAY;
    const from = Math.max(0, Math.round(schedule[i].percent || 0));
    const to = i + 1 < schedule.length
      ? Math.max(0, Math.round(schedule[i + 1].percent || 0))
      : standard;
    if (date > now && to !== from) {
      changes.push({ date: new Date(date).toISOString(), from, to });
    }
  }
  return { currentRate, changes, nextChange: changes[0] ?? null };
}

/**
 * Validate + normalize a schedule coming from client input. Drops malformed steps,
 * clamps to sane bounds, caps length. Returns null for an empty/flat schedule.
 */
export function sanitizeClipperSchedule(input: unknown): ClipperRateStep[] | null {
  if (!Array.isArray(input)) return null;
  const steps: ClipperRateStep[] = [];
  for (const raw of input.slice(0, 6)) {
    if (!raw || typeof raw !== 'object') continue;
    const percent = Math.min(100, Math.max(0, Math.round(Number((raw as ClipperRateStep).percent))));
    const days = Math.min(3650, Math.max(1, Math.round(Number((raw as ClipperRateStep).days))));
    if (Number.isNaN(percent) || Number.isNaN(days)) continue;
    steps.push({ percent, days });
  }
  return steps.length > 0 ? steps : null;
}
