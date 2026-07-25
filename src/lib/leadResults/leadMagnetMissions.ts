// Lead magnets as the starting point of Rise Mode.
//
// A calculator an artist completed becomes a PERSONALIZED first mission: not "launch a mission",
// but "Build Membership", carrying the dollar figure they saw. This is the single source both
// surfaces read from, so there is one mission system, not two:
//   - the always-on Action Plan (/api/action-plan) turns each mission into a ranked recommendation
//   - Rise Mode (/api/quests -> RiseMode banner) leads with the top one
//
// It invents no mission: a mission exists only for a calculator the artist actually completed, and
// only for the five that map to a real builder. Everything is derived from stored results.

import type { Db } from './handoffSeed';
import { getClaimedResults, type LeadMagnetSeed } from './handoffSeed';
import { postSetupDestination, destinationToUrl } from './postSetupDestination';

// The per-calculator mission copy (the "instead of generic missions" line). Only these five map
// to a builder, so only these become missions; any other completed calculator is ignored here.
export const LEAD_MAGNET_MISSIONS: Record<string, { title: string; icon: string }> = {
  worth: { title: 'Build Membership', icon: 'crown' },
  'executive-producer-session': { title: 'Create Your First Executive Producer Session', icon: 'sliders' },
  'share-to-earn-planner': { title: 'Turn On Share-to-Earn', icon: 'share-2' },
  'live-experience-calculator': { title: 'Schedule Your First Ticketed Live', icon: 'radio' },
  'vault-revenue-planner': { title: 'Launch Your Vault', icon: 'lock' },
};

export interface LeadMagnetMission {
  toolSlug: string;
  toolName: string;
  /** The mission line, e.g. "Build Membership". */
  title: string;
  /** Display figure, e.g. "$1,240/mo". Null when the calculator produced no monthly dollar. */
  monthlyValue: string | null;
  /** Numeric monthly opportunity in cents, for ranking. Null when unknown. */
  monthlyCents: number | null;
  /** CTA into the matching builder, prefilled (same routing as the post-setup handoff). */
  href: string;
  resultId: string;
  icon: string;
}

/** The monthly opportunity a calculator modeled, in cents. worth carries it as netMrr; loss tools
 *  as estimatedMonthlyCents. Null when the tool produced no dollar (e.g. a score-only tool). */
function monthlyCentsOf(seed: LeadMagnetSeed): number | null {
  if (typeof seed.estimatedMonthlyCents === 'number' && seed.estimatedMonthlyCents > 0) {
    return seed.estimatedMonthlyCents;
  }
  const net = seed.conversionPayload?.netMrrCents;
  if (typeof net === 'number' && net > 0) return net;
  return null;
}

function fmtMonthly(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}/mo`;
}

/** Turn one completed-calculator seed into a mission. Returns null if the tool has no mission. */
export function seedToMission(seed: LeadMagnetSeed): LeadMagnetMission | null {
  const def = LEAD_MAGNET_MISSIONS[seed.toolSlug];
  if (!def) return null;

  const monthlyCents = monthlyCentsOf(seed);
  const dest = postSetupDestination(seed);
  const href = dest ? destinationToUrl(dest) : seed.convertHref;

  return {
    toolSlug: seed.toolSlug,
    toolName: seed.toolName,
    title: def.title,
    monthlyCents,
    monthlyValue: monthlyCents ? fmtMonthly(monthlyCents) : seed.heroValue ? `${seed.heroValue}${seed.heroSuffix ?? ''}` : null,
    href,
    resultId: seed.resultId,
    icon: def.icon,
  };
}

/** Reduce seeds (newest first) to one mission per completed calculator, ranked by opportunity. Pure. */
export function missionsFromSeeds(seeds: LeadMagnetSeed[]): LeadMagnetMission[] {
  const byTool = new Map<string, LeadMagnetSeed>();
  for (const s of seeds) {
    if (!LEAD_MAGNET_MISSIONS[s.toolSlug]) continue; // only completed, builder-mapped calculators
    if (!byTool.has(s.toolSlug)) byTool.set(s.toolSlug, s); // seeds are newest-first: keep the latest
  }
  return [...byTool.values()]
    .map(seedToMission)
    .filter((m): m is LeadMagnetMission => m !== null)
    .sort((a, b) => (b.monthlyCents ?? 0) - (a.monthlyCents ?? 0)); // biggest opportunity leads
}

/** One personalized mission per completed calculator, ranked. Empty when none were completed. */
export async function buildLeadMagnetMissions(
  db: Db,
  opts: { userId: string; artistId?: string | null },
): Promise<LeadMagnetMission[]> {
  const seeds = await getClaimedResults(db, opts);
  return missionsFromSeeds(seeds);
}
