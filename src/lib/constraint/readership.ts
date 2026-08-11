// readership.ts — how surfaces OTHER than the constraint card consume the canonical diagnosis.
//
// PURE. No database, no network, no AI. It adds no opinion of its own: every ordering fact here is
// read back off `CONSTRAINT_TYPES`, which is already declared in the engine's own evaluation order.
// There is no second threshold system, no second constraint reader, and nothing here is persisted.
//
// THE CONTRACT (Z4)
// -----------------
//   one fact -> one owner -> many readers
//
// `readConstraint` owns the answer to "what is limiting this artist, and what is the one next
// move". Everything else READS it. A reader may re-word it (a manager coaches, a mission instructs,
// a card states) but may never re-rank it, and may never manufacture a priority when the engine
// declined to give one.
//
// WHAT A READER MAY NOT DO
//  - Issue a Z3 recommendation record. Only `/api/artist/constraint` issues, so a diagnosis shown
//    on five surfaces is still ONE logical recommendation with one durable identity.
//  - Turn `insufficient_evidence` into generic advice so its UI has something confident to say.
//    Silence is a real answer and the strategy explicitly values refusing when data is thin.
//  - Complete a quest, mark a roadmap step, or touch product state.

import { CONSTRAINT_TYPES, type ConstraintResult, type ConstraintType, isDiagnosed } from './types';

/**
 * Priority rank, lower is more urgent. Derived from the ORDER OF `CONSTRAINT_TYPES`, which is the
 * engine's evaluation order, so this cannot drift from the engine: reordering there reorders here.
 */
export function constraintRank(type: ConstraintType): number {
  return CONSTRAINT_TYPES.indexOf(type);
}

/**
 * Does this constraint protect revenue the artist has ALREADY been paid?
 *
 * Fulfillment and retention are evaluated before the acquisition funnel for a stated reason (see
 * engine.ts): a broken promise and a cancelling member are costing money that is already earned,
 * while acquisition chases money that is not. That is why a growth recommendation must never be
 * presented as the priority while one of these is diagnosed.
 */
export function protectsEarnedRevenue(type: ConstraintType): boolean {
  return type === 'FULFILLMENT' || type === 'RETENTION';
}

/** True when `a` should be acted on before `b`. Ties are not possible: ranks are unique. */
export function outranks(a: ConstraintType, b: ConstraintType): boolean {
  return constraintRank(a) < constraintRank(b);
}

/**
 * The canonical diagnosis rendered as authoritative context for a COACHING surface (today: the AI
 * Manager's prompt). Returns null when the engine did not diagnose, and null is the point: a reader
 * handed null must fall back to its existing behavior rather than inventing a priority.
 *
 * Deliberately plain text. It is injected into a model prompt, so it states the ranking as an
 * instruction the model cannot reasonably read as advisory, and names the evidence so the surface
 * can explain the WHY rather than merely repeat the WHAT.
 */
export function canonicalPriorityBrief(result: ConstraintResult | null | undefined): string | null {
  if (!result || !isDiagnosed(result)) return null;

  const lines: string[] = [];
  lines.push('=== CRWN CANONICAL DIAGNOSIS (authoritative, overrides your own ranking) ===');
  lines.push(`Constraint: ${result.constraint}`);
  lines.push(`CRWN says: ${result.title}`);
  lines.push(`Evidence: ${result.evidence.map((e) => e.label).join(' ')}`);
  lines.push(`The one next move CRWN already told this artist: "${result.action.label}"`);

  if (protectsEarnedRevenue(result.constraint)) {
    lines.push(
      'This constraint protects money the artist has ALREADY been paid. Do NOT recommend acquisition, ' +
        'growth, pricing or campaign actions as the priority while it stands: recruiting more fans into ' +
        'a system that is failing the fans already inside it makes the leak bigger. Your actions must ' +
        'serve this constraint, or be a smaller step that clearly does not compete with it.',
    );
  } else {
    lines.push(
      'Your actions must serve this constraint. Do not substitute a different problem you find more ' +
        'interesting in the data.',
    );
  }

  lines.push(
    'Restate this same priority in your own words in the diagnosis field. Different wording is fine. ' +
      'A different priority is not.',
  );
  return lines.join('\n');
}
