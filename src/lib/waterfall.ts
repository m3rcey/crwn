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
// freely, and the most expensive tier is by definition the closest circle.
//
// HOW MANY DAYS EARLY: ONE SOURCE, AND IT IS THE TIER'S OWN BENEFIT.
// `tier_benefits.config.days_early` is what the fan is actually SHOWN
// ("7-day early access to new music", via getBenefitDisplayText), it is
// per-tier, and the artist can edit it. So it is what the scheduler must
// execute. Anything else lets a tier advertise 7 days and open on day 14.
// LADDER_EARLY_DAYS survives only as the fallback for a tier that carries NO
// early_access benefit at all, where there is no promise to honour and the
// ladder default is the best available guess. Callers pass `daysEarly` per
// tier; `earlyAccessDaysByTier()` is the one reader of the benefit rows.
//
// The schedule lives in tracks.waterfall (jsonb, migration
// schema-phase2-track-waterfall.sql) and entries are REMOVED as they open, so a
// track with an empty schedule costs the cron nothing.

export interface WaterfallEntry {
  tier_id: string;
  /** ISO timestamp when this tier's access opens. */
  opens_at: string;
}

/**
 * Head-start days by ladder position (price desc), from the strategy roles.
 * FALLBACK ONLY. A tier with an `early_access` benefit uses that benefit's
 * `days_early`; see the note above.
 */
export const LADDER_EARLY_DAYS = [30, 14, 7] as const;

/** A tier_benefits row, narrowed to what the schedule needs. */
export interface EarlyAccessBenefitRow {
  tier_id: string;
  benefit_type: string;
  config: Record<string, unknown> | null;
}

/**
 * The promised head start per tier id, read from the artist's own benefit rows.
 *
 * `days_early` is stored as jsonb config and production holds BOTH numbers and
 * numeric strings (`{"days_early": "14"}` exists today), so it is coerced the
 * same way getBenefitDisplayText coerces it for display. A value that is not a
 * positive finite number is dropped rather than defaulted here, so the caller
 * falls back to the ladder position instead of scheduling a 0-day head start
 * that nobody promised.
 */
export function earlyAccessDaysByTier(
  rows: EarlyAccessBenefitRow[] | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows ?? []) {
    if (!row || row.benefit_type !== 'early_access' || typeof row.tier_id !== 'string') continue;
    const raw = row.config?.days_early;
    const days = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (!Number.isFinite(days) || days <= 0) continue;
    out[row.tier_id] = Math.round(days);
  }
  return out;
}

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
 * Each paid tier (price desc) gets the head start ITS OWN early-access benefit
 * promises (`daysEarly`), clamped to the window. A tier with no such benefit
 * falls back to `LADDER_EARLY_DAYS[i]` by ladder position; tiers past the
 * ladder reuse the last value. A head start equal to or longer than the whole
 * window means "immediate". With a short window every tier collapses to
 * immediate, which is exactly the all-at-once behaviour, so the degenerate case
 * is correct by construction.
 */
export function buildWaterfall(opts: {
  /** `daysEarly` is the tier's promised head start; omit it to use the ladder default. */
  paidTiersByPriceDesc: { id: string; daysEarly?: number }[];
  windowDays: number;
  now?: Date;
}): BuiltWaterfall {
  const now = opts.now ?? new Date();
  const windowDays = Math.max(1, Math.round(opts.windowDays));
  const publicDate = new Date(now.getTime() + windowDays * DAY_MS);

  const immediateTierIds: string[] = [];
  const scheduled: WaterfallEntry[] = [];

  opts.paidTiersByPriceDesc.forEach((tier, i) => {
    const promised = tier.daysEarly;
    const ladderDays =
      typeof promised === 'number' && Number.isFinite(promised) && promised > 0
        ? Math.round(promised)
        : LADDER_EARLY_DAYS[Math.min(i, LADDER_EARLY_DAYS.length - 1)];
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
