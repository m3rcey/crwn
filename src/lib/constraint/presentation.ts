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

// ---------------------------------------------------------------------------
// The operating phase: which surface owns the ONE primary call to action
// ---------------------------------------------------------------------------

/**
 * THE PROBLEM THIS SOLVES, measured before it was written.
 *
 * The artist home stacked three cards that each rendered a gold primary button, two of them
 * labelled literally "Do it now", pointing at different destinations. The Constraint Engine had
 * already decided what mattered most, and the interface then asked the artist to decide again.
 * That is CRWN's internal architecture leaking into the product: the artist had to know which
 * subsystem to believe.
 *
 * THIS IS NOT A NEW PRIORITY ENGINE. It adds no opinion, reads no database, and stores nothing.
 * Every input is already in the `ConstraintResult` the engine returns; this function only reads
 * back which canonical owner should hold the primary CTA, so exactly one card renders one.
 *
 *   launch   -> the artist cannot take money yet. The ROADMAP owns launch readiness, so it owns
 *               the primary action, and no growth advice is presented as the priority.
 *   priority -> a constraint is diagnosed. The CONSTRAINT owns the primary action.
 *   steady   -> nothing is blocking. The roadmap's next milestone leads, quietly. CRWN does not
 *               manufacture a priority to have something to say.
 *   unknown  -> the read failed or is in flight. Behave exactly as before: roadmap leads.
 */
export type OperatingPhase = 'launch' | 'priority' | 'steady' | 'unknown';

/** Which canonical owner renders the single gold CTA. */
export type PrimarySurface = 'constraint' | 'roadmap';

export interface OperatingFlow {
  phase: OperatingPhase;
  primary: PrimarySurface;
  constraint: DiagnosedConstraint | null;
  /**
   * When launch-gated, the engine's own list of what is missing. Rendered so the artist is told
   * WHY growth advice is being withheld rather than simply not seeing any.
   */
  launchBlockers: string[];
}

/**
 * The engine returns `insufficient_evidence` for two very different reasons, and the difference
 * decides the whole screen. Stage 0 refuses because the artist has not finished launching and
 * names the missing pieces; the final return refuses because nothing is blocking them and names
 * nothing. Treating those identically is what let a half-launched artist be shown growth cards.
 */
function isLaunchGated(result: ConstraintResult): boolean {
  return result.status === 'insufficient_evidence' && result.missingEvidence.length > 0;
}

export function resolveOperatingFlow(
  result: ConstraintResult | null | undefined,
): OperatingFlow {
  if (!result) {
    return { phase: 'unknown', primary: 'roadmap', constraint: null, launchBlockers: [] };
  }
  if (result.status === 'diagnosed') {
    return { phase: 'priority', primary: 'constraint', constraint: result, launchBlockers: [] };
  }
  if (isLaunchGated(result)) {
    return {
      phase: 'launch',
      primary: 'roadmap',
      constraint: null,
      launchBlockers: result.missingEvidence,
    };
  }
  return { phase: 'steady', primary: 'roadmap', constraint: null, launchBlockers: [] };
}

/**
 * Send the artist back where they came from.
 *
 * CLAUDE.md's rule is that a flow launched from Rise Mode returns to Rise Mode. The constraint and
 * roadmap CTAs did not carry `?returnTo`, so acting on the one thing CRWN told you to do left you
 * stranded in Studio deciding what to do next, which is the same coordination problem one screen
 * later.
 *
 * Only a same-site path is ever appended, and an existing query string is preserved. An absolute
 * URL or a protocol-relative one is left alone rather than being turned into an open redirect.
 */
export function withReturnTo(href: string, returnTo = '/profile/artist'): string {
  if (!href || !href.startsWith('/') || href.startsWith('//')) return href;
  // Never stack a second returnTo onto a destination that already declares one.
  if (/[?&]returnTo=/.test(href)) return href;
  return `${href}${href.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent(returnTo)}`;
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
