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
