// artistEmailGate.ts: PURE. Which lifecycle email an artist may receive, decided from the
// artist's CURRENT state, at enrollment AND again at the moment of sending.
//
// THE DEFECT THIS CLOSES (audited against production 2026-10-02).
//   • "you are ready for Pro" ($49/mo, "you are making sales") went to ten artists in one week,
//     every one of them with zero fans and zero revenue, three of them with no music. The CRM
//     cron enrolled on "a Stripe Connect id exists", which is written the moment an artist
//     STARTS Connect onboarding.
//   • The Stripe nudge kept sending after Stripe was connected (nothing cancelled it), and it
//     told artists "you've uploaded music" without checking.
//   • Two or three sequences could run against one artist in the same week, each describing a
//     different gap, so the artist was told two things at once.
// The common cause: enrollment decided once, and the send cron never asked again. A queued
// email describing a gap that closed, or a gap that is not the artist's real blocker yet,
// went out anyway.
//
// THE RULE. One activation gap is CURRENT at a time, in the order the setup wizard builds the
// business (music, a paid tier, payouts, the first paying fan). A lifecycle email about a gap
// sends only while that gap is open AND is the current one. Closed means the email is done;
// not-current means it waits (cancelled, so the nudge cron can enroll it again when it becomes
// current). Because an email only goes out once every earlier gap is closed, its copy may
// truthfully say "your music is up" or "your tiers are live".
//
// An upgrade to a paid CRWN plan is only ever proposed on REAL trailing 30-day GMV at or above
// the Pro break-even: the same rule the break-even upgrade pop-up uses. Unknown revenue never
// sells a plan.
//
// This is not a second priority engine. It is the existing activation chain (the nudge
// cron's NUDGE_RULES, moved here so enrollment and sending read ONE definition) plus the
// existing plan break-even. Rise Mode's next move is still the in-app answer.

export type ActivationGap = 'music' | 'paid_tier' | 'stripe' | 'first_paid';

export interface ActivationGapDef {
  gap: ActivationGap;
  triggerType: string;
  /** Milestones that mark the moment the PREVIOUS gaps closed. The latest one anchors the stall. */
  anchorMilestones: string[];
  /** Days the gap must stay current before the first email. */
  stallDays: number;
}

/** In order. The order IS the rule: an earlier open gap holds every later email back. */
export const ACTIVATION_GAPS: readonly ActivationGapDef[] = [
  { gap: 'music', triggerType: 'activation_no_track', anchorMilestones: ['onboarding_completed'], stallDays: 3 },
  {
    gap: 'paid_tier',
    triggerType: 'activation_no_tiers',
    anchorMilestones: ['onboarding_completed', 'first_track_uploaded'],
    stallDays: 2,
  },
  {
    gap: 'stripe',
    triggerType: 'activation_no_stripe',
    anchorMilestones: ['onboarding_completed', 'first_track_uploaded', 'tiers_created'],
    stallDays: 1,
  },
  {
    gap: 'first_paid',
    triggerType: 'activation_no_subscribers',
    anchorMilestones: ['onboarding_completed', 'first_track_uploaded', 'tiers_created', 'stripe_connected'],
    stallDays: 7,
  },
];

// A stall older than this is recorded truth, not news (Decision D). One constant, owned there.
import { MAX_STALL_WINDOW_DAYS } from '@/lib/milestoneReconcile';
export { MAX_STALL_WINDOW_DAYS };

export interface ArtistEmailFacts {
  /** artist_profiles.activation_milestones (reconciled daily before the nudge pass). */
  milestones: Record<string, string>;
  /** At least one ACTIVE tier priced above zero. The free Bronze rung never counts. */
  hasPaidTier: boolean;
  /** artist_profiles.platform_tier ('starter' is the Launch plan). */
  platformTier: string | null;
  /** Gross trailing 30-day GMV in cents from the earnings ledger. Null means NOT KNOWN. */
  gmv30dCents: number | null;
}

/** Is this gap still open? Every answer comes from a canonical fact, never from the enrollment. */
export function gapIsOpen(gap: ActivationGap, f: ArtistEmailFacts): boolean {
  switch (gap) {
    case 'music':
      return !f.milestones.first_track_uploaded;
    case 'paid_tier':
      return !f.hasPaidTier;
    case 'stripe':
      // Canonical only when the live charges_enabled check wrote it (connectReconcile). A
      // Connect id that exists but cannot take charges is still an open gap.
      return !f.milestones.stripe_connected;
    case 'first_paid':
      // Written by the paid-checkout webhook and derived from a subscription EARNING, so a free
      // join never closes it.
      return !f.milestones.first_subscriber;
  }
}

/**
 * The ONE gap the artist is stuck on, or null. Null before the setup wizard is finished (the
 * wizard and the onboarding reminder own that stretch) and once the first paid fan exists.
 */
export function currentActivationGap(f: ArtistEmailFacts): ActivationGap | null {
  if (!f.milestones.onboarding_completed) return null;
  for (const def of ACTIVATION_GAPS) {
    if (gapIsOpen(def.gap, f)) return def.gap;
  }
  return null;
}

function latestTimestamp(milestones: Record<string, string>, keys: string[]): Date | null {
  let latest: number | null = null;
  for (const k of keys) {
    const t = milestones[k] ? new Date(milestones[k]).getTime() : NaN;
    if (Number.isNaN(t)) continue;
    latest = latest === null ? t : Math.max(latest, t);
  }
  return latest === null ? null : new Date(latest);
}

/**
 * Should the nudge cron enroll this artist in this gap's sequence today? Only when it is the
 * CURRENT gap and has been current for at least `stallDays` (measured from the latest milestone
 * that made it current) and no longer than the freshness window.
 */
export function shouldEnrollForGap(def: ActivationGapDef, f: ArtistEmailFacts, now: Date): boolean {
  if (currentActivationGap(f) !== def.gap) return false;
  const anchor = latestTimestamp(f.milestones, def.anchorMilestones);
  if (!anchor) return false;
  const days = (now.getTime() - anchor.getTime()) / 86_400_000;
  return days >= def.stallDays && days <= MAX_STALL_WINDOW_DAYS;
}

/** Plan upsell gate: on Launch, and REAL trailing GMV at or above the Pro break-even. */
export function upgradeNudgeEligible(f: ArtistEmailFacts, proBreakEvenCents: number): boolean {
  if ((f.platformTier ?? 'starter') !== 'starter') return false;
  if (f.gmv30dCents === null) return false;
  return f.gmv30dCents >= proBreakEvenCents;
}

export type SendDecision =
  | { action: 'send' }
  /** The gap closed: the sequence did its job (or no longer applies). Never sends again. */
  | { action: 'complete'; reason: string }
  /** Not the artist's situation right now. Cancelled, so it can be enrolled again later. */
  | { action: 'cancel'; reason: string };

const GAP_BY_TRIGGER: Record<string, ActivationGap> = {
  ...Object.fromEntries(ACTIVATION_GAPS.map((d) => [d.triggerType, d.gap])),
  // "Connect Stripe to get paid" x3: the same gap as activation_no_stripe, so the same rule.
  onboarding_incomplete: 'stripe',
};

/**
 * Re-decided for EVERY step at send time. Triggers this module does not know about send
 * unchanged: the gate narrows what it understands and never silences what it does not.
 */
export function decideLifecycleSend(
  triggerType: string,
  f: ArtistEmailFacts,
  proBreakEvenCents: number,
): SendDecision {
  const gap = GAP_BY_TRIGGER[triggerType];
  if (gap) {
    if (!gapIsOpen(gap, f)) return { action: 'complete', reason: 'gap_closed' };
    if (currentActivationGap(f) !== gap) return { action: 'cancel', reason: 'not_current_gap' };
    return { action: 'send' };
  }
  if (triggerType === 'starter_upgrade_nudge') {
    if ((f.platformTier ?? 'starter') !== 'starter') return { action: 'complete', reason: 'already_upgraded' };
    if (!upgradeNudgeEligible(f, proBreakEvenCents)) return { action: 'cancel', reason: 'below_pro_break_even' };
    return { action: 'send' };
  }
  if (triggerType === 'upgrade_abandoned') {
    if ((f.platformTier ?? 'starter') !== 'starter') return { action: 'complete', reason: 'already_upgraded' };
    return { action: 'send' };
  }
  return { action: 'send' };
}

/**
 * Send order inside one cron run, and the cap that makes it matter: at most ONE platform
 * lifecycle email per artist per run. Lower sorts first. Activation gaps lead because they block
 * every dollar; a deferred email is simply picked up on a later run.
 */
export function lifecyclePriority(triggerType: string): number {
  const i = ACTIVATION_GAPS.findIndex((d) => d.triggerType === triggerType);
  if (i >= 0) return i;
  if (triggerType === 'onboarding_incomplete') return 2;
  if (triggerType === 'paid_at_risk' || triggerType === 'paid_churned') return 10;
  return 20;
}
