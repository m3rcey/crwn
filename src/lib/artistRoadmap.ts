// artistRoadmap.ts — the personalized artist roadmap (Launch Wizard Stage 6,
// docs/ARTIST_LAUNCH_WIZARD.md; spec Phase 4).
//
// A 5-stage execution plan (Foundation → Private launch → Audience launch →
// Deliver and retain → Expand) that answers ONE question: "what do I do next?"
// It is NOT a feature list and NOT a second progression system:
//  - Step completion is DERIVED from the same authoritative DomainChecks the
//    Quest Engine's evaluator runs (plus three Promise Calendar facts the
//    evaluator does not know). Nothing here is stored or client-asserted, so
//    the roadmap can never disagree with the quests. XP continues to flow
//    through the Quest Engine when the underlying action completes.
//  - This module is PURE (structure + assembly); the evaluation happens in
//    /api/artist/roadmap, which feeds results back into assembleRoadmap().
//
// Personalization inputs kept deliberately light (what CRWN actually has):
// the artist's public slug (share links) and the monthly goal from their own
// claimed calculator (the Expand stage's MRR milestone). Weekly availability /
// platforms are not collected anywhere yet, so no step pretends to use them.

import type { DomainCheck } from '@/lib/quests/types';

/** Promise Calendar facts the quest evaluator has no DomainCheck for. */
export type RoadmapFact = 'promises_scheduled' | 'promises_completed' | 'promises_on_track';

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

/**
 * The five stages, personalized by slug (share destinations) and the monthly
 * goal the artist's own calculator modeled. Steps reference EXISTING DomainChecks
 * by exact name; adding a step means picking (or first building) its check.
 */
export function buildRoadmapDefs(opts: {
  slug?: string | null;
  goalMonthlyCents?: number | null;
}): RoadmapStageDef[] {
  const share = opts.slug ? `/${opts.slug}` : '/account/profile';
  const goal =
    typeof opts.goalMonthlyCents === 'number' && opts.goalMonthlyCents > 0
      ? Math.round(opts.goalMonthlyCents)
      : DEFAULT_GOAL_MONTHLY_CENTS;

  return [
    {
      key: 'foundation',
      title: 'Foundation',
      goal: 'Make the system real: page, offers, payments, promises.',
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
          key: 'foundation-stripe',
          label: 'Connect Stripe',
          detail: 'Fans cannot pay you without it. Five minutes, once.',
          href: '/account/payouts',
          source: { kind: 'check', check: 'artist_stripe_connected' },
        },
        {
          key: 'foundation-content',
          label: 'Put music on your page',
          detail: 'At least one track. A silent page converts nobody.',
          href: '/studio/music',
          source: { kind: 'check', check: 'artist_has_track' },
        },
        {
          key: 'foundation-promises',
          label: 'Get your promises on the calendar',
          detail: 'Your tier benefits become dated, scheduled promises so nothing slips.',
          href: '/studio/promise',
          source: { kind: 'fact', fact: 'promises_scheduled' },
        },
      ],
    },
    {
      key: 'private-launch',
      title: 'Private launch',
      goal: 'Prove it with the people who already love you.',
      steps: [
        {
          key: 'private-checkout',
          label: 'Make a paid tier purchasable',
          detail: 'A tier with a real Stripe price behind it. Verify money can actually move.',
          href: '/account/tiers',
          source: { kind: 'check', check: 'artist_tier_purchasable' },
        },
        {
          key: 'private-welcome-post',
          label: 'Publish your welcome post',
          detail: 'The first thing a joining fan sees. An empty community reads as abandoned.',
          href: '/community',
          source: { kind: 'check', check: 'artist_has_community_post' },
        },
        {
          key: 'private-first-10',
          label: 'Invite your first 10 fans',
          detail: 'Ten trusted fans through the free front door. Send your link directly, one at a time.',
          href: share,
          source: { kind: 'check', check: 'artist_free_supporter_count', count: 10 },
        },
        {
          key: 'private-first-money',
          label: 'First dollar in',
          detail: 'One real purchase or membership. It proves the system end to end.',
          href: share,
          source: { kind: 'check', check: 'artist_revenue_milestone', count: 100 },
        },
      ],
    },
    {
      key: 'audience-launch',
      title: 'Audience launch',
      goal: 'Bring over the audience you already own.',
      steps: [
        {
          key: 'audience-contacts',
          label: 'Import your fan contacts',
          detail: 'The fans scattered across your other platforms become a list you own.',
          href: '/studio/fans',
          source: { kind: 'check', check: 'artist_has_fan_contacts' },
        },
        {
          key: 'audience-announce',
          label: 'Send your launch announcement',
          detail: 'Your imported fans cannot join a page they never heard about.',
          href: '/campaign-hub',
          source: { kind: 'check', check: 'artist_sent_campaign' },
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
