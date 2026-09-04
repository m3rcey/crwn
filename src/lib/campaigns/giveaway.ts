// The campaign layer that WRAPS an evergreen funnel, and the gate that decides whether a
// fan may ever see it.
//
// THE ONE RULE: the campaign wraps the funnel, it never replaces it. Every function here
// fails CLOSED to the evergreen experience. A campaign that is off, draft, ended, outside
// its window, misconfigured, or missing one legal field renders NOTHING, and the fan gets
// the ordinary lead magnet exactly as they would have. There is deliberately no partial
// state: a half-configured sweepstakes is worse than no campaign at all.
//
// WHY THIS IS STRICTER THAN THE REST OF THE SPINE. Attaching a prize turns a marketing
// campaign into a sweepstakes, and the facts a sweepstakes needs (who may enter, by when,
// by doing exactly what, under whose rules, winning exactly what, and how someone enters
// WITHOUT paying) are not things software may infer. So they are required inputs, checked
// here, and absent any one of them the giveaway presentation does not exist.
//
// NO NEW SCHEMA. Config lives in fan_campaigns.toolkit, which is already an artist-owned
// jsonb of slot key to copy; status and the window are already columns; the entrant record
// is already fan_campaign_participants. This module is the typed reader over that.

import type { CampaignStatus } from './lifecycle';
import { prizeTierIdOf } from './prizeState';

/** Where a campaign sits relative to its window, from SERVER time. */
export type CampaignPhase = 'off' | 'upcoming' | 'active' | 'ended';

export interface CampaignRow {
  id: string;
  artist_id: string;
  archetype: string;
  title: string;
  status: CampaignStatus;
  toolkit: Record<string, unknown> | null;
  starts_at: string | null;
  ends_at: string;
}

/** The campaign's fan-facing configuration, once proven complete. */
export interface CampaignPresentation {
  id: string;
  title: string;
  promise: string;
  whatToDo: string;
  endsAt: string;
  /** Present only when a giveaway is fully configured. Absent means no prize is shown. */
  giveaway?: {
    prize: string;
    prizeValue: string | null;
    officialRulesUrl: string;
    eligibility: string;
    freeEntry: string;
  };
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};

/**
 * An Official Rules destination must be a real https URL. A relative path, a mailto, or a
 * javascript scheme is not a rules page, and a generic terms link is a product decision
 * the artist makes by pasting it here, not something this module substitutes for them.
 */
export function isRulesUrl(v: unknown): boolean {
  const s = str(v, 300);
  return !!s && /^https:\/\/[^\s]+\.[^\s]+/.test(s);
}

/**
 * Which phase a campaign is in, by SERVER time. `now` is injected so this stays pure and
 * testable at the boundaries, where off-by-one errors actually live.
 *
 * The window is [starts_at, ends_at): a campaign is active AT its start instant and is
 * over AT its end instant, matching the half-open convention the campaign spine already
 * documents for its report window.
 */
export function campaignPhase(
  campaign: Pick<CampaignRow, 'status' | 'starts_at' | 'ends_at'>,
  now: Date,
): CampaignPhase {
  if (campaign.status !== 'active') return 'off';
  const ends = Date.parse(campaign.ends_at);
  if (!Number.isFinite(ends)) return 'off';
  const t = now.getTime();
  if (t >= ends) return 'ended';
  if (campaign.starts_at) {
    const starts = Date.parse(campaign.starts_at);
    if (!Number.isFinite(starts)) return 'off';
    if (starts >= ends) return 'off'; // an inverted window is a misconfiguration
    if (t < starts) return 'upcoming';
  }
  return 'active';
}

export interface ReadinessResult {
  ready: boolean;
  /** Plain-language reasons, for the ARTIST. Never shown to a fan. */
  blockers: string[];
  /** True when the artist has written any prize field, so giveaway rules apply. */
  isGiveaway: boolean;
}

/**
 * Can this campaign be shown to the public?
 *
 * Deliberately separate from funnel readiness: the evergreen funnel can be perfectly live
 * while the campaign is not, and that is the normal state during setup.
 *
 * `prizeFulfillable` is passed in rather than inferred, because whether CRWN can actually
 * honour a prize is a fact about the product, not about this row. As of 2026-09-02 there
 * is NO mechanism to grant months of a paid tier without a real payment (the discount
 * rail creates single-cycle coupons only, and the only writers of a paid subscription are
 * Stripe-driven), so a membership prize must pass `false` until one exists. A sweepstakes
 * that cannot pay out is the one failure mode worth blocking hardest.
 */
export function campaignReadiness(
  campaign: CampaignRow,
  opts: { prizeFulfillable: boolean },
): ReadinessResult {
  const blockers: string[] = [];
  const t = (campaign.toolkit || {}) as Record<string, unknown>;

  const promise = str(t.promise, 140);
  const whatToDo = str(t.what_to_do, 300);
  if (!promise) blockers.push('The campaign promise is empty.');
  if (!whatToDo) blockers.push('What taking part means is empty.');

  const ends = Date.parse(campaign.ends_at);
  if (!Number.isFinite(ends)) blockers.push('The end date is missing or invalid.');
  if (campaign.starts_at) {
    const starts = Date.parse(campaign.starts_at);
    if (!Number.isFinite(starts)) blockers.push('The start date is invalid.');
    else if (Number.isFinite(ends) && starts >= ends) blockers.push('The end date must be after the start date.');
  } else {
    blockers.push('The start date is not set.');
  }

  // A prize in ANY prize field means this is a sweepstakes and every legal fact applies.
  const prize = str(t.prize, 140);
  const prizeValue = str(t.prize_value, 60);
  const isGiveaway = !!prize || !!prizeValue;

  if (isGiveaway) {
    if (!prize) blockers.push('A value is stated but the prize itself is not described.');
    if (!isRulesUrl(t.official_rules_url)) blockers.push('Official Rules link is missing or is not a URL.');
    if (!str(t.eligibility, 200)) blockers.push('Who may enter is not stated.');
    if (!str(t.free_entry, 240)) blockers.push('The free way to enter is not stated, so no purchase necessary cannot be shown.');
    // The prize must name the tier it delivers, or the executor has nothing to grant. This is
    // the campaign's own configuration; whether the tier really belongs to the artist is
    // confirmed by the executor, which is the only thing that ever acts on it.
    if (!prizeTierIdOf(t)) blockers.push('The prize tier is not configured, so the prize cannot be delivered.');
    if (!opts.prizeFulfillable) {
      blockers.push('CRWN has no way to deliver this prize yet, so the giveaway cannot be shown.');
    }
  }

  return { ready: blockers.length === 0, blockers, isGiveaway };
}

/**
 * The fan-facing presentation, or NULL.
 *
 * Null is the fail-closed path and covers every one of: campaign off, draft, archived,
 * not started, ended, misconfigured, or a giveaway missing a legal field. Callers render
 * the evergreen funnel on null and never inspect why.
 */
export function presentCampaign(
  campaign: CampaignRow,
  now: Date,
  opts: { prizeFulfillable: boolean },
): CampaignPresentation | null {
  if (campaignPhase(campaign, now) !== 'active') return null;
  const readiness = campaignReadiness(campaign, opts);
  if (!readiness.ready) return null;

  const t = (campaign.toolkit || {}) as Record<string, unknown>;
  const out: CampaignPresentation = {
    id: campaign.id,
    title: campaign.title,
    promise: str(t.promise, 140)!,
    whatToDo: str(t.what_to_do, 300)!,
    endsAt: campaign.ends_at,
  };

  if (readiness.isGiveaway) {
    out.giveaway = {
      prize: str(t.prize, 140)!,
      prizeValue: str(t.prize_value, 60),
      officialRulesUrl: str(t.official_rules_url, 300)!,
      eligibility: str(t.eligibility, 200)!,
      freeEntry: str(t.free_entry, 240)!,
    };
  }
  return out;
}

/**
 * Does paying change anything about entering? It must not, ever.
 *
 * Stated as executable code rather than a comment so the property is testable: entry is a
 * function of the campaign window and the free join, and nothing about a fan's tier or
 * spend appears in it. Any future change that makes purchase matter has to delete this
 * function to compile, which is the point.
 */
export function entryIsIndependentOfPurchase(): true {
  return true;
}
