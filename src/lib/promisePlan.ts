// promisePlan.ts — the benefit→obligation generator's PURE brain (Launch Wizard
// Stage 3, docs/ARTIST_LAUNCH_WIZARD.md).
//
// Everything decidable without I/O lives here so it is unit-checkable offline:
//  - which benefits are PROMISES (recurring artist actions) vs passive access,
//  - dedup: the same promise on several tiers is ONE obligation serving them all,
//  - inheritance: a promise flagged serves_higher_tiers also serves every tier
//    above it ("Everything in Gold" made real), still ONE obligation,
//  - the recurring-workload model the artist reviews before publishing,
//  - per-tier buyer estimates matched from the artist's own calculator ladder.
//
// The DB writes that consume these decisions live in tierObligations.ts (server)
// and the wizard's apply path. Nothing here creates fake workload: purchase-level
// fulfillment is intentionally absent, and only CONFIRMED (included) tiers plan.

import type { Recurrence } from '@/lib/fulfillment';
import type { TierTemplateDef } from '@/lib/tierTemplate';
import { tierNameAliases, normalizeTierName } from '@/lib/tierTemplate';

// Only benefits that imply a RECURRING ARTIST ACTION become promises. Access /
// passive perks (early_access, direct_messaging, shop_discount, badges, …) are
// not scheduled fulfillment and are intentionally absent. (Moved here from
// tierObligations.ts so the wizard can plan with the SAME definitions the
// server syncs with.)
export const PROMISE_BENEFITS: Record<
  string,
  { fulfillmentType: string; recurrence: Recurrence; title: string }
> = {
  group_live_qa: { fulfillmentType: 'livestream', recurrence: 'monthly', title: 'Group live Q&A' },
  one_on_one_call: { fulfillmentType: 'event', recurrence: 'monthly', title: '1-on-1 call' },
  monthly_merch: { fulfillmentType: 'shipment', recurrence: 'monthly', title: 'Monthly merch' },
  exclusive_posts: { fulfillmentType: 'content_drop', recurrence: 'monthly', title: 'Supporter-only post' },
};

export const ALLOWED_RECURRENCES: Recurrence[] = ['weekly', 'biweekly', 'monthly', 'quarterly'];

/** A benefit's config can override the default cadence (e.g. Platinum's quarterly). */
export function recurrenceFromConfig(
  config: Record<string, unknown> | null | undefined,
  fallback: Recurrence,
): Recurrence {
  const freq = config?.frequency;
  return typeof freq === 'string' && (ALLOWED_RECURRENCES as string[]).includes(freq)
    ? (freq as Recurrence)
    : fallback;
}

/** A benefit's config can give the obligation a specific, artist-facing title. */
export function titleFromConfig(config: Record<string, unknown> | null | undefined, fallback: string): string {
  const t = config?.obligation_title;
  return typeof t === 'string' && t.trim() ? t.trim() : fallback;
}

/** A benefit's config can pin the first due date (the wizard's review screen does). */
export function firstDueFromConfig(config: Record<string, unknown> | null | undefined): Date | null {
  const v = config?.first_due_at;
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Default first due date: a week of runway, at noon. */
export function defaultFirstDue(now: Date): Date {
  const d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  d.setHours(12, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Ladder planning (what the wizard's review screen renders)
// ---------------------------------------------------------------------------

export interface LadderRungInput {
  def: TierTemplateDef;
  /** Confirmed by the artist (Bronze is always included; dropped rungs are not). */
  included: boolean;
}

export interface PlannedPromise {
  /** Stable key for draft state: `${anchor tier key}:${benefit_type}`. */
  key: string;
  /** The rung the obligation anchors on (the LOWEST tier carrying the benefit). */
  tierKey: string;
  tierName: string;
  /** Every confirmed tier whose members this promise serves (anchor first). */
  servesTierNames: string[];
  benefitType: string;
  fulfillmentType: string;
  title: string;
  /** The template's plain-language fulfillment note, when it has one. */
  note: string | null;
  defaultRecurrence: Recurrence;
  /** True when this promise inherits upward (serves every higher tier too). */
  inheritsUp: boolean;
}

/**
 * Translate a CONFIRMED ladder into the promise list it will create. Applies the
 * two Stage 3 rules: dedup (the same benefit on several rungs plans ONCE, anchored
 * on the lowest rung, serving them all) and inheritance (serves_higher_tiers adds
 * every included higher rung to the serves list). Rungs must be in ladder order
 * (ascending price), which RECOMMENDED_LADDER already is.
 */
export function planLadderPromises(rungs: LadderRungInput[]): PlannedPromise[] {
  const included = rungs.filter((r) => r.included);
  const out: PlannedPromise[] = [];
  const byIdentity = new Map<string, PlannedPromise>();

  included.forEach((rung, idx) => {
    for (const b of rung.def.benefits) {
      const s = b.structured;
      if (!s || !(s.benefit_type in PROMISE_BENEFITS)) continue;
      const def = PROMISE_BENEFITS[s.benefit_type];
      const config = (s.config ?? {}) as Record<string, unknown>;
      const title = titleFromConfig(config, def.title);
      const identity = `${s.benefit_type}:${title.toLowerCase()}`;

      const existing = byIdentity.get(identity);
      if (existing) {
        // Dedup: the same promise on a higher rung serves it too — never a duplicate.
        if (!existing.servesTierNames.includes(rung.def.name)) existing.servesTierNames.push(rung.def.name);
        continue;
      }

      const inheritsUp = config.serves_higher_tiers === true;
      const serves = [rung.def.name];
      if (inheritsUp) {
        for (const higher of included.slice(idx + 1)) serves.push(higher.def.name);
      }
      const planned: PlannedPromise = {
        key: `${rung.def.key}:${s.benefit_type}`,
        tierKey: rung.def.key,
        tierName: rung.def.name,
        servesTierNames: serves,
        benefitType: s.benefit_type,
        fulfillmentType: def.fulfillmentType,
        title,
        note: b.fulfillment?.note ?? null,
        defaultRecurrence: recurrenceFromConfig(config, def.recurrence),
        inheritsUp,
      };
      byIdentity.set(identity, planned);
      out.push(planned);
    }
  });

  return out;
}

// ---------------------------------------------------------------------------
// Workload model (what "estimated recurring workload" means, in one place)
// ---------------------------------------------------------------------------

/** Rough artist minutes per occurrence, by how the promise is fulfilled. */
export const WORKLOAD_MINUTES: Record<string, number> = {
  content_drop: 30, // schedule one unlock from the backlog
  livestream: 90, // host one group session
  event: 60,
  shipment: 60,
  message: 15,
  manual_task: 30,
};

const CYCLES_PER_MONTH: Partial<Record<Recurrence, number>> = {
  weekly: 4.33,
  biweekly: 2.17,
  monthly: 1,
  quarterly: 1 / 3,
};

/** Average minutes per month one promise costs at a cadence. */
export function monthlyMinutes(fulfillmentType: string, recurrence: Recurrence): number {
  const per = WORKLOAD_MINUTES[fulfillmentType] ?? 30;
  return per * (CYCLES_PER_MONTH[recurrence] ?? 1);
}

/** Total average minutes per month for a set of (possibly cadence-adjusted) promises. */
export function estimateMonthlyWorkload(
  promises: { fulfillmentType: string; recurrence: Recurrence }[],
): number {
  return Math.round(promises.reduce((sum, p) => sum + monthlyMinutes(p.fulfillmentType, p.recurrence), 0));
}

/** Artist-facing label for a minutes-per-month figure. */
export function workloadLabel(minutesPerMonth: number): string {
  if (minutesPerMonth <= 0) return 'no recurring workload';
  if (minutesPerMonth < 60) return `about ${Math.max(5, Math.round(minutesPerMonth / 5) * 5)} minutes a month`;
  const hours = minutesPerMonth / 60;
  const rounded = Math.round(hours * 2) / 2;
  return `about ${rounded === 1 ? 'an hour' : `${rounded} hours`} a month`;
}

// ---------------------------------------------------------------------------
// Multi-tier access (what the server sync stores in obligation metadata)
// ---------------------------------------------------------------------------

/**
 * The tiers (beyond the anchor) whose members an obligation serves:
 * every explicitly merged tier (dedup) plus, when the promise inherits upward,
 * every active tier priced above the anchor. Pure set math; the sync layer
 * persists the result as metadata.serves_tier_ids.
 */
export function computeServesTierIds(args: {
  anchorTierId: string;
  anchorPriceCents: number;
  inheritsUp: boolean;
  mergedTierIds: string[];
  /** The artist's ACTIVE tiers (id + price), anchor included or not — both fine. */
  activeTiers: { id: string; price: number }[];
}): string[] {
  const serves = new Set<string>(args.mergedTierIds.filter((id) => id !== args.anchorTierId));
  if (args.inheritsUp) {
    for (const t of args.activeTiers) {
      if (t.id !== args.anchorTierId && t.price > args.anchorPriceCents) serves.add(t.id);
    }
  }
  return [...serves];
}

/** metadata.serves_tier_ids, defensively read. */
export function servesTierIdsOf(metadata: unknown): string[] {
  const m = metadata as Record<string, unknown> | null | undefined;
  const v = m?.serves_tier_ids;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** metadata.merged_tier_ids (explicit cross-tier dedup members), defensively read. */
export function mergedTierIdsOf(metadata: unknown): string[] {
  const m = metadata as Record<string, unknown> | null | undefined;
  const v = m?.merged_tier_ids;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// ---------------------------------------------------------------------------
// Buyer estimates (Stage 2 leftover: "why CRWN recommends it", with THEIR numbers)
// ---------------------------------------------------------------------------

export interface TierProjection {
  name: string;
  projectedSubs: number;
}

/**
 * The calculator's projected buyer count for a rung, matched by current name or
 * any legacy name (results claimed before the Bronze/Silver/Gold/Platinum rename
 * still say Inner Circle / The Vault / Throne). Null when the artist's calculator
 * did not model this rung.
 */
export function projectedBuyersFor(def: TierTemplateDef, projections: TierProjection[]): number | null {
  const aliases = new Set(tierNameAliases(def));
  for (const p of projections) {
    if (typeof p?.name !== 'string') continue;
    if (aliases.has(normalizeTierName(p.name))) {
      const n = Math.floor(p.projectedSubs);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }
  }
  return null;
}
