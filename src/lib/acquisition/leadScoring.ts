// Deterministic lead scoring.
//
// The score is CRWN's, not Claude's. Claude contributes a bounded signal (0-20 of 100) and
// nothing more. Everything else is arithmetic on facts the artist told us.
//
// Requirement from the brief: "A score must be explainable from stored components." So every
// component is named, every point is attributable, and the whole thing is persisted to
// lead_score_history. If Josh asks "why is this lead an 82", the answer is a table, not a
// shrug.
//
// The thresholds below are NEW. The repo's existing platform-CRM score (computeLeadScore in
// /api/cron/platform-crm) scores POST-signup artists on product usage; it has no notion of a
// pre-signup Instagram lead, so it cannot be reused here. These numbers are deliberately
// conservative starting points and are meant to be tuned once real leads exist. They live
// here, in one place, on purpose.

import type { LeadProfileValues } from './toolAdapters';
import type { LeadScore, ScoreBand } from './types';

export const SCORE_VERSION = '1.0.0';

/** Behavior we observed, as opposed to what the artist told us. Actions beat claims. */
export interface ScoreBehavior {
  resultViewed: boolean;
  resultRecalculated: boolean;
  accountClaimed: boolean;
  setupStarted: boolean;
  setupCompleted: boolean;
  leadMagnetsCompleted: number;
  returnVisit: boolean;
  bookedCall: boolean;
}

export const EMPTY_BEHAVIOR: ScoreBehavior = {
  resultViewed: false,
  resultRecalculated: false,
  accountClaimed: false,
  setupStarted: false,
  setupCompleted: false,
  leadMagnetsCompleted: 0,
  returnVisit: false,
  bookedCall: false,
};

export interface ScoreInput {
  profile: LeadProfileValues;
  behavior: ScoreBehavior;
  /** Claude's advisory signal, already clamped to 0..20 by decisionSchema. */
  claudeSignal?: number | null;
}

export function scoreLead(input: ScoreInput): LeadScore {
  const p = input.profile;
  const b = input.behavior;
  const components: Record<string, number> = {};
  const reasons: string[] = [];

  // ---- Audience (max 20) ----
  // Reach matters, but it is the WEAKEST predictor here, which is the whole CRWN thesis: a
  // big audience that will not pay is worth less than a small one that will. Capped low on
  // purpose so a viral artist with no fan relationship cannot score high on reach alone.
  const listeners = num(p.monthly_listeners);
  components.audience = listeners >= 100_000 ? 20 : listeners >= 25_000 ? 15 : listeners >= 5_000 ? 10 : listeners > 0 ? 5 : 0;
  if (components.audience >= 15) reasons.push('sizeable_audience');

  // ---- Fan ownership (max 20) ----
  // An email list is the single best signal that an artist already understands the problem
  // CRWN solves. This is weighted equal to audience despite being a much smaller number.
  const list = num(p.email_list_size);
  components.fanOwnership = list >= 1_000 ? 20 : list >= 250 ? 14 : list >= 50 ? 8 : list > 0 ? 4 : 0;
  if (list === 0 && listeners > 10_000) reasons.push('reach_without_ownership'); // the ideal CRWN lead

  // ---- Catalog depth (max 10) ----
  const catalog = num(p.catalog_size);
  components.catalog = catalog >= 20 ? 10 : catalog >= 5 ? 6 : catalog > 0 ? 3 : 0;

  // ---- Existing direct revenue (max 15) ----
  // Already earning direct == already sold on the model == easier to convert.
  const revenue = num(p.direct_fan_revenue_cents);
  components.revenue = revenue >= 100_000 ? 15 : revenue >= 20_000 ? 10 : revenue > 0 ? 5 : 0;
  if (revenue > 0) reasons.push('already_monetizing_direct');

  // ---- Goal + blocker alignment (max 15) ----
  // Does what they want match what CRWN actually does? A lead whose blocker is "no audience"
  // is NOT a good CRWN lead: we do not manufacture audiences, and pretending otherwise sells
  // them something that will not work.
  const goodGoal = ['make_first_dollar', 'own_my_fanbase', 'scale_existing_revenue', 'replace_day_job'].includes(
    str(p.primary_goal),
  );
  const goodBlocker = ['audience_wont_pay', 'no_product', 'platform_dependency', 'pricing_uncertainty'].includes(
    str(p.primary_blocker),
  );
  const badBlocker = str(p.primary_blocker) === 'no_audience';
  components.alignment = (goodGoal ? 8 : 0) + (goodBlocker ? 7 : 0);
  if (badBlocker) {
    components.alignment = Math.max(0, components.alignment - 10);
    reasons.push('blocker_is_audience_not_monetization');
  }
  if (goodGoal && goodBlocker) reasons.push('strong_fit');

  // ---- Behavior (max 20) ----
  // The heaviest single bucket that is not about who they are. What someone DID is worth
  // more than what they said, every time.
  let behavior = 0;
  if (b.resultViewed) behavior += 4;
  if (b.resultRecalculated) behavior += 4; // they engaged with the model, not just glanced
  if (b.accountClaimed) behavior += 5;
  if (b.setupStarted) behavior += 3;
  if (b.setupCompleted) behavior += 4;
  if (b.leadMagnetsCompleted > 1) behavior += 2;
  if (b.returnVisit) behavior += 2;
  components.behavior = Math.min(behavior, 20);
  if (b.resultRecalculated) reasons.push('engaged_with_result');
  if (b.setupCompleted) reasons.push('completed_setup');

  // ---- Claude's advisory signal (max 20, but scaled down) ----
  // Bounded AND scaled: even a perfect 20 from Claude only moves the score by 10. The model
  // gets a vote, not a veto.
  const signal = Math.min(Math.max(num(input.claudeSignal), 0), 20);
  components.aiSignal = Math.round(signal / 2);

  const raw = Object.values(components).reduce((s, v) => s + v, 0);
  const total = Math.min(Math.max(Math.round(raw), 0), 100);

  // Booking a call is a hard override. Someone who put time on the calendar is a sales lead
  // regardless of what the arithmetic says about their follower count.
  const band: ScoreBand = b.bookedCall ? 'sales_priority' : bandFor(total, badBlocker);
  if (b.bookedCall) reasons.push('booked_call');

  return { total, version: SCORE_VERSION, band, components, reasonCodes: reasons };
}

/**
 * Bands. Conservative by design: it is cheaper to nurture someone who was ready than to
 * hard-sell someone who was not.
 */
function bandFor(total: number, blockerIsAudience: boolean): ScoreBand {
  // Not a CRWN problem yet. Nurture honestly rather than sell them a monetization tool for
  // an audience problem.
  if (blockerIsAudience && total < 60) return 'nurture';
  if (total >= 75) return 'sales_priority';
  if (total >= 50) return 'self_serve';
  if (total >= 25) return 'nurture';
  return 'unqualified';
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
