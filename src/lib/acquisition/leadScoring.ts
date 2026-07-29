// Deterministic lead scoring, weighted to the CRWN customer avatar.
//
// The score is CRWN's, not Claude's. Claude contributes a bounded signal (0-20 of 100) and
// nothing more. Everything else is arithmetic on facts the artist told us.
//
// Requirement from the brief: "A score must be explainable from stored components." So every
// component is named, every point is attributable, and the whole thing is persisted to
// lead_score_history. If Josh asks "why is this lead an 82", the answer is a table, not a
// shrug.
//
// THE AVATAR (2026-07-28, docs/ICP.md). The ideal customer is NOT the artist with the biggest
// audience. It is the artist who has ALREADY PROVEN they can get fans to spend money directly,
// and whose monetization stack is fragmented across Patreon, Shopify, Discord, Gumroad and the
// rest. Streaming is exposure. Direct sales are proof. The four weights are fixed:
//
//     direct monetization history  40
//     audience size                25
//     engagement                   20
//     catalog depth                15
//
// v1.0.0 of this file scored the OPPOSITE thesis: it paid up to 15 points for "reach without
// ownership", i.e. big streaming numbers and no email list, on the theory that such an artist
// is the most CRWN-shaped lead in the funnel. Under the avatar that same profile is a RED FLAG
// ("huge streaming numbers but almost no social engagement", "no evidence they've ever tried to
// sell anything"). The bonus is gone and its sign is inverted into a penalty. Meanwhile the
// single most predictive field, `monetization_status`, was already being collected and never
// read by the scorer at all.
//
// The repo's platform-CRM score (computeLeadScore in /api/cron/platform-crm) scores POST-signup
// artists on product usage; it has no notion of a pre-signup lead, so it cannot be reused here.

import type { LeadProfileValues } from './toolAdapters';
import type { LeadScore, ScoreBand } from './types';

export const SCORE_VERSION = '2.0.0';

/** Behavior we observed, as opposed to what the artist told us. Actions beat claims. */
export interface ScoreBehavior {
  resultViewed: boolean;
  resultRecalculated: boolean;
  accountClaimed: boolean;
  setupStarted: boolean;
  setupCompleted: boolean;
  leadMagnetsCompleted: number;
  returnVisit: boolean;
  bookedCall: boolean;
}

export const EMPTY_BEHAVIOR: ScoreBehavior = {
  resultViewed: false,
  resultRecalculated: false,
  accountClaimed: false,
  setupStarted: false,
  setupCompleted: false,
  leadMagnetsCompleted: 0,
  returnVisit: false,
  bookedCall: false,
};

export interface ScoreInput {
  profile: LeadProfileValues;
  behavior: ScoreBehavior;
  /** Claude's advisory signal, already clamped to 0..20 by decisionSchema. */
  claudeSignal?: number | null;
}

/**
 * One weighted dimension of the avatar.
 *
 * `known` is the important part. A dimension we have no data for contributes to NEITHER the
 * numerator nor the denominator of the fit, so a lead is scored on what we actually know about
 * them instead of being silently punished for a question we never asked. A `monetization_status`
 * of 'none' is known and scores zero: that is a real answer, not a missing one.
 */
interface Dimension {
  points: number;
  max: number;
  known: boolean;
}

const MONETIZATION_POINTS: Record<string, number> = {
  direct_established: 40,
  direct_some: 30,
  merch_only: 22,
  streaming_only: 4,
  none: 0,
};

export function scoreLead(input: ScoreInput): LeadScore {
  const p = input.profile;
  const b = input.behavior;
  const components: Record<string, number> = {};
  const reasons: string[] = [];
  // `extra` fields reach this function two ways: rescore passes the RAW lead_profiles row (extra
  // is a jsonb column), while loadProfile flattens the same keys onto the top level. Read both,
  // or the engagement dimension silently scores zero on one of the two paths.
  const extraCol = (p.extra ?? {}) as Record<string, unknown>;
  const flat = p as unknown as Record<string, unknown>;
  const extra = { ...flat, ...extraCol };

  // ---- 1. Direct monetization history (weight 40). THE AVATAR'S TOP PREDICTOR. ----
  //
  // Every path to this dimension is evidence of the same thing: this artist has already
  // convinced fans to hand over money outside of streaming, so they do not need to be sold on
  // the premise before they can be sold the product. Highest available evidence wins.
  const monetization = ((): Dimension => {
    const status = str(p.monetization_status);
    const revenue = num(p.direct_fan_revenue_cents);
    const list = num(p.email_list_size);
    const ownership = str(p.fan_ownership_maturity);
    let points = 0;
    let known = false;

    if (status && status in MONETIZATION_POINTS) {
      known = true;
      points = MONETIZATION_POINTS[status];
    }
    // Reported dollars beat a self-selected label.
    if (revenue > 0) {
      known = true;
      points = Math.max(points, revenue >= 100_000 ? 40 : revenue >= 20_000 ? 32 : 24);
    }
    // An email or SMS list is not revenue, but it is the clearest proof that an artist already
    // understands owning the fan relationship. Capped below "actually sold something".
    if (list > 0) {
      known = true;
      points = Math.max(points, list >= 1_000 ? 24 : list >= 250 ? 16 : 8);
    }
    if (ownership) {
      known = true;
      points = Math.max(points, ownership === 'owned_list' ? 24 : ownership === 'partial_list' ? 16 : 4);
    }
    return { points, max: 40, known };
  })();
  components.monetization = monetization.points;
  if (monetization.points >= 30) reasons.push('direct_monetization_proven');
  else if (monetization.known && monetization.points <= 5) reasons.push('no_direct_sales_evidence');

  // ---- 2. Audience size (weight 25) ----
  //
  // Avatar bands, not the old ones. Tier 1 starts at 250k followers or 100k monthly listeners,
  // which is where v1 topped OUT. Either number can carry the band: an artist can be huge on
  // Instagram and mid on Spotify, and the avatar counts both.
  const listeners = num(p.monthly_listeners);
  const followers = num(p.social_followers);
  const tier1Audience = followers >= 250_000 || listeners >= 100_000;
  const tier2Audience = followers >= 50_000 || listeners >= 20_000;
  const audience: Dimension = {
    points: tier1Audience ? 25 : tier2Audience ? 15 : listeners > 0 || followers > 0 ? 5 : 0,
    max: 25,
    known: listeners > 0 || followers > 0,
  };
  components.audience = audience.points;
  if (tier1Audience) reasons.push('tier1_audience');

  // ---- 3. Engagement (weight 20) ----
  //
  // "More important than raw followers." An artist whose fans show up (comments, DMs, live
  // viewers) converts; one with a dead 2M does not. `engagement_level` lives in lead_profiles
  // .extra and is Claude-extractable from the DM, so this fills in over a conversation rather
  // than needing its own form.
  const engagement = ((): Dimension => {
    const level = str(extra.engagement_level);
    const team = str(p.team_status);
    let points = 0;
    let known = false;
    if (level) {
      known = true;
      points = level === 'high' ? 20 : level === 'moderate' ? 12 : 4;
    }
    // "Has a manager" is one of the avatar's green flags: someone is minding the fanbase.
    if (team && team !== 'solo') {
      known = true;
      points = Math.max(points, 10);
    }
    return { points, max: 20, known };
  })();
  components.engagement = engagement.points;

  // ---- 4. Catalog depth (weight 15) ----
  //
  // "More inventory to monetize." The avatar counts RELEASED songs (40+ to clear the filter),
  // so song_count leads. catalog_size is UNRELEASED work: real Vault inventory, but weaker
  // evidence of a career, so it caps lower. Three years of releasing is the avatar's hard
  // filter and is scored here as the depth signal it is.
  const catalog = ((): Dimension => {
    const songs = num(p.song_count);
    const unreleased = num(p.catalog_size);
    const albums = num(p.album_count);
    const years = num(extra.years_releasing);
    let points = 0;
    let known = songs > 0 || unreleased > 0 || albums > 0 || years > 0;
    if (songs > 0) points = songs >= 40 ? 15 : songs >= 20 ? 10 : songs >= 5 ? 5 : 2;
    if (unreleased > 0) points = Math.max(points, unreleased >= 40 ? 8 : unreleased >= 20 ? 5 : 2);
    if (albums >= 3) points = Math.max(points, 10);
    if (years >= 3) points = Math.max(points, 10);
    known = known || years > 0;
    if (songs >= 40) reasons.push('deep_catalog');
    return { points, max: 15, known };
  })();
  components.catalog = catalog.points;

  // ---- Fit: the four weighted dimensions, prorated over what we know ----
  const dims = [monetization, audience, engagement, catalog].filter((d) => d.known);
  const earned = dims.reduce((s, d) => s + d.points, 0);
  const available = dims.reduce((s, d) => s + d.max, 0);
  let fit = available > 0 ? Math.round((earned / available) * 100) : 0;
  // A lead we have never asked the monetization question is NOT a perfect fit just because the
  // one thing we do know looks good. The dominant dimension is missing, so the fit is capped
  // until we learn it. This is the difference between "qualified" and "not yet disqualified".
  if (!monetization.known) {
    fit = Math.min(fit, 60);
    reasons.push('monetization_unknown');
  }
  components.fit = fit;

  // ---- Red flag: reach without proof ----
  //
  // The exact profile v1 paid 15 points for. Big numbers, nothing ever sold, no list. The
  // avatar calls this a red flag, so it costs points instead of earning them.
  const reachWithoutProof = tier1Audience && monetization.known && monetization.points <= 5;
  components.reachPenalty = reachWithoutProof ? -12 : 0;
  if (reachWithoutProof) reasons.push('reach_without_proof');

  // ---- Below the ICP floor ----
  //
  // Under 50k followers AND under 20k listeners. These artists can succeed on CRWN; the problem
  // is economics, because they need education, onboarding and coaching that make them expensive
  // to acquire. Recorded here and enforced in the band, not by zeroing the score.
  const belowFloor = audience.known && !tier2Audience;
  if (belowFloor) reasons.push('below_icp_floor');

  // ---- Goal + blocker alignment (max 8, penalty to -10) ----
  //
  // `make_first_dollar` is no longer a good goal. It is an honest goal, and it describes a Tier
  // 3 artist we decided to serve later, so it earns nothing rather than the +8 it used to.
  const goal = str(p.primary_goal);
  const goodGoal = ['own_my_fanbase', 'scale_existing_revenue', 'replace_day_job'].includes(goal);
  const goodBlocker = ['audience_wont_pay', 'no_product', 'platform_dependency', 'pricing_uncertainty'].includes(
    str(p.primary_blocker),
  );
  const badBlocker = str(p.primary_blocker) === 'no_audience';
  components.alignment = (goodGoal ? 4 : 0) + (goodBlocker ? 4 : 0);
  if (goal === 'make_first_dollar') reasons.push('goal_is_first_dollar');
  if (badBlocker) {
    components.alignment -= 10;
    reasons.push('blocker_is_audience_not_monetization');
  }
  if (goodGoal && goodBlocker) reasons.push('strong_fit');

  // ---- Behavior (max 20) ----
  // What someone DID is worth more than what they said, every time.
  let behavior = 0;
  if (b.resultViewed) behavior += 4;
  if (b.resultRecalculated) behavior += 4; // they engaged with the model, not just glanced
  if (b.accountClaimed) behavior += 5;
  if (b.setupStarted) behavior += 3;
  if (b.setupCompleted) behavior += 4;
  if (b.leadMagnetsCompleted > 1) behavior += 2;
  if (b.returnVisit) behavior += 2;
  components.behavior = Math.min(behavior, 20);
  if (b.resultRecalculated) reasons.push('engaged_with_result');
  if (b.setupCompleted) reasons.push('completed_setup');

  // ---- Claude's advisory signal (max 20, but scaled down) ----
  // Bounded AND scaled: even a perfect 20 from Claude only moves the score by 10. The model
  // gets a vote, not a veto.
  const signal = Math.min(Math.max(num(input.claudeSignal), 0), 20);
  components.aiSignal = Math.round(signal / 2);

  // Fit carries 70 of the 100 points. Who they are dominates; what they have done with CRWN so
  // far, and how well their stated goal matches the product, fill the rest.
  const raw =
    Math.round(fit * 0.7) + components.behavior + components.alignment + components.aiSignal + components.reachPenalty;
  const total = Math.min(Math.max(Math.round(raw), 0), 100);

  const band: ScoreBand = bandFor({
    total,
    bookedCall: b.bookedCall,
    tier1Audience,
    monetizationPoints: monetization.points,
    belowFloor,
    blockerIsAudience: badBlocker,
  });
  if (b.bookedCall) reasons.push('booked_call');

  return { total, version: SCORE_VERSION, band, components, reasonCodes: reasons };
}

/**
 * Bands. Conservative by design: it is cheaper to nurture someone who was ready than to
 * hard-sell someone who was not.
 */
function bandFor(x: {
  total: number;
  bookedCall: boolean;
  tier1Audience: boolean;
  monetizationPoints: number;
  belowFloor: boolean;
  blockerIsAudience: boolean;
}): ScoreBand {
  // Booking a call is a hard override. Someone who put time on the calendar is a sales lead
  // regardless of what the arithmetic says about their follower count.
  if (x.bookedCall) return 'sales_priority';

  // The avatar's Tier 1, stated directly: a real audience AND proof they have sold to it.
  // "These are the artists I'd build the company around." They do not need to clear a
  // numeric threshold assembled from partial data to get a human.
  if (x.tier1Audience && x.monetizationPoints >= 30) return 'sales_priority';

  // Tier 3. Not a no, a not-yet: nurture them cheaply and never spend sales time.
  if (x.belowFloor) return x.total >= 25 ? 'nurture' : 'unqualified';

  // Not a CRWN problem yet. Nurture honestly rather than sell them a monetization tool for
  // an audience problem.
  if (x.blockerIsAudience && x.total < 60) return 'nurture';

  if (x.total >= 70) return 'sales_priority';
  if (x.total >= 45) return 'self_serve';
  if (x.total >= 22) return 'nurture';
  return 'unqualified';
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
