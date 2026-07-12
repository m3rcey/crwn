// The deterministic conversation state machine.
//
// This is the authority. Claude's `intent` is a SUGGESTION that gets checked against
// TRANSITIONS; if the suggested move is not legal from where we actually are, it is
// discarded and the machine picks the next legal move itself.
//
// Everything here is a pure function of (state, event, facts). No I/O, no DB, no network.
// That is what makes it testable, retry-safe, and resumable: replaying the same event from
// the same committed state always lands in the same place.

import type { LeadSessionState, LeadSessionStatus } from './types';

/**
 * Legal transitions. An edge that isn't listed does not exist.
 *
 * The shape encodes the real journey: you cannot send a result you have not generated, you
 * cannot claim an account before a result exists to claim, and you cannot un-abandon into
 * the middle of a question flow (a returning lead resumes at a state we choose deliberately,
 * via `resume()`, not by an arbitrary edge).
 */
export const TRANSITIONS: Record<LeadSessionState, LeadSessionState[]> = {
  initiated: ['awaiting_opt_in', 'collecting_identity', 'collecting_required_metrics', 'abandoned', 'failed', 'human_review'],
  awaiting_opt_in: ['collecting_identity', 'collecting_required_metrics', 'nurture', 'abandoned', 'failed'],
  collecting_identity: ['collecting_required_metrics', 'collecting_goal', 'abandoned', 'failed', 'human_review'],
  collecting_required_metrics: ['collecting_required_metrics', 'collecting_goal', 'collecting_blocker', 'ready_for_result', 'abandoned', 'failed', 'human_review'],
  collecting_goal: ['collecting_blocker', 'collecting_required_metrics', 'ready_for_result', 'abandoned', 'failed', 'human_review'],
  collecting_blocker: ['ready_for_result', 'collecting_required_metrics', 'abandoned', 'failed', 'human_review'],
  ready_for_result: ['result_generating', 'abandoned', 'failed', 'human_review'],
  // Note there is no edge back to ready_for_result. Once generation starts, a retry
  // re-enters result_generating (idempotent) rather than looping through ready, which is
  // what stops a duplicate webhook from minting a second result.
  result_generating: ['result_generated', 'result_generating', 'failed', 'human_review'],
  result_generated: ['result_sent', 'result_viewed', 'nurture', 'abandoned', 'failed'],
  result_sent: ['result_viewed', 'nurture', 'abandoned', 'account_claim_started'],
  result_viewed: ['account_claim_started', 'nurture', 'booked_call', 'abandoned', 'purchased'],
  account_claim_started: ['account_claimed', 'result_viewed', 'nurture', 'abandoned', 'failed'],
  account_claimed: ['onboarding_started', 'rise_mode_started', 'purchased', 'booked_call', 'nurture'],
  onboarding_started: ['rise_mode_started', 'purchased', 'booked_call', 'nurture', 'abandoned'],
  rise_mode_started: ['purchased', 'booked_call', 'nurture'],
  booked_call: ['purchased', 'nurture'],
  purchased: [],
  // Nurture is a holding pen, not a dead end: a lead who comes back re-enters the flow.
  nurture: ['collecting_required_metrics', 'ready_for_result', 'result_viewed', 'account_claim_started', 'booked_call', 'purchased', 'abandoned'],
  abandoned: ['collecting_required_metrics', 'ready_for_result', 'result_viewed', 'account_claim_started', 'nurture'],
  failed: ['collecting_required_metrics', 'ready_for_result', 'human_review', 'abandoned'],
  human_review: ['collecting_required_metrics', 'ready_for_result', 'nurture', 'abandoned', 'failed'],
};

/** Terminal for the purposes of the daily abandonment sweep. */
export const CLOSED_STATES: LeadSessionState[] = ['purchased', 'abandoned'];

const STATUS_BY_STATE: Partial<Record<LeadSessionState, LeadSessionStatus>> = {
  purchased: 'completed',
  account_claimed: 'open', // still open: onboarding + Rise are still ahead
  abandoned: 'abandoned',
  failed: 'failed',
};

export function canTransition(from: LeadSessionState, to: LeadSessionState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TransitionResult {
  ok: boolean;
  state: LeadSessionState;
  status: LeadSessionStatus;
  reasonCode: string;
  /** True when the requested move was illegal and we stayed put. */
  rejected: boolean;
}

/**
 * Attempt a transition. An illegal move is REJECTED, never forced.
 *
 * Rejecting rather than throwing is deliberate: a webhook retry that arrives after the
 * session has already advanced should be a harmless no-op returning the current state, not
 * a 500 that makes ManyChat retry forever.
 */
export function transition(
  from: LeadSessionState,
  to: LeadSessionState,
  reasonCode: string,
): TransitionResult {
  if (from === to) {
    return { ok: true, state: from, status: statusFor(from), reasonCode: `${reasonCode}:noop`, rejected: false };
  }
  if (!canTransition(from, to)) {
    return {
      ok: false,
      state: from,
      status: statusFor(from),
      reasonCode: `illegal_transition:${from}->${to}`,
      rejected: true,
    };
  }
  return { ok: true, state: to, status: statusFor(to), reasonCode, rejected: false };
}

export function statusFor(state: LeadSessionState): LeadSessionStatus {
  return STATUS_BY_STATE[state] ?? 'open';
}

// ---------------------------------------------------------------------------
// The deterministic "what next" decision
// ---------------------------------------------------------------------------

export interface MachineFacts {
  /** Registry-declared required fields for the selected tool that we still do not have. */
  missingRequiredFields: string[];
  hasConsent: boolean;
  hasResult: boolean;
  hasVerifiedEmail: boolean;
  isClaimed: boolean;
  /** Set when a hard failure needs a human. */
  needsHumanReview: boolean;
}

/**
 * Where the machine says we should be, given the facts. Independent of Claude entirely.
 *
 * orchestration.ts calls this BEFORE it calls Claude and AFTER it applies Claude's fields.
 * The second call is the one that counts: whatever Claude claimed, the state we commit is
 * the one this function derives from what we actually now know.
 */
export function nextState(current: LeadSessionState, facts: MachineFacts): LeadSessionState {
  if (facts.needsHumanReview) return 'human_review';

  // Consent gates everything. No opt-in, no questions.
  if (!facts.hasConsent && (current === 'initiated' || current === 'awaiting_opt_in')) {
    return 'awaiting_opt_in';
  }

  if (facts.hasResult) {
    // Past the result, the machine follows the artist, not the clock.
    if (facts.isClaimed) return current === 'account_claimed' ? 'account_claimed' : current;
    return current;
  }

  if (facts.missingRequiredFields.length > 0) {
    const next = facts.missingRequiredFields[0];
    if (next === 'primary_goal') return 'collecting_goal';
    if (next === 'primary_blocker') return 'collecting_blocker';
    if (next === 'artist_name' || next === 'genre') return 'collecting_identity';
    return 'collecting_required_metrics';
  }

  return 'ready_for_result';
}

/**
 * How a returning lead re-enters. We never resurrect them into a half-finished question;
 * we put them where their DATA says they belong.
 */
export function resume(current: LeadSessionState, facts: MachineFacts): LeadSessionState {
  if (current === 'purchased') return 'purchased';
  if (facts.hasResult && !facts.isClaimed) return 'result_viewed';
  if (facts.hasResult && facts.isClaimed) return 'account_claimed';
  return nextState(CLOSED_STATES.includes(current) ? 'nurture' : current, facts);
}

/** Sessions idle longer than this get swept to `abandoned` by the daily dispatcher. */
export const ABANDON_AFTER_HOURS = 48;
