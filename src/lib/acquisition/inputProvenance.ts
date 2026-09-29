// "Did this artist actually tell us this?" for every calculator input on a DM result.
//
// Pure. The calculator row (`lead_magnet_results.input_data`) used to hold bare values: the two
// answers a DM lead typed, the defaults CRWN filled for the optional fields, and later edits, all
// indistinguishable. Found 2026-09-29 on a real lead: the result page's debounced auto-save fired
// on FIRST RENDER, so merely opening a result wrote `social_followers: 0` and
// `streaming_revenue_cents: 0` into input_data, stamped `recalculated_at`, and earned the scorer's
// "engaged_with_result" points. The artist had typed nothing.
//
// Two things live here:
//   1. `_provenance`: a per-field label stored INSIDE input_data (same underscore convention as
//      `_attribution`), written at generation and on every real edit.
//   2. `inputsChanged`: the ONE definition of "a recalculation changed something", read by the
//      recalculate route (to no-op an unchanged save) and by the scorer's behavior reader (so a
//      historical phantom recalculation stops counting, with no production rewrite).
//
// A row written before this existed has no `_provenance`; every field on it reads `unknown`,
// never user_explicit. Failing safe means under-claiming.

import type { FieldSource } from './types';

export type InputProvenance =
  | 'user_explicit'
  | 'system_default'
  | 'system_assumption'
  | 'derived'
  | 'enriched_verified'
  | 'founder_verified'
  | 'unknown';

export const PROVENANCE_KEY = '_provenance';

/** The calculator inputs the recalculate form can change (worth). Absent reads as 0. */
export const RECALC_FIELDS = ['monthly_listeners', 'social_followers', 'streaming_revenue_cents'] as const;

/**
 * The lead profile's field source -> what we may say about it.
 * `deterministic` is the artist's own DM words through the alias rules: they told us, CRWN
 * normalized it. `claude_extraction` is an inference from their words, not a statement.
 */
export function fromFieldSource(source: FieldSource | string | null | undefined): InputProvenance {
  switch (source) {
    case 'direct_answer':
    case 'deterministic':
      return 'user_explicit';
    case 'claude_extraction':
      return 'derived';
    case 'verified_crwn':
    case 'verified_contact':
      return 'enriched_verified';
    default:
      return 'unknown';
  }
}

/** Provenance for a freshly generated result, from the lead profile's own field provenance. */
export function generationProvenance(
  profile: Record<string, unknown>,
  fieldProvenance: Record<string, { source?: string } | undefined>,
): Record<string, InputProvenance> {
  const out: Record<string, InputProvenance> = {};
  for (const [k, v] of Object.entries(profile)) {
    if (k.startsWith('_') || v === null || v === undefined) continue;
    out[k] = fromFieldSource(fieldProvenance[k]?.source);
  }
  return out;
}

/** The stored map, or null for a row written before provenance existed. */
export function readProvenance(inputData: unknown): Record<string, InputProvenance> | null {
  const p = (inputData as Record<string, unknown> | null)?.[PROVENANCE_KEY];
  return p && typeof p === 'object' ? (p as Record<string, InputProvenance>) : null;
}

/** What we may say about one field. A pre-provenance row is `unknown` for every field. */
export function provenanceOf(inputData: unknown, field: string): InputProvenance {
  return readProvenance(inputData)?.[field] ?? 'unknown';
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Did the modeled numbers actually change between two snapshots? Absent reads as 0. */
export function inputsChanged(before: unknown, after: unknown): boolean {
  const a = (before ?? {}) as Record<string, unknown>;
  const b = (after ?? {}) as Record<string, unknown>;
  return RECALC_FIELDS.some((f) => num(a[f]) !== num(b[f]));
}

/**
 * Provenance after a real edit. A field whose value moved was typed by the artist. An unchanged
 * field keeps its label. A field that was absent and is now the form's empty 0 is a default.
 */
export function recalcProvenance(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, InputProvenance> {
  const prev = readProvenance(before) ?? {};
  const out: Record<string, InputProvenance> = { ...prev };
  for (const f of RECALC_FIELDS) {
    const had = before[f] !== undefined && before[f] !== null;
    if (num(before[f]) !== num(after[f])) out[f] = 'user_explicit';
    else if (!had) out[f] = 'system_default';
    else out[f] = prev[f] ?? 'unknown';
  }
  return out;
}
