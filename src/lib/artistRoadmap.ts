// artistRoadmap.ts — the personalized artist roadmap (Launch Wizard Stage 6,
// docs/ARTIST_LAUNCH_WIZARD.md; spec Phase 4).
//
// A 5-stage execution plan (Foundation → First revenue → Audience launch →
// Deliver and retain → Expand) that answers ONE question: "what do I do next?"
// It is NOT a feature list and NOT a second progression system:
//  - Step completion is DERIVED from the same authoritative DomainChecks the
//    Quest Engine's evaluator runs (plus a few facts the evaluator does not
//    know). Nothing here is stored or client-asserted, so the roadmap can never
//    disagree with the quests. XP continues to flow through the Quest Engine
//    when the underlying action completes.
//  - This module is PURE (structure + assembly); the evaluation happens in
//    /api/artist/roadmap, which feeds results back into assembleRoadmap().
//
// LAUNCH READINESS IS FUNNEL-CENTRIC (founder decision D1, 2026-09-03). An artist is not
// launch-ready because their public page exists. The stage between setup and first paid is
// the working revenue machine: offer, magnet, sales experience, follow-up, payments, the
// switch, a test, a shareable link. Every step opens a guided flow (src/lib/guidedSetup/flows.ts)
// that already knows why the artist arrived, and completes from canonical state: the ONE funnel
// object (fan_automations), the tiers, the Tier Offer Experience, the sequence, Stripe.
// "Page published" remains a Foundation prerequisite; it is not the definition of launch.
//
// Personalization inputs kept deliberately light (what CRWN actually has):
// the artist's public slug (share links) and the monthly goal from their own
// claimed calculator (the Expand stage's MRR milestone). Weekly availability /
// platforms are not collected anywhere yet, so no step pretends to use them.

import type { DomainCheck } from '@/lib/quests/types';
import { guidedFlowHref } from '@/lib/guidedSetup/flows';

/**
 * Facts the quest evaluator has no DomainCheck for.
 *   promises_*     Promise Calendar reads (fan promises only, never the Revenue Ramp).
 *   funnel_tested  every launch and truth check in funnelReadiness passes AND the artist
 *                  acknowledged the two observations only they can make (the manual
 *                  artist_funnel_tested quest). Acknowledgement never substitutes for state.
 *   funnel_launched the artist put the funnel link into the world: a distribution action
 *                  recorded as the existing fan_invited funnel event with a funnel method.
 *   first_paid     the canonical first_paid_conversion event, or (for artists paid before
 *                  that event existed) real net revenue through the same rails.
 */
export type RoadmapFact =
  | 'promises_scheduled'
  | 'promises_completed'
  | 'promises_on_track'
  | 'funnel_tested'
  | 'funnel_launched'
  | 'first_paid';

export type RoadmapStepSource =
  | { kind: 'check'; check: DomainCheck; count?: number }
  | { kind: 'fact'; fact: RoadmapFact };

export interface RoadmapStepDef {
  key: string;
  label: string;
  /** One plain sentence: what doing it gets them, or what skipping it costs. */
  detail: string;
  /** Where the artist actually does it (a real route, never a made-up one). */
  href: string;
  source: RoadmapStepSource;
}

export interface RoadmapStageDef {
  key: string;
  title: string;
  /** The stage's one-line job, artist-facing. */
  goal: string;
  steps: RoadmapStepDef[];
}

export interface RoadmapStepResult {
  done: boolean;
  current: number;
  target: number;
}

export type RoadmapStep = RoadmapStepDef & RoadmapStepResult;

export interface RoadmapStage extends Omit<RoadmapStageDef, 'steps'> {
  steps: RoadmapStep[];
  done: boolean;
  doneCount: number;
  total: number;
}

export interface ArtistRoadmap {
  stages: RoadmapStage[];
  /** First stage with work left (or the last stage when everything is done). */
  currentStageIndex: number;
  currentStageKey: string;
  /** The one next move. Null only when every step of every stage is done. */
  nextStep: RoadmapStep | null;
  /** Overall completion across all steps, 0-100. */
  progressPercent: number;
  goalMonthlyCents: number;
}

/** Expand-stage MRR milestone when the artist has no claimed calculator goal: $500/mo. */
export const DEFAULT_GOAL_MONTHLY_CENTS = 50000;

/** The stage keys, in order. Pinned by artistRoadmap.test.ts. */
export const ROADMAP_STAGE_KEYS = ['foundation', 'first-revenue', 'audience-launch', 'deliver-retain', 'expand'] as const;

/**
 * The five stages, personalized by slug (share destinations) and the monthly
 * goal the artist's own calculator modeled. Steps reference EXISTING DomainChecks
 * by exact name; adding a step means picking (or first building) its check.
 */
export function buildRoadmapDefs(opts: {
  /** Kept for callers; every step now has a real door, so the public page is no longer a destination. */
  slug?: string | null;
  goalMonthlyCents?: number | null;
}): RoadmapStageDef[] {
  const goal =
    typeof opts.goalMonthlyCents === 'number' && opts.goalMonthlyCents > 0
      ? Math.round(opts.goalMonthlyCents)
      : DEFAULT_GOAL_MONTHLY_CENTS;

  return [
    {
      key: 'foundation',
      title: 'Foundation',
      goal: 'Make the page real: profile, a free door, a paid tier, music, your list.',
      steps: [
        {
          key: 'foundation-profile',
          label: 'Complete your public profile',
          detail: 'Tagline, banner, and bio. Fans decide in seconds; an empty page is a closed door.',
          href: '/account/profile',
          source: { kind: 'check', check: 'artist_profile_complete' },
        },
        {
          key: 'foundation-front-door',
          label: 'Open the free front door',
          detail: 'A $0 tier every new fan can join. No front door, no list.',
          href: '/account/tiers',
          source: { kind: 'check', check: 'artist_has_free_tier' },
        },
        {
          key: 'foundation-paid-offer',
          label: 'Have a paid tier live',
          detail: 'Until a paid tier exists, support has nowhere to land.',
          href: '/account/tiers',
          source: { kind: 'check', check: 'artist_has_paid_offer' },
        },
        {
          key: 'foundation-content',
          label: 'Put music on your page',
          detail: 'At least one track. A silent page converts nobody.',
          href: '/studio/music',
          source: { kind: 'check', check: 'artist_has_track' },
        },
        {
          // Deliberately BEFORE the launch stages (2026-08-06): you cannot invite your warmest
          // fans if the list of them does not exist yet. The import is foundation work.
          key: 'audience-contacts',
          label: 'Import your fan contacts',
          detail: 'The fans scattered across your other platforms become a list you own. Your launch invites the warmest of them.',
          // Opens the Fan CRM with the import dialog already up: the importer is a button inside
          // the fans table, and "go to the Fan CRM and find Import" is a step CRWN can spend.
          href: '/studio/fans?import=1',
          source: { kind: 'check', check: 'artist_has_fan_contacts' },
        },
      ],
    },
    {
      // The revenue machine, in the order a stranger meets it. Every configuration step opens
      // a guided flow; the two outcomes (tested, first paid) are observed, never asserted.
      key: 'first-revenue',
      title: 'First revenue',
      goal: 'Build the machine that turns a stranger into a paying fan, then turn it on.',
      steps: [
        {
          key: 'revenue-offer',
          label: 'Build your offer',
          detail: 'A paid tier that promises real things CRWN can deliver. A price with nothing behind it sells nothing.',
          href: guidedFlowHref('offer'),
          source: { kind: 'check', check: 'artist_tier_has_benefits' },
        },
        {
          key: 'revenue-magnet',
          label: 'Give fans something worth joining for',
          detail: 'A track or a file a fan gets the moment they join free. Without it, your link asks for an email and offers nothing.',
          href: guidedFlowHref('magnet'),
          source: { kind: 'check', check: 'artist_has_lead_magnet' },
        },
        {
          key: 'revenue-experience',
          label: 'Show fans why the paid tier is worth it',
          detail: 'A sales page that shows what members get. A compact card asks fans to imagine it, and most will not.',
          href: guidedFlowHref('experience'),
          source: { kind: 'check', check: 'artist_offer_experience_live' },
        },
        {
          key: 'revenue-followup',
          label: 'Follow up with fans who do not buy yet',
          detail: 'A few messages to everyone who joins free, stopping the moment they buy. Silence after the join is where most fans are lost.',
          href: guidedFlowHref('followup'),
          source: { kind: 'check', check: 'artist_funnel_nurture_active' },
        },
        {
          key: 'revenue-stripe',
          label: 'Get paid to your own account',
          detail: 'Fans cannot pay you without it. Five minutes, once.',
          // /account/tiers, NOT /account/payouts. The ONLY Connect Stripe control in the product
          // (with its Artist Agreement gate) lives in TierManager; the payouts screen shows an
          // unconnected artist "$0.00, no earnings yet" and no way to fix it.
          href: guidedFlowHref('stripe'),
          source: { kind: 'check', check: 'artist_stripe_connected' },
        },
        {
          key: 'revenue-live',
          label: 'Turn it on',
          detail: 'One confirmation and your link goes live: join free, get the gift, see the offer.',
          href: guidedFlowHref('funnel'),
          source: { kind: 'check', check: 'artist_funnel_live' },
        },
        {
          key: 'revenue-tested',
          label: 'Test it',
          detail: 'CRWN checks every piece it can see; you check the two it cannot. Sending people to a broken link costs them, not you.',
          href: guidedFlowHref('test'),
          source: { kind: 'fact', fact: 'funnel_tested' },
        },
        {
          key: 'revenue-launched',
          label: 'Launch it',
          detail: 'Put the link where your fans already are. A funnel nobody can reach earns nothing.',
          href: guidedFlowHref('launch'),
          source: { kind: 'fact', fact: 'funnel_launched' },
        },
        {
          key: 'revenue-first-paid',
          label: 'Get your first paid fan',
          detail: 'One real membership or sale. A live funnel is setup; member one paying is the launch.',
          href: guidedFlowHref('launch'),
          source: { kind: 'fact', fact: 'first_paid' },
        },
      ],
    },
    {
      key: 'audience-launch',
      title: 'Audience launch',
      goal: 'Bring over the audience you already own.',
      steps: [
        {
          key: 'audience-announce',
          label: 'Send your launch announcement',
          detail: 'Your imported fans cannot join a page they never heard about. The Launch Kit writes it for you.',
          href: '/studio/fans?view=campaigns',
          source: { kind: 'check', check: 'artist_sent_campaign' },
        },
        {
          key: 'audience-first-10',
          label: 'Invite your first 10 fans',
          detail: 'Ten trusted fans through the free front door. Your imported contacts are the list; start with the warmest, one at a time.',
          href: guidedFlowHref('launch'),
          source: { kind: 'check', check: 'artist_free_supporter_count', count: 10 },
        },
        {
          key: 'audience-share-to-earn',
          label: 'Turn on referrals or Share-to-Earn',
          detail: 'Your fans recruit for you. Reach you do not pay an algorithm for.',
          href: '/account/referrals',
          source: { kind: 'check', check: 'artist_referrals_on' },
        },
      ],
    },
    {
      key: 'deliver-retain',
      title: 'Deliver and retain',
      goal: 'Keep every promise. A kept promise is a renewed subscription.',
      steps: [
        {
          key: 'deliver-first-promise',
          label: 'Deliver your first promise',
          detail: 'Mark the first calendar promise complete. Fans renew for what arrives.',
          href: '/studio/promise',
          source: { kind: 'fact', fact: 'promises_completed' },
        },
        {
          key: 'deliver-welcome-post',
          label: 'Publish your welcome post',
          detail: 'The first thing a joining fan sees. An empty community reads as abandoned.',
          href: '/community',
          source: { kind: 'check', check: 'artist_has_community_post' },
        },
        {
          key: 'deliver-on-track',
          label: 'Stay ahead of your promise calendar',
          detail: 'Nothing overdue. A missed promise costs more than a late one earns.',
          href: '/studio/promise',
          source: { kind: 'fact', fact: 'promises_on_track' },
        },
        {
          key: 'deliver-members-post',
          label: 'Post something members-only',
          detail: 'Paying fans need to see the inside is different from the outside.',
          href: '/community',
          source: { kind: 'check', check: 'artist_members_post_count', count: 1 },
        },
        {
          key: 'deliver-retention',
          label: 'Keep supporters past their first month',
          detail: 'A supporter who renews once is the real business starting.',
          href: '/community',
          source: { kind: 'check', check: 'artist_retention_cycle' },
        },
      ],
    },
    {
      key: 'expand',
      title: 'Expand',
      goal: 'Grow what works: more of the ladder, more of the catalog, the next offer.',
      steps: [
        {
          key: 'expand-ladder',
          label: 'Complete your paid ladder',
          detail: 'Every rung your plan allows. One tier leaves money on the table at both ends.',
          href: '/account/tiers',
          source: { kind: 'check', check: 'artist_ladder_complete' },
        },
        {
          key: 'expand-product',
          label: 'Add a product or experience',
          detail: 'A second way to say yes for fans who want more than a membership.',
          href: '/studio/shop',
          source: { kind: 'check', check: 'artist_has_product' },
        },
        {
          key: 'expand-campaign',
          label: 'Run a campaign to a close',
          detail: 'Launch one campaign and finish it. Closed campaigns teach; open ones drift.',
          href: '/campaign-hub',
          source: { kind: 'check', check: 'artist_campaign_closed' },
        },
        {
          key: 'expand-mrr',
          label: 'Reach your monthly goal',
          detail: 'The number your calculator modeled, now measured against real recurring revenue.',
          href: '/studio/analytics',
          source: { kind: 'check', check: 'artist_mrr_milestone', count: goal },
        },
      ],
    },
  ];
}

/** Every step's default target when no result arrives (fails safe to "not done"). */
function defaultResult(def: RoadmapStepDef): RoadmapStepResult {
  const target = def.source.kind === 'check' ? def.source.count ?? 1 : 1;
  return { done: false, current: 0, target };
}

/**
 * Combine the stage structure with evaluated step results into the roadmap.
 * Pure: same inputs, same roadmap. Missing results count as not-done.
 */
export function assembleRoadmap(
  defs: RoadmapStageDef[],
  results: Record<string, RoadmapStepResult | undefined>,
  goalMonthlyCents?: number | null,
): ArtistRoadmap {
  const stages: RoadmapStage[] = defs.map((stage) => {
    const steps: RoadmapStep[] = stage.steps.map((def) => ({
      ...def,
      ...(results[def.key] ?? defaultResult(def)),
    }));
    const doneCount = steps.filter((s) => s.done).length;
    return {
      key: stage.key,
      title: stage.title,
      goal: stage.goal,
      steps,
      doneCount,
      total: steps.length,
      done: doneCount === steps.length,
    };
  });

  const firstOpen = stages.findIndex((s) => !s.done);
  const currentStageIndex = firstOpen === -1 ? stages.length - 1 : firstOpen;
  const nextStep = firstOpen === -1 ? null : stages[firstOpen].steps.find((s) => !s.done) ?? null;

  const totalSteps = stages.reduce((n, s) => n + s.total, 0);
  const doneSteps = stages.reduce((n, s) => n + s.doneCount, 0);

  return {
    stages,
    currentStageIndex,
    currentStageKey: stages[currentStageIndex]?.key ?? 'foundation',
    nextStep,
    progressPercent: totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0,
    goalMonthlyCents:
      typeof goalMonthlyCents === 'number' && goalMonthlyCents > 0
        ? Math.round(goalMonthlyCents)
        : DEFAULT_GOAL_MONTHLY_CENTS,
  };
}
