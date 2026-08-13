// riseNextMove.ts — the ONE next move Rise Mode shows, and the light context around it.
//
// WHAT THIS IS NOT: a second priority engine. Every judgement about what matters most has
// already been made, server-side, by the Constraint Engine (`src/lib/constraint/engine.ts`)
// and the Roadmap (`src/lib/artistRoadmap.ts` + the Quest Engine's DomainChecks).
// `resolveOperatingFlow` already reads back WHICH of those two owns the primary action. This
// module adds no ranking of its own: it takes that answer plus the two payloads and flattens
// them into the handful of strings one card needs, so the component holds no business rule.
//
// The founder rule it encodes, and where the rule actually lives:
//   An overdue promise owed to supporters who already paid outranks a normal roadmap milestone.
// That precedence is NOT implemented here. It is Stage 1 of `readConstraint`, which evaluates
// FULFILLMENT before reach, capture, first-paid, depth and everything else, and it fires at
// n = 1 because the harm is happening now rather than being inferred from a sample. When it
// fires, the constraint owns the primary action and the roadmap milestone becomes the quiet
// "After this" line. Re-deriving the override here would be exactly the duplicate business
// rule this pass exists to remove; the test in riseNextMove.test.ts asserts it end to end
// through the real engine instead.
//
// Deliberately absent from the returned shape, because the artist does not act on any of it:
// XP, level, artist build, streaks, the membership strategy explanation, member/revenue stat
// tiles, the upcoming-promise list and the whole-roadmap percentage. Every one of those
// systems still runs; none of them is a next move.

import type { ArtistRoadmap, RoadmapStep } from './artistRoadmap';
import type { OperatingFlow, OperatingPhase } from './constraint/presentation';
import { withReturnTo } from './constraint/presentation';

/** The single action. One title, one reason, at most one fact, one destination. */
export interface RiseMove {
  /** Which canonical system produced it. For tests and telemetry, never rendered as a label. */
  owner: 'constraint' | 'roadmap';
  /** What to do, phrased as the action itself. */
  title: string;
  /** Why this move, in one sentence. Loss-framed where the source copy is. */
  reason: string;
  /**
   * The supporting fact, stated ONCE. The constraint's own `title` is deliberately dropped:
   * it is a summary of this same fact ("2 promises are past due" over "2 promises to your
   * supporters are past due"), and printing both is the redundancy this pass removes.
   */
  fact: string | null;
  /** Where the artist does it. Already carries the returnTo back to Rise Mode. */
  href: string;
  ctaLabel: string;
}

export interface RiseNextMove {
  phase: OperatingPhase;
  /** "Foundation". Null until the roadmap has loaded. */
  stageTitle: string | null;
  /** "2 of 7 complete". Discrete milestones, never a percentage: 68% is decoration. */
  stageProgress: string | null;
  /** The one dominant action, or null when everything is done (or nothing has loaded). */
  move: RiseMove | null;
  /** The label of the move after this one. A line, never a second CTA. */
  afterThis: string | null;
  /** One sentence naming why growth advice is withheld, when the artist cannot take money. */
  launchNote: string | null;
  /** True when the roadmap loaded and every step of every stage is done. */
  allComplete: boolean;
}

const EMPTY: RiseNextMove = {
  phase: 'unknown',
  stageTitle: null,
  stageProgress: null,
  move: null,
  afterThis: null,
  launchNote: null,
  allComplete: false,
};

/** "a, b and c" — one sentence, never a bulleted list competing with the action. */
function joinPlain(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** A roadmap step as a move. `detail` is already the one-sentence reason, loss-framed. */
function roadmapMove(step: RoadmapStep): RiseMove {
  return {
    owner: 'roadmap',
    title: step.label,
    reason: step.detail,
    fact: step.target > 1 ? `${Math.min(step.current, step.target)} of ${step.target} so far.` : null,
    href: withReturnTo(step.href),
    ctaLabel: 'Do it now',
  };
}

export function resolveRiseNextMove(
  flow: OperatingFlow,
  roadmap: ArtistRoadmap | null | undefined,
): RiseNextMove {
  const stage = roadmap ? roadmap.stages[roadmap.currentStageIndex] : null;
  const openSteps = roadmap ? roadmap.stages.flatMap((s) => s.steps).filter((s) => !s.done) : [];

  const base: RiseNextMove = {
    ...EMPTY,
    phase: flow.phase,
    stageTitle: stage?.title ?? null,
    stageProgress: stage ? `${stage.doneCount} of ${stage.total} complete` : null,
    launchNote:
      flow.phase === 'launch' && flow.launchBlockers.length > 0
        ? `Growth advice is on hold until your page can take money. Still missing: ${joinPlain(flow.launchBlockers)}.`
        : null,
    allComplete: Boolean(roadmap) && openSteps.length === 0,
  };

  // The constraint won. Its action IS the move; the roadmap step becomes "After this".
  if (flow.primary === 'constraint' && flow.constraint) {
    const c = flow.constraint;
    return {
      ...base,
      move: {
        owner: 'constraint',
        title: c.action.label,
        reason: c.action.why,
        fact: c.evidence[0]?.label ?? null,
        href: withReturnTo(c.action.href),
        ctaLabel: 'Do it now',
      },
      afterThis: openSteps[0]?.label ?? null,
    };
  }

  // The roadmap owns it: its next step leads, and the step after that is the preview.
  const next = roadmap?.nextStep ?? null;
  if (!next) return base;
  return {
    ...base,
    move: roadmapMove(next),
    afterThis: openSteps.find((s) => s.key !== next.key)?.label ?? null,
  };
}
