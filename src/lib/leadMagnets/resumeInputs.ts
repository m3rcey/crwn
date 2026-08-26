// Restoring a saved result's ANSWERS, not just its number.
//
// `/tools/<slug>?result=<token>` is the emailed copy link and the nurture "Reopen my result"
// link. It resumed the RESULT and dropped the answers on the floor, which quietly broke three
// things on every one of those arrivals:
//
//   1. "These are your numbers. Change an answer and recalculate." is hidden when there are no
//      answers to change, so the number became untouchable. A number you cannot touch is a
//      number you do not believe.
//   2. `CallRequestCard` posts the calculator answers, and the route refuses an empty set with
//      "Complete the calculator first". A qualified artist pressing "Get a call now" on an
//      emailed result got an error.
//   3. Re-submitting the email recomputed the stored result from nothing.
//
// The stored shape is trustworthy but not clean: `input_data` also carries reserved
// underscore-prefixed keys (`_attribution`, `_entryContext`) that are reporting truth and must
// never reach a wizard, and a call-request row nests its answers under `calculatorInputs`.
// Filtering to the tool's DECLARED inputs is what makes this safe to hand back to the wizard.
//
// Currency needs no conversion here. The two writers that store a plaintext `public_token` (the
// capture route and the artist results route) both store WIZARD values, currency in dollars; the
// acquisition engine stores lead-profile columns with currency in cents, but its tokens live in
// `public_token_hash` and are read by `/tools/<slug>/result/<token>`, never by this path. If that
// ever changes, this is the function that has to learn the difference.

import type { LeadMagnetConfig, LeadMagnetInputValues } from './types';

/** Reserved keys stored alongside the answers. Never inputs, never restored. */
const RESERVED_PREFIX = '_';

/** Matches MAX_COUNT in acquisition/callRequest.ts. Larger than any real artist, on any metric. */
const ABSOLUTE_MAX = 100_000_000;

export function restoreWizardValues(
  config: Pick<LeadMagnetConfig, 'inputs'>,
  stored: unknown,
): LeadMagnetInputValues {
  const out: Record<string, unknown> = {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return out as LeadMagnetInputValues;
  const source = stored as Record<string, unknown>;

  for (const input of config.inputs ?? []) {
    if (input.key.startsWith(RESERVED_PREFIX)) continue;
    const v = source[input.key];
    if (v === null || v === undefined || v === '') continue;
    // Only scalars. A stored object or array is not an answer any wizard field can render, and
    // handing one to a controlled input is how a page crashes on someone else's saved row.
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    out[input.key] = v;
  }

  return out as LeadMagnetInputValues;
}

/**
 * Seed a wizard from the URL, so "answer the rest" does not mean "start over".
 *
 * A ManyChat lead answers two questions and their tokenized result page offers the full
 * calculator. Sending them to a cold wizard makes the FIRST screen a question they already
 * answered, at the exact moment friction costs the most. The answers ride in the link because
 * the alternative (resolving the result token on `/tools/<slug>`) would force that page dynamic
 * and lose the static prerender on all nineteen tool routes for a minority path. `/worth` has
 * accepted `?listeners=&followers=` this way since it shipped; this is the same pattern, made
 * general and validated against the tool's own input definitions.
 *
 * A calculator input is NOT authority: it decides a displayed estimate, never a price, a fee, an
 * entitlement or a permission, and the artist can see and change every value in the wizard. What
 * this must never do is accept a key the tool never declared, or a value its own field would
 * reject, which is what the allowlist below is for.
 */
export function prefillFromQuery(
  config: Pick<LeadMagnetConfig, 'inputs'>,
  search: URLSearchParams,
): LeadMagnetInputValues {
  const out: Record<string, unknown> = {};

  for (const input of config.inputs ?? []) {
    if (input.key.startsWith(RESERVED_PREFIX)) continue;
    const raw = search.get(input.key);
    if (raw === null || raw.trim() === '') continue;

    if (input.type === 'number' || input.type === 'currency') {
      const n = Number(raw.replace(/[,$\s]/g, ''));
      if (!Number.isFinite(n) || n < 0) continue;
      if (typeof input.min === 'number' && n < input.min) continue;
      if (typeof input.max === 'number' && n > input.max) continue;
      // An absolute ceiling on top of the field's own, because not every input declares a max:
      // the unified calculator's `social_followers` does not, so without this a link could seed
      // a trillion followers and render an estimate with no relationship to a real career.
      // Same bound the funnel's other allowlist uses (sanitizeCalculatorInputs). Reject rather
      // than clamp: a silently corrected number is a number nobody can explain.
      if (n > ABSOLUTE_MAX) continue;
      out[input.key] = n;
      continue;
    }

    if (input.type === 'option') {
      // Only a value this field actually offers. Anything else is someone editing the URL.
      if (input.options?.some((o) => o.value === raw)) out[input.key] = raw;
      continue;
    }

    // Free text: bounded, and never longer than a real answer.
    const s = raw.trim();
    if (s.length > 0 && s.length <= 120) out[input.key] = s;
  }

  return out as LeadMagnetInputValues;
}

/** Build the query string that `prefillFromQuery` reads back. */
export function prefillQueryString(values: LeadMagnetInputValues): string {
  const params = new URLSearchParams();
  for (const [key, v] of Object.entries(values as Record<string, unknown>)) {
    if (v === null || v === undefined || v === '') continue;
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
    params.set(key, String(v));
  }
  return params.toString();
}
