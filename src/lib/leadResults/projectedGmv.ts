// The modeled monthly GROSS GMV a claimed calculator result stands for. The ONE definition of
// "projected GMV" after signup: what `recommendPlan()` is fed, what `artist_profiles
// .projected_monthly_gmv` stores, and what the launch-review plan panel prices.
//
// WHY THIS EXISTS (founder decision, 2026-09-20). Auto-claim and the launch-review panel both fed
// the recommender `estimatedMonthlyCents`. For the Opportunity Calculator that figure is NET-NEW
// revenue: what is left after CRWN's costs AND after subtracting what the artist already earns
// direct. The recommender wants GMV. So the bigger an artist's existing business, the SMALLER the
// number CRWN sized them by: an established seller whose conservative case adds nothing new was
// sized at zero and got no recommendation at all, while their modeled gross said Scale.
//
// RULES
//  - Gross is READ, never reconstructed: not backed out of a net, and never "additional revenue"
//    or current direct revenue standing in for it.
//  - A tool whose stored estimate is a net figure (the Opportunity Calculator, /worth) contributes
//    ONLY an explicit gross. A row of theirs saved before gross was carried contributes nothing
//    rather than a wrong number. (Opportunity rows have always carried their two gross halves, so
//    their sum IS the gross: that is reading, not reconstructing.)
//  - Every other money calculator stores a gross opportunity figure (`monthlyLossCents`: nothing
//    is subtracted from it), so their estimate is already GMV.
//  - Cents in, cents out. `artist_profiles.projected_monthly_gmv` is cents.
//
// This sizes a RECOMMENDATION. It is never billing state: a charge always uses the artist's actual
// plan (`getArtistFeePercent`), and every account still starts on Launch.
//
// Pure. No I/O.

export interface GmvSeedLike {
  toolSlug: string;
  estimatedMonthlyCents: number | null;
  conversionPayload: Record<string, unknown>;
}

/** Tools whose `estimatedMonthlyCents` is an after-costs figure, so it may never stand in for GMV. */
const NET_ESTIMATE_TOOLS: ReadonlySet<string> = new Set(['opportunity-calculator', 'worth']);

const cents = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null;

export function projectedGmvCentsFromSeed(seed: GmvSeedLike | null | undefined): number | null {
  if (!seed) return null;
  const cp = seed.conversionPayload ?? {};

  const explicit = cents(cp.totalGrossCents);
  if (explicit !== null) return explicit;

  // An Opportunity result saved before `totalGrossCents` was carried: its recurring and one-time
  // gross were both stored, and their sum is the total by definition.
  const recurring = cents(cp.recurringGrossCents);
  const oneTime = typeof cp.oneTimeGrossCents === 'number' && cp.oneTimeGrossCents >= 0 ? Math.round(cp.oneTimeGrossCents) : null;
  if (recurring !== null && oneTime !== null) return recurring + oneTime;

  if (NET_ESTIMATE_TOOLS.has(seed.toolSlug)) return null;
  return cents(seed.estimatedMonthlyCents);
}

/**
 * The projected GMV across an account's claimed results, which must arrive NEWEST FIRST. The
 * newest row is often a builder draft, which carries no numbers at all, so the first row that
 * actually holds a gross wins.
 */
export function projectedGmvCents(seeds: readonly GmvSeedLike[]): number | null {
  for (const seed of seeds) {
    const gmv = projectedGmvCentsFromSeed(seed);
    if (gmv !== null) return gmv;
  }
  return null;
}
