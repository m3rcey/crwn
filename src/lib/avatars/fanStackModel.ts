// The Fan Stack Consolidation model: what running the direct-to-fan business across five tools
// costs, and what the same fans are worth consolidated in one place.
//
// Pure and deterministic. Versioned so stored results can be told apart from any future retune.
//
// HONESTY RULES:
//  - Revenue the artist ALREADY earns is never claimed as new. The headline is the ADDED monthly
//    opportunity: the per-fan uplift on migrated members, member a-la-carte spend, and net-new
//    payers from the unconverted audience. Existing revenue is context, not opportunity.
//  - Tool-cost reduction is a SEPARATE line, never added into the revenue headline. Mixing a cost
//    saving into a revenue figure would overstate both.
//  - Migration is partial by assumption. No model may assume every existing member follows.
//  - CRWN does not replace every platform, and the copy layer must never claim it does.
//
// Rates reuse the repo's existing audience model wherever one exists (leadCalculator conservative
// preset, unified opportunity ceilings, RECOMMENDED_LADDER prices). The two rates that had no
// repo precedent (MIGRATION_RATE, its scenario band) are documented judgement calls, conservative
// on purpose, and surfaced in the artist-facing assumptions block.

import { RECOMMENDED_LADDER } from '../tierTemplate';

export const FAN_STACK_MODEL_VERSION = 'fanStack@1';

export interface FanStackAssumptions {
  /** Share of a following that ever actually sees a post. leadCalculator conservative preset. */
  reachRate: number;
  /** Share of reachable fans who ever pay for anything. leadCalculator conservative preset. */
  superfanRate: number;
  /** Hard ceiling on total conversion, same as the unified model's maxConversion. */
  maxConversion: number;
  /** Share of existing paid members who follow a direct, personal invitation to a new home. */
  migrationRate: number;
  /** Monthly a-la-carte spend per member once offers live beside the membership. Cents. */
  memberAlacarteCents: number;
  /** Weighted monthly revenue per paying member on the recommended ladder (70/22/8 split). Cents. */
  ladderArpuCents: number;
  /** Entry paid tier price, used for net-new payers (they start at the front door). Cents. */
  entryTierCents: number;
}

/** The 70/22/8 tier split from the unified model, priced off the canonical ladder. */
function ladderArpuCents(): number {
  const [, silver, gold, platinum] = RECOMMENDED_LADDER;
  return Math.round(0.7 * silver.priceCents + 0.22 * gold.priceCents + 0.08 * platinum.priceCents);
}

export function getFanStackAssumptions(): FanStackAssumptions {
  return {
    reachRate: 0.15,
    superfanRate: 0.03,
    maxConversion: 0.1,
    migrationRate: 0.6,
    memberAlacarteCents: 300,
    ladderArpuCents: ladderArpuCents(),
    entryTierCents: RECOMMENDED_LADDER[1].priceCents,
  };
}

export interface FanStackInputs {
  /** Platforms the artist runs today (labels; count drives fragmentation context). */
  platformsUsed: string[];
  /** What those tools cost per month, as the artist states it. Cents. */
  monthlySoftwareCostCents: number;
  /** Paying members across those platforms today. */
  paidMembersElsewhere: number;
  /** Average monthly revenue per paying fan today, as stated. Cents. */
  avgRevenuePerFanCents: number;
  /** Monthly merch / product / experience revenue outside memberships. Cents. Context only. */
  otherDirectMonthlyCents: number;
  /** Audience (largest platform figure, never a sum). */
  audience: number;
}

export interface FanStackResult {
  modelVersion: string;
  assumptions: FanStackAssumptions;
  toolCount: number;
  /** Members expected to follow a direct migration invitation. */
  migratedMembers: number;
  /** Monthly uplift from migrated members earning ladder ARPU instead of today's ARPU. Cents. */
  perFanUpliftCents: number;
  /** Monthly a-la-carte spend those migrated members add in one consolidated home. Cents. */
  memberAlacarteCents: number;
  /** Net-new payers from the reachable audience not already paying anywhere. */
  newPayers: number;
  /** Monthly revenue from those net-new payers at the entry tier. Cents. */
  newPayerCents: number;
  /** The ADDED monthly opportunity (uplift + a-la-carte + new payers). Cents. */
  addedMonthlyCents: number;
  addedAnnualCents: number;
  /** SEPARATE line: tool subscriptions that could be retired. Cents/month. Never in the headline. */
  toolCostCents: number;
  /** Context: what the artist already earns per month across the stack. Cents. */
  currentMonthlyCents: number;
}

const clampCount = (v: number): number => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const clampCents = (v: number): number => (Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/**
 * Run the model. Deterministic; safe on zeros (an artist with no members and no audience gets an
 * honest zero, not an invented floor).
 */
export function computeFanStack(
  raw: Partial<FanStackInputs>,
  a: FanStackAssumptions = getFanStackAssumptions(),
): FanStackResult {
  const platforms = Array.isArray(raw.platformsUsed) ? raw.platformsUsed.filter(Boolean) : [];
  const audience = clampCount(raw.audience ?? 0);
  const paidMembers = clampCount(raw.paidMembersElsewhere ?? 0);
  const currentArpu = clampCents(raw.avgRevenuePerFanCents ?? 0);
  const toolCost = clampCents(raw.monthlySoftwareCostCents ?? 0);
  const otherDirect = clampCents(raw.otherDirectMonthlyCents ?? 0);

  const migratedMembers = Math.round(paidMembers * a.migrationRate);

  // Uplift only when the ladder ARPU beats what they earn per fan today. An artist already
  // clearing $30/fan gets zero uplift claimed, which is the honest answer.
  const perFanUpliftCents = migratedMembers * Math.max(0, a.ladderArpuCents - currentArpu);
  const memberAlacarte = migratedMembers * a.memberAlacarteCents;

  // Net-new payers: superfans in the reachable audience who are not already paying somewhere.
  const reachable = Math.round(audience * a.reachRate);
  const convertible = Math.min(Math.round(reachable * a.superfanRate), Math.round(reachable * a.maxConversion));
  const newPayers = Math.max(0, convertible - paidMembers);
  const newPayerCents = newPayers * a.entryTierCents;

  const addedMonthlyCents = perFanUpliftCents + memberAlacarte + newPayerCents;

  return {
    modelVersion: FAN_STACK_MODEL_VERSION,
    assumptions: a,
    toolCount: platforms.length,
    migratedMembers,
    perFanUpliftCents,
    memberAlacarteCents: memberAlacarte,
    newPayers,
    newPayerCents,
    addedMonthlyCents,
    addedAnnualCents: addedMonthlyCents * 12,
    toolCostCents: toolCost,
    currentMonthlyCents: paidMembers * currentArpu + otherDirect,
  };
}

/** The conservative / expected / high band, varying only migration + superfan rates. */
export function fanStackScenarios(raw: Partial<FanStackInputs>): {
  conservative: FanStackResult;
  expected: FanStackResult;
  high: FanStackResult;
} {
  const base = getFanStackAssumptions();
  return {
    conservative: computeFanStack(raw, { ...base, migrationRate: 0.4, superfanRate: 0.02 }),
    expected: computeFanStack(raw, base),
    high: computeFanStack(raw, { ...base, migrationRate: 0.8, superfanRate: 0.05 }),
  };
}
