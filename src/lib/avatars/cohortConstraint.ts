// Deterministic cohort constraint detection: the largest observed drop-off in an avatar cohort's
// funnel, with the evidence that produced it.
//
// This is the COHORT-level sibling of the per-artist Constraint Engine (src/lib/constraint/*),
// and it follows the same house rules (07-BUSINESS-RULES.md section 15a):
//  - Below the minimum sample there is NO diagnosis, not a low-confidence one.
//  - Confidence is sample sufficiency only: medium at the floor, high at 2x the floor.
//  - Copy is neutral and names an INVESTIGATION, never a cause. Conversion data alone cannot
//    prove causation, so the output says where the drop is and what to look at, and nothing else.
//  - Null is not zero: a stage with no data is skipped, never read as a failing stage.
//
// Admin-only surface. Nothing here reaches an artist.

export interface CohortStageCount {
  /** Stable stage id (funnel_events stage name or a derived stage like 'tier_viewed'). */
  stage: string;
  /** Human label for the report. */
  label: string;
  /** Unique units observed at this stage (null = not measured, skip the stage entirely). */
  count: number | null;
}

export interface MetricEvidence {
  label: string;
  value: string;
}

export interface CohortConstraint {
  constraintId: string;
  stage: string;
  severity: 'high' | 'medium' | 'low';
  evidence: MetricEvidence[];
  explanation: string;
  recommendedInvestigation: string;
  confidence: 'high' | 'medium' | 'low';
}

/** Minimum units at the FROM stage before a drop between two stages can be diagnosed at all. */
export const COHORT_MIN_SAMPLE = 30;

// What to look at for a drop INTO each stage. Investigations, not verdicts: every line lists the
// things worth ruling out, and none of them claims to know which one it is.
const INVESTIGATIONS: Record<string, string> = {
  calculator_started:
    'Investigate entry-page clarity: hero promise, CTA visibility, load speed, and whether the traffic source matches the page pain.',
  calculator_completed:
    'Investigate wizard friction: question count, confusing inputs, and where in the steps abandonment concentrates.',
  result_revealed:
    'Investigate result delivery: errors generating results, slow reveals, and whether the result screen renders on mobile.',
  builder_opened:
    'Investigate the result-to-builder transition: CTA wording, whether the result feels finished on its own, and the visibility of the build step.',
  email_submitted:
    'Investigate the email ask: what the artist gets for the address, consent copy, and where the form sits relative to the result.',
  account_created:
    'Investigate the signup boundary: whether the saved work is visible at signup, form length, and OAuth availability.',
  email_verified: 'Investigate verification delivery: spam placement, sender reputation, and the verify email copy.',
  setup_started: 'Investigate the post-signup handoff: does the journey resolver land the artist in the wizard with their plan restored.',
  setup_completed:
    'Investigate wizard completion: which screen artists stall on, and whether the mandatory screens ask for something artists do not have ready.',
  stripe_connected:
    'Investigate the Stripe step: where artists exit Stripe onboarding, and whether the wizard explains why Stripe is needed.',
  builder_published: 'Investigate offer publishing: builder errors, plan-limit warnings, and unclear publish CTAs.',
  fans_imported: 'Investigate the import hub: CSV format failures, attestation friction, and whether artists know the import exists.',
  fan_invited: 'Investigate the launch campaign: draft-to-send drop-off, review friction, and send-quota warnings.',
  first_paid_conversion:
    'Investigate offer clarity, benefit strength, pricing presentation, and CTA visibility on the public page. Tier-level views and checkout starts (tier_events) say which rung loses fans.',
};

const clampCount = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;

/**
 * Find the largest observed proportional drop between adjacent MEASURED stages. Returns null when
 * no adjacent pair clears the sample floor (insufficient evidence is a first-class outcome).
 */
export function readCohortConstraint(
  stages: CohortStageCount[],
  opts: { minSample?: number } = {},
): CohortConstraint | null {
  const minSample = opts.minSample ?? COHORT_MIN_SAMPLE;

  // Only measured stages participate; unmeasured stages are silence, not zeros.
  const measured = stages
    .map((s) => ({ ...s, count: clampCount(s.count) }))
    .filter((s): s is CohortStageCount & { count: number } => s.count !== null);
  if (measured.length < 2) return null;

  let worst: { from: CohortStageCount & { count: number }; to: CohortStageCount & { count: number }; dropRate: number } | null = null;

  for (let i = 0; i < measured.length - 1; i++) {
    const from = measured[i];
    const to = measured[i + 1];
    if (from.count < minSample) continue; // too small to judge
    if (to.count > from.count) continue; // populations not comparable (late joiners, backfill); refuse
    const dropRate = (from.count - to.count) / from.count;
    if (!worst || dropRate > worst.dropRate) worst = { from, to, dropRate };
  }

  if (!worst || worst.dropRate <= 0) return null;

  const pct = Math.round(worst.dropRate * 100);
  const severity: CohortConstraint['severity'] = worst.dropRate >= 0.9 ? 'high' : worst.dropRate >= 0.7 ? 'medium' : 'low';
  const confidence: CohortConstraint['confidence'] =
    worst.from.count >= minSample * 2 ? 'high' : 'medium';

  return {
    constraintId: `drop:${worst.from.stage}->${worst.to.stage}`,
    stage: worst.to.stage,
    severity,
    evidence: [
      { label: worst.from.label, value: worst.from.count.toLocaleString('en-US') },
      { label: worst.to.label, value: worst.to.count.toLocaleString('en-US') },
      { label: 'Drop', value: `${pct}%` },
    ],
    explanation: `The largest observed drop is between ${worst.from.label.toLowerCase()} (${worst.from.count.toLocaleString(
      'en-US',
    )}) and ${worst.to.label.toLowerCase()} (${worst.to.count.toLocaleString('en-US')}), a ${pct}% drop.`,
    recommendedInvestigation:
      INVESTIGATIONS[worst.to.stage] ??
      'Investigate the transition between these two stages: what the user sees, what it asks of them, and where it can silently fail.',
    confidence,
  };
}

/** The ordered acquisition-to-revenue spine the avatar cohort report walks. */
export const AVATAR_FUNNEL_SPINE: { stage: string; label: string }[] = [
  { stage: 'page_viewed', label: 'Entry page viewed' },
  { stage: 'calculator_started', label: 'Calculator started' },
  { stage: 'calculator_completed', label: 'Calculator completed' },
  { stage: 'result_revealed', label: 'Result revealed' },
  { stage: 'email_submitted', label: 'Email captured' },
  { stage: 'account_created', label: 'Account created' },
  { stage: 'setup_started', label: 'Onboarding started' },
  { stage: 'setup_completed', label: 'Setup completed' },
  { stage: 'stripe_connected', label: 'Stripe connected' },
  { stage: 'fans_imported', label: 'Fans imported' },
  { stage: 'fan_invited', label: 'Fans invited' },
  { stage: 'first_paid_conversion', label: 'First paid fan' },
];
