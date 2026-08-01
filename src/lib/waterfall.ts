// The release waterfall (release strategy spec, sections 11 and 28.4).
//
// Higher tiers hear a members-first drop earlier: Platinum on day one, Gold
// partway through the window, Silver last, public when the window closes. The
// automation NEVER touches the entitlement gate. can_play_track and
// GatedTrackPlayer are unchanged; a daily cron simply ADDS tier ids to
// allowed_tier_ids when their window opens, which is the exact edit a Launch
// artist makes by hand (the spec's Launch tier does this manually; Pro
// automates it). Adding a tier only ever GRANTS access, so the worst possible
// failure of the scheduler is a tier opening a day late or early, never a
// paying member locked out.
//
// Stagger order comes from PRICE ORDER, never tier names: artists rename tiers
// freely, and the most expensive tier is by definition the closest circle. The
// day offsets come from the strategy tier roles (30 / 14 / 7).
//
// The schedule lives in tracks.waterfall (jsonb, migration
// schema-phase2-track-waterfall.sql) and entries are REMOVED as they open, so a
// track with an empty schedule costs the cron nothing.

export interface WaterfallEntry {
  tier_id: string;
  /** ISO timestamp when this tier's access opens. */
  opens_at: string;
}

/** Head-start days by ladder position (price desc), from the strategy roles. */
export const LADDER_EARLY_DAYS = [30, 14, 7] as const;

export interface BuiltWaterfall {
  /** Tiers that hear it from the moment of upload. */
  immediateTierIds: string[];
  /** Tiers whose access opens later, soonest first. */
  scheduled: WaterfallEntry[];
  /** When the track opens to everyone (the paid-first public date). */
  publicReleaseDate: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build a staggered schedule for one members-first track.
 *
 * Each paid tier (price desc) gets a head start of `LADDER_EARLY_DAYS[i]` days
 * before the public date, clamped to the window; tiers past the ladder reuse
 * the last value. A head start equal to the whole window means "immediate".
 * With a short window every tier collapses to immediate, which is exactly the
 * all-at-once behaviour, so the degenerate case is correct by construction.
 */
export function buildWaterfall(opts: {
  paidTiersByPriceDesc: { id: string }[];
  windowDays: number;
  now?: Date;
}): BuiltWaterfall {
  const now = opts.now ?? new Date();
  const windowDays = Math.max(1, Math.round(opts.windowDays));
  const publicDate = new Date(now.getTime() + windowDays * DAY_MS);

  const immediateTierIds: string[] = [];
  const scheduled: WaterfallEntry[] = [];

  opts.paidTiersByPriceDesc.forEach((tier, i) => {
    const ladderDays = LADDER_EARLY_DAYS[Math.min(i, LADDER_EARLY_DAYS.length - 1)];
    const earlyDays = Math.min(ladderDays, windowDays);
    if (earlyDays >= windowDays) {
      immediateTierIds.push(tier.id);
    } else {
      scheduled.push({
        tier_id: tier.id,
        opens_at: new Date(publicDate.getTime() - earlyDays * DAY_MS).toISOString(),
      });
    }
  });

  scheduled.sort((a, b) => new Date(a.opens_at).getTime() - new Date(b.opens_at).getTime());
  return { immediateTierIds, scheduled, publicReleaseDate: publicDate.toISOString() };
}

/**
 * Split a stored schedule into tiers due to open now and the entries that
 * remain. Malformed entries open immediately rather than silently never
 * opening: over-granting a tier beats a fan who paid and never gets in.
 */
export function dueOpenings(
  entries: unknown,
  now: Date = new Date(),
): { openTierIds: string[]; remaining: WaterfallEntry[] } {
  if (!Array.isArray(entries)) return { openTierIds: [], remaining: [] };
  const openTierIds: string[] = [];
  const remaining: WaterfallEntry[] = [];
  for (const raw of entries) {
    const e = raw as Partial<WaterfallEntry> | null;
    if (!e || typeof e.tier_id !== 'string') continue;
    const opens = typeof e.opens_at === 'string' ? new Date(e.opens_at) : null;
    if (!opens || Number.isNaN(opens.getTime()) || opens.getTime() <= now.getTime()) {
      openTierIds.push(e.tier_id);
    } else {
      remaining.push({ tier_id: e.tier_id, opens_at: e.opens_at as string });
    }
  }
  return { openTierIds, remaining };
}
