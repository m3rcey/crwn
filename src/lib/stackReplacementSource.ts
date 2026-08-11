// stackReplacementSource.ts — where a Stack Replacement audit gets its facts.
//
// PURE. The report itself (`stackReplacement.ts`) does the arithmetic; this decides what may be
// fed into it, and labels how CRWN knows each fact. It exists so there is ONE model of an artist's
// stack rather than two: the Fan Stack Calculator already asks which platforms they run on and what
// they spend, so the audit seeds from that answer instead of asking again.
//
// THE EVIDENCE RULE
// -----------------
// Every fact here is ARTIST-DECLARED. CRWN observes none of it: there is no Patreon integration, no
// Mailchimp billing feed, no Shopify connection. So nothing this module produces may ever be
// presented as measured, and `evidence` travels with the numbers rather than being asserted in copy
// that can drift away from them.
//
// WHAT IT REFUSES TO DO
// ---------------------
// The calculator collects ONE total software spend, not a per-tool breakdown. Splitting that total
// across the named tools would be an invented allocation, and an invented allocation is what turns
// "you told us you spend $80" into "Patreon costs you $30" on a slide. So per-tool costs stay ZERO
// and the declared total is carried separately as unallocated, for the operator to itemize live on
// the audit call. That is the difference between seeding a conversation and fabricating a finding.

import type { StackCategory, StackReplacementInput, StackTool } from './stackReplacement';

/** How CRWN knows a fact. Mirrors the Money Model's discipline: never present modeled as measured. */
export type StackEvidence = 'observed' | 'artist_declared' | 'derived' | 'unknown';

/**
 * The Fan Stack Calculator's `platforms_used` options, mapped to audit categories by the JOB the
 * tool does, never by brand affinity. Anything not listed stays `other`, which `CRWN_REPLACES`
 * marks false, so an unrecognized tool is never claimed as replaceable.
 */
export const CALCULATOR_PLATFORM_CATEGORY: Record<string, StackCategory> = {
  Patreon: 'membership',
  'YouTube Memberships': 'membership',
  Shopify: 'storefront',
  Gumroad: 'storefront',
  Bandcamp: 'storefront',
  'Email tool': 'email',
  Discord: 'community',
  Ticketing: 'ticketing',
  Linktree: 'link_in_bio',
};

export function categoryForPlatform(name: string): StackCategory {
  return CALCULATOR_PLATFORM_CATEGORY[name.trim()] ?? 'other';
}

export interface StackSeed {
  /** Ready for buildStackReplacementReport. Per-tool costs are 0 by design (see header). */
  input: StackReplacementInput;
  /** The artist's declared total software spend, cents/month. NOT allocated to any tool. */
  unallocatedToolSpendCents: number | null;
  /** Per fact, how CRWN knows it. */
  evidence: {
    tools: StackEvidence;
    toolCosts: StackEvidence;
    monthlyDirectGmv: StackEvidence;
    adminHours: StackEvidence;
  };
  /** True when there is enough to run an audit at all. */
  usable: boolean;
  /** Plain sentences naming what CRWN does not know. Rendered, never hidden. */
  limitations: string[];
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/**
 * Seed an audit from a stored Fan Stack Calculator result's `input_data`.
 *
 * Returns a seed even when the artist answered almost nothing: `usable` says whether it is worth
 * opening, and `limitations` says what is missing, rather than silently producing a confident
 * report out of an empty questionnaire.
 */
export function stackSeedFromCalculator(inputData: Record<string, unknown> | null | undefined): StackSeed {
  const d = inputData ?? {};
  const platforms = Array.isArray(d.platforms_used) ? (d.platforms_used as unknown[]).map(String).filter(Boolean) : [];

  const tools: StackTool[] = platforms.map((name) => ({
    category: categoryForPlatform(name),
    name,
    // ZERO, deliberately. See the header: the calculator gives a total, not a breakdown, and
    // inventing the split is the exact dishonesty this audit exists to avoid.
    monthlyCents: 0,
    feePercent: null,
    monthlyGmvCents: null,
  }));

  const softwareCost = num(d.monthly_software_cost_cents);
  const otherDirect = num(d.other_direct_monthly_cents);
  const members = num(d.paid_members_elsewhere);
  const perFan = num(d.avg_fan_revenue_cents);

  // Current direct GMV, from the artist's own answers only. Members x their stated average is
  // arithmetic on two declared numbers, so it is DERIVED, not observed, and is labelled that way.
  const fromMembers = members !== null && perFan !== null ? members * perFan : null;
  const gmvParts = [fromMembers, otherDirect].filter((v): v is number => v !== null);
  const monthlyDirectGmvCents = gmvParts.length ? gmvParts.reduce((a, b) => a + b, 0) : 0;

  const limitations: string[] = [];
  if (!platforms.length) limitations.push('The artist has not told CRWN which platforms they run on.');
  if (softwareCost === null) limitations.push('No monthly software spend was given, so there is no tool-cost line.');
  else limitations.push('Software spend is a single declared total. Itemize it per tool on the call before quoting any per-tool saving.');
  if (!gmvParts.length) limitations.push('No current direct revenue was given, so the fee comparison runs at zero and proves nothing.');
  limitations.push('Every figure here is what the artist told CRWN. None of it is observed from a connected account.');

  return {
    input: { tools, monthlyDirectGmvCents, adminHoursPerMonth: null },
    unallocatedToolSpendCents: softwareCost,
    evidence: {
      tools: platforms.length ? 'artist_declared' : 'unknown',
      toolCosts: softwareCost !== null ? 'artist_declared' : 'unknown',
      monthlyDirectGmv: gmvParts.length ? 'derived' : 'unknown',
      // Never asked by any calculator; the operator captures it on the call.
      adminHours: 'unknown',
    },
    usable: platforms.length > 0,
    limitations,
  };
}
