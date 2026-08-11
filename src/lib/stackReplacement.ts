// The Stack Replacement Report (offer decision, 2026-08-06).
//
// Answers a question no CRWN calculator asks: not "what could you earn" but
// "what does your CURRENT fragmented stack already cost you every month". The
// existing calculators model upside, which the artist must take on faith; this
// models an invoice they can go read. Loss-framed by construction.
//
// v1 is the AUDIT tool for the First Revenue Launch cohort: pure math plus a
// plain-text report for the audit conversation and email.
//
// SURFACED 2026-08-11 (Z6), operator-side only: the admin Money Model engagement
// detail renders this through GET /api/admin/stack-replacement, seeded from the
// artist's own Fan Stack Calculator answers by `stackReplacementSource.ts`. That
// mapper is the ONLY approved way to build an input from stored data, and it
// deliberately leaves per-tool costs at zero because the calculator collects one
// declared total, not a breakdown. Whether this becomes a PUBLIC calculator is
// still a founder decision after the concierge cohort proves which lines land
// (registry entry then, not now). Do not bolt a wizard onto this file.
//
// HONESTY RULES (same discipline as fanStackModel):
//  - Tool-cost savings and platform-fee comparisons are SEPARATE lines, never
//    summed into one "you save $X" headline. Mixing them overstates both.
//  - CRWN does not replace every tool. Each entry carries `crwnReplaces`, and
//    only the replaceable subtotal is claimed as consolidation savings; the
//    rest is listed as "stays in your stack" so the report never overclaims.
//  - Fee comparisons are computed at the artist's REAL current direct GMV, and
//    every CRWN number comes from TIER_PRICING / TIER_LIMITS. Never hardcode.
//  - No em dashes in any rendered copy.

import { TIER_LIMITS, TIER_PRICING } from './platformTier';
import { proBreakEvenGmvCents, scaleBreakEvenGmvCents } from './planRecommendation';

export const STACK_REPLACEMENT_VERSION = 'stackReplacement@1';

/** The stack categories the audit walks through, in conversation order. */
export type StackCategory =
  | 'membership'
  | 'storefront'
  | 'email'
  | 'community'
  | 'ticketing'
  | 'link_in_bio'
  | 'scheduling'
  | 'other';

export const STACK_CATEGORY_LABELS: Record<StackCategory, string> = {
  membership: 'Membership platform',
  storefront: 'Store / merch platform',
  email: 'Email platform',
  community: 'Community platform',
  ticketing: 'Ticketing platform',
  link_in_bio: 'Link-in-bio tool',
  scheduling: 'Scheduling tool',
  other: 'Other tool',
};

/** Which categories the CRWN app actually replaces today. Ticketing is live
 *  sessions only (not physical box office), so it stays FALSE: the report must
 *  never claim a replacement the product cannot deliver. */
export const CRWN_REPLACES: Record<StackCategory, boolean> = {
  membership: true,
  storefront: true,
  email: true,
  community: true,
  ticketing: false,
  link_in_bio: true,
  scheduling: false,
  other: false,
};

export interface StackTool {
  category: StackCategory;
  /** e.g. "Patreon". Optional; the category label stands in when absent. */
  name?: string | null;
  /** Fixed subscription cost, cents/month. 0 for percentage-only platforms. */
  monthlyCents: number;
  /** The platform's cut of sales it processes, e.g. 8 for Patreon's 8%. */
  feePercent?: number | null;
  /** Monthly GMV flowing through THIS tool, cents. Used for its fee line. */
  monthlyGmvCents?: number | null;
}

export interface StackReplacementInput {
  tools: StackTool[];
  /** Total current direct-to-fan GMV per month, cents (all tools combined). */
  monthlyDirectGmvCents: number;
  /** Hours per month spent stitching the tools together (CSV exports, cross-posting). */
  adminHoursPerMonth?: number | null;
}

export interface PlanCostLine {
  plan: 'starter' | 'pro' | 'scale';
  label: string;
  subscriptionCents: number;
  feePercent: number;
  feeCents: number;
  totalCents: number;
}

export interface StackReplacementReport {
  version: string;
  /** Fixed subscriptions across the whole stack, cents/month. */
  toolCostCents: number;
  /** Fixed subscriptions on tools CRWN replaces, cents/month. The only line
   *  claimable as consolidation savings. */
  replaceableToolCostCents: number;
  /** Platform fees currently paid on the GMV each tool processes, cents/month. */
  currentFeeCents: number;
  /** Tools counted / tools CRWN replaces. */
  systemCount: number;
  replaceableCount: number;
  /** Tools CRWN does NOT replace, listed so the report never overclaims. */
  staysInStack: string[];
  /** What the same GMV costs on each CRWN plan (subscription + fee). */
  planCosts: PlanCostLine[];
  /** The plan with the lowest total at the current GMV. */
  cheapestPlan: PlanCostLine;
  /** Current replaceable cost minus the cheapest CRWN total. Positive means the
   *  fragmented stack costs more TODAY, before any new revenue. Cents/month. */
  monthlySwingCents: number;
  /** GMV thresholds where each paid plan overtakes the one below it. */
  proBreakEvenGmvCents: number;
  scaleBreakEvenGmvCents: number;
  adminHoursPerMonth: number;
}

const PLAN_LABELS: Record<'starter' | 'pro' | 'scale', string> = {
  starter: 'Launch',
  pro: 'Pro',
  scale: 'Scale',
};

const n = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;

function toolLabel(t: StackTool): string {
  return t.name?.trim() || STACK_CATEGORY_LABELS[t.category];
}

export function buildStackReplacementReport(input: StackReplacementInput): StackReplacementReport {
  const gmv = n(input.monthlyDirectGmvCents);

  let toolCostCents = 0;
  let replaceableToolCostCents = 0;
  let currentFeeCents = 0;
  let replaceableCount = 0;
  const staysInStack: string[] = [];

  for (const t of input.tools) {
    const fixed = n(t.monthlyCents);
    toolCostCents += fixed;
    // A tool's fee applies to the GMV it actually processes, never the total.
    currentFeeCents += Math.round(n(t.monthlyGmvCents) * (n(t.feePercent) / 100));
    if (CRWN_REPLACES[t.category]) {
      replaceableToolCostCents += fixed;
      replaceableCount += 1;
    } else {
      staysInStack.push(toolLabel(t));
    }
  }

  const planCosts: PlanCostLine[] = (['starter', 'pro', 'scale'] as const).map((plan) => {
    const subscriptionCents = plan === 'starter' ? 0 : TIER_PRICING[plan].monthly;
    const feePercent = TIER_LIMITS[plan].platformFeePercent;
    const feeCents = Math.round(gmv * (feePercent / 100));
    return {
      plan,
      label: PLAN_LABELS[plan],
      subscriptionCents,
      feePercent,
      feeCents,
      totalCents: subscriptionCents + feeCents,
    };
  });

  const cheapestPlan = planCosts.reduce((a, b) => (b.totalCents < a.totalCents ? b : a));

  return {
    version: STACK_REPLACEMENT_VERSION,
    toolCostCents,
    replaceableToolCostCents,
    currentFeeCents,
    systemCount: input.tools.length,
    replaceableCount,
    staysInStack,
    planCosts,
    cheapestPlan,
    monthlySwingCents: replaceableToolCostCents + currentFeeCents - cheapestPlan.totalCents,
    proBreakEvenGmvCents: proBreakEvenGmvCents(),
    scaleBreakEvenGmvCents: scaleBreakEvenGmvCents(),
    adminHoursPerMonth: n(input.adminHoursPerMonth),
  };
}

const dollars = (cents: number): string => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/**
 * The report as plain text for the audit conversation and email. Loss first
 * (what the stack costs today), then the CRWN comparison, then what stays.
 * No em dashes, no markdown fences.
 */
export function renderStackReplacementReport(
  input: StackReplacementInput,
  artistName?: string | null,
): string {
  const r = buildStackReplacementReport(input);
  const lines: string[] = [];

  lines.push(`Stack Replacement Report${artistName ? ` for ${artistName}` : ''}`);
  lines.push('');
  lines.push('What your current stack costs every month, before you earn another dollar:');
  for (const t of input.tools) {
    const parts: string[] = [];
    if (n(t.monthlyCents) > 0) parts.push(`${dollars(t.monthlyCents)}/mo`);
    if (n(t.feePercent) > 0) {
      const feeCents = Math.round(n(t.monthlyGmvCents) * (n(t.feePercent) / 100));
      parts.push(`${t.feePercent}% of sales${feeCents > 0 ? ` (about ${dollars(feeCents)}/mo)` : ''}`);
    }
    lines.push(`  ${toolLabel(t)}: ${parts.length ? parts.join(' plus ') : 'free'}`);
  }
  lines.push('');
  lines.push(`Subscriptions across ${r.systemCount} tools: ${dollars(r.toolCostCents)}/mo`);
  lines.push(`Platform fees on your current sales: ${dollars(r.currentFeeCents)}/mo`);
  lines.push(`Total: ${dollars(r.toolCostCents + r.currentFeeCents)}/mo to run a disconnected version of one system`);
  lines.push('');
  lines.push(`The same sales (${dollars(n(input.monthlyDirectGmvCents))}/mo) on the CRWN app:`);
  for (const p of r.planCosts) {
    const sub = p.subscriptionCents > 0 ? `${dollars(p.subscriptionCents)}/mo plus ` : 'free, ';
    const marker = p.plan === r.cheapestPlan.plan ? '  <- cheapest at your volume' : '';
    lines.push(`  ${p.label}: ${sub}${p.feePercent}% fee = ${dollars(p.totalCents)}/mo${marker}`);
  }
  lines.push('');
  if (r.monthlySwingCents > 0) {
    lines.push(
      `Staying fragmented costs you about ${dollars(r.monthlySwingCents)}/mo more than the ${r.cheapestPlan.label} plan, before counting a single new member.`,
    );
  } else {
    lines.push(
      `At your current volume the raw costs are close. The case for consolidating is the revenue side: one fan record, one ladder, offers that compound.`,
    );
  }
  lines.push(`Above ${dollars(r.proBreakEvenGmvCents)}/mo in sales, Pro costs less than Launch. Above ${dollars(r.scaleBreakEvenGmvCents)}/mo, Scale costs less than Pro.`);
  if (r.staysInStack.length > 0) {
    lines.push('');
    lines.push(`Staying in your stack (the CRWN app does not replace these): ${r.staysInStack.join(', ')}.`);
  }
  if (r.adminHoursPerMonth > 0) {
    lines.push('');
    lines.push(
      `You also spend about ${r.adminHoursPerMonth} hours a month stitching these tools together. That time does not show up on an invoice, but you pay it.`,
    );
  }

  return lines.join('\n');
}
