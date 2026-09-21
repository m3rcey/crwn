// The /worth entry wizard's questions, and the URL prefill that seeds them.
//
// WHY THIS FILE EXISTS (2026-09-20). `/worth?listeners=N` silently ignored N: the field showed the
// generic 150,000 default and the result was computed from it. The cause was ordering, not parsing.
// `WorthExperience` read the query in a `useEffect` (which runs AFTER the first render) while the
// entry wizard it mounts seeds its own answers from `initialValues` in a `useState` lazy
// initializer, which snapshots the FIRST render and ignores every later prop. So the wizard kept
// the default, rendered it in the box, and handed it back on submit. The URL read worked; it simply
// arrived one render too late. That was invisible until the one-question-per-screen entry wizard
// was added: before it, `/worth` rendered the number straight from page state and the late effect
// was harmless.
//
// The fix is to know the value on the FIRST render, so `/worth/page.tsx` reads the query on the
// SERVER and passes it through the `prefill` prop the component already documents ("seeds the
// inputs server-side"). That is why the questions live here: the server needs the same field
// definitions the wizard uses, so the bounds a prefilled value is validated against are the bounds
// its own field would enforce, and the two can never drift.
//
// The URL names are FROZEN. `?listeners=` / `?followers=` / `?streaming=` predate the wizard's
// config keys and are baked into outreach links, so they are mapped onto the keys rather than
// renamed. Validation is the canonical `prefillFromQuery`, the same allowlist every registry tool
// uses: it rejects a value the field itself would reject rather than clamping one, because a
// silently corrected number is a number nobody can explain.
//
// A calculator input is NOT authority: it seeds a displayed estimate the artist can see and change,
// never a price, a fee, an entitlement or a permission.

import type { LeadMagnetConfig } from './types';
import { prefillFromQuery } from './resumeInputs';

/**
 * The entry wizard's questions. The ONE definition: `WorthExperience` builds its wizard config from
 * this, and the server prefill validates against it, so a link can never seed a value the field
 * would refuse.
 */
export const WORTH_ENTRY_INPUTS = [
  {
    key: 'monthly_listeners',
    type: 'number',
    label: 'Roughly how many monthly listeners do you have?',
    required: true,
    min: 0,
    max: 100000000,
    step: 'listeners',
  },
  {
    key: 'followers',
    type: 'number',
    label: 'Roughly how many followers do you have across your socials?',
    help: 'Leave blank if you are not sure.',
    min: 0,
    max: 100000000,
    step: 'followers',
  },
  {
    key: 'streaming_revenue',
    type: 'currency',
    label: 'What do you make from streaming each month?',
    help: 'Optional. We estimate it from your listeners if you leave it blank.',
    min: 0,
    max: 1000000,
    step: 'streaming',
  },
  {
    // The 40% question, matching DIRECT_SALES_INPUT on every registry loss tool.
    // /worth was the one hand-raiser calculator that never asked it, so its call card
    // could not qualify anyone: `scoreLead` caps the fit at 60 while monetization is
    // unknown, which puts the ceiling under the `sales_priority` threshold no matter
    // how large the audience is. It does not touch the number, only who gets a call.
    key: 'monetization_status',
    type: 'option',
    label: 'Have you ever sold anything directly to your fans?',
    help: 'This shapes what we recommend. It does not change the number.',
    required: true,
    step: 'proof',
    options: [
      { value: 'direct_established', label: 'Yes, regularly (memberships, drops, VIP)', icon: '👑' },
      { value: 'direct_some', label: 'Yes, a few times', icon: '💸' },
      { value: 'merch_only', label: 'Merch or tickets only', icon: '👕' },
      { value: 'streaming_only', label: 'No, streaming and socials only', icon: '🎧' },
    ],
  },
] as unknown as LeadMagnetConfig['inputs'];

/**
 * The public URL name for each field, frozen since `/worth` shipped. Outreach links and any
 * campaign link already in the world use these, so they are mapped, never renamed.
 * `monetization_status` is deliberately absent: no link has ever carried it.
 */
export const WORTH_QUERY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  listeners: 'monthly_listeners',
  followers: 'followers',
  streaming: 'streaming_revenue',
});

/** What `/worth` seeds its inputs with. Strings, because the inputs are text fields. */
export interface WorthQueryPrefill {
  listeners?: string;
  followers?: string;
  streaming?: string;
}

type RawQuery = URLSearchParams | Record<string, string | string[] | undefined> | null | undefined;

function toParams(raw: RawQuery): URLSearchParams {
  if (!raw) return new URLSearchParams();
  if (raw instanceof URLSearchParams) return raw;
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    // A repeated param (`?listeners=1&listeners=2`) arrives as an array. Take the first, the same
    // thing `URLSearchParams.get` does, rather than guessing which one the artist meant.
    const first = Array.isArray(v) ? v[0] : v;
    if (typeof first === 'string') out.set(k, first);
  }
  return out;
}

/**
 * The artist's own numbers out of the link, validated exactly as their own fields would validate
 * them. Returns undefined when the link carries nothing usable, so a plain `/worth` visit and a
 * visit with a junk param behave identically: the normal defaults, never a crash and never a
 * malformed result.
 */
export function worthPrefillFromQuery(raw: RawQuery): WorthQueryPrefill | undefined {
  const params = toParams(raw);

  // Rename the public URL names onto the field keys, so the canonical validator can do its job.
  const renamed = new URLSearchParams();
  for (const [urlName, inputKey] of Object.entries(WORTH_QUERY_ALIASES)) {
    const value = params.get(urlName);
    if (value !== null) renamed.set(inputKey, value);
  }

  const valid = prefillFromQuery({ inputs: WORTH_ENTRY_INPUTS }, renamed) as Record<string, unknown>;

  const out: WorthQueryPrefill = {};
  for (const [urlName, inputKey] of Object.entries(WORTH_QUERY_ALIASES)) {
    const v = valid[inputKey];
    if (typeof v === 'number') out[urlName as keyof WorthQueryPrefill] = String(v);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
