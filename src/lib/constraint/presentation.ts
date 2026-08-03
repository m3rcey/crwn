// presentation.ts — the pure decision about WHICH next action an artist sees.
//
// This exists as a pure function rather than as branching inside the component for one
// practical reason: the repo's test harness is node-only with no jsdom (vitest.config.ts says
// so deliberately), so a component test cannot assert "the roadmap still renders when evidence
// is insufficient". Extracting the decision makes the rule testable and keeps the component
// down to rendering whatever it is handed.
//
// The precedence, and the reason for each rung:
//   1. No constraint diagnosed, or not enough evidence  -> the ROADMAP step, exactly as today.
//   2. A diagnosed constraint                           -> the constraint action, ABOVE the
//                                                          roadmap, which keeps rendering.
//
// The constraint never REPLACES the roadmap and never mutates it. It is a lens over the same
// account, so when the constraint clears, the next read simply stops showing it and the
// roadmap is already there, unchanged, having never been marked complete by anything here.

import type { ConstraintResult, DiagnosedConstraint } from './types';

export interface NextActionDecision {
  /** Render the constraint card above the roadmap. */
  showConstraintCard: boolean;
  /** The diagnosis to render, when there is one. */
  constraint: DiagnosedConstraint | null;
  /**
   * Always true. The roadmap is never hidden: it is the artist's map of where they are, and a
   * corrective action is an interruption to it, not a replacement for it.
   */
  showRoadmap: true;
  /** Why this decision, for logs and tests. Never rendered. */
  reason: 'diagnosed' | 'insufficient_evidence' | 'no_result' | 'error';
}

/**
 * Decide what the artist's command area shows.
 *
 * `result` is null while the fetch is in flight or after it failed. Both cases fall back to
 * today's experience rather than blanking the screen: a loading or broken constraint engine
 * must never cost the artist the roadmap they already had.
 */
export function decideNextAction(result: ConstraintResult | null | undefined): NextActionDecision {
  if (!result) {
    return { showConstraintCard: false, constraint: null, showRoadmap: true, reason: 'no_result' };
  }
  if (result.status === 'diagnosed') {
    return { showConstraintCard: true, constraint: result, showRoadmap: true, reason: 'diagnosed' };
  }
  return {
    showConstraintCard: false,
    constraint: null,
    showRoadmap: true,
    reason: 'insufficient_evidence',
  };
}

/** Human label for a confidence level, for the card's footnote. */
export function confidenceLabel(c: DiagnosedConstraint['confidence']): string {
  switch (c) {
    case 'high':
      return 'Strong evidence';
    case 'medium':
      return 'Enough evidence to act on';
    case 'low':
    default:
      return 'Early signal';
  }
}
