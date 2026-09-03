// revenueRamp.ts — how long the calculator's number actually takes, and the dated
// steps that get there. PURE and client-safe (no supabase, no server imports).
//
// WHY THIS EXISTS
// The Streaming Loss calculator hands an artist a steady-state number: what they would
// net per month once the recommended ladder is built AND the superfan slice of their
// audience has actually converted. It says nothing about WHEN. An artist who reads it as
// "next month" churns in week three; an artist with no map gets there in three years or
// never. Both cost CRWN the fee on money that was always available.
//
// THE MODEL
// The number is not a launch, it is a saturation curve. Three things gate it and nothing
// else does:
//
//   1. The offer must exist before a single fan can pay. Days, not months, and every day
//      spent here is a day at zero.
//   2. Awareness saturates slowly. One post reaches a fraction of an audience, so touching
//      the addressable slice takes repeated exposure across weeks, not one announcement.
//   3. The whale tier fills LAST. Early joiners skew to the cheap entry tier, so headcount
//      runs ahead of money for the first two quarters and money catches up only when the
//      depth work (access, customs, live, a la carte) lands. That gap is why phases 4 and 5
//      exist at all, and why an artist who stops at "I launched tiers" plateaus near half.
//
// Twelve months to the full number. Roughly half of it by month six. First dollar inside
// three weeks. Steps marked `accelerator` are the compression levers: run all of them on
// time and the same curve lands nearer month eight, because each one buys reach the artist
// does not have to generate themselves (a founding deadline pulls demand forward, referrals
// and clip bounties put fans to work on acquisition).
//
// Every step points at a route that exists today. Do not add a step for a dark-launched
// feature: a roadmap that sends an artist to a door that will not open is worse than no
// roadmap. Live tips and Executive Producer sessions belong here the day their flags flip.

import { getAssumptions } from './leadCalculator';

export type RampPhaseKey =
  | 'foundation'
  | 'founding_window'
  | 'rhythm'
  | 'fan_engine'
  | 'depth'
  | 'retention';

export interface RampPhaseDef {
  key: RampPhaseKey;
  name: string;
  startDay: number;
  endDay: number;
  /** Share of the calculator's MONTHLY number expected by the end of this phase (0-1). */
  mrrPct: number;
  /** Share of the eventual paying-supporter count by the end of this phase (0-1). */
  payerPct: number;
  /** What the artist is actually doing in this phase. */
  focus: string;
  /** What they should expect to see, so a slow week does not read as failure. */
  expect: string;
}

// mrrPct trails payerPct until phase 5 on purpose: see note 3 in the header.
export const RAMP_PHASES: RampPhaseDef[] = [
  {
    key: 'foundation',
    name: 'Foundation',
    startDay: 0,
    endDay: 14,
    mrrPct: 0,
    payerPct: 0,
    focus: 'Build the thing fans pay into. Nothing can be earned until it exists.',
    expect: 'Zero revenue, and that is correct. The only number that matters in these two weeks is how fast you finish.',
  },
  {
    key: 'founding_window',
    name: 'Founding window',
    startDay: 15,
    endDay: 45,
    mrrPct: 0.12,
    payerPct: 0.15,
    focus: 'Convert the fans who were always going to say yes, on a deadline.',
    expect: 'Your biggest single spike of the year. The fans who join now are the ones already waiting for a way to pay you.',
  },
  {
    key: 'rhythm',
    name: 'Rhythm',
    startDay: 46,
    endDay: 90,
    mrrPct: 0.26,
    payerPct: 0.32,
    focus: 'Turn one launch into a repeating reason to stay.',
    expect: 'The spike flattens and that is normal. This phase is about proving the promise gets kept, month after month.',
  },
  {
    key: 'fan_engine',
    name: 'Fan engine',
    startDay: 91,
    endDay: 180,
    mrrPct: 0.52,
    payerPct: 0.6,
    focus: 'Stop being the only person doing your marketing.',
    expect: 'Growth stops tracking your posting and starts tracking your fans. This is where the curve bends back up.',
  },
  {
    key: 'depth',
    name: 'Depth',
    startDay: 181,
    endDay: 270,
    mrrPct: 0.76,
    payerPct: 0.78,
    focus: 'Sell more to the fans you already converted.',
    expect: 'Headcount slows and money accelerates. The top tier fills here, and it is worth ten entry members.',
  },
  {
    key: 'retention',
    name: 'Retention',
    startDay: 271,
    endDay: 365,
    mrrPct: 1,
    payerPct: 1,
    focus: 'Keep what you built, and stop the leak that caps everything.',
    expect: 'You reach the number by holding the fans you already have. Churn is the only thing that can still take it back.',
  },
];

export interface RampStepDef {
  /** Stable identity. Used for idempotent seeding, so NEVER renumber or reuse a key. */
  key: string;
  phase: RampPhaseKey;
  title: string;
  detail: string;
  /** Days after the ramp starts. */
  dueDay: number;
  href: string;
  /** Maps to fulfillment_events / obligations fulfillment_type. */
  fulfillmentType:
    | 'content_drop'
    | 'livestream'
    | 'event'
    | 'message'
    | 'file_delivery'
    | 'access_unlock'
    | 'manual_task';
  /** Compresses the curve. Skipping these does not stop the ramp, it lengthens it. */
  accelerator?: boolean;
}

export const RAMP_STEPS: RampStepDef[] = [
  // ---- Foundation: days 0-14. Every day here is a day at zero. ----
  {
    key: 'connect_stripe',
    phase: 'foundation',
    title: 'Connect Stripe so fans can actually pay you',
    detail: 'Until this is done every checkout fails. It is the one step with no workaround, so do it first, today.',
    dueDay: 1,
    href: '/account/payouts',
    fulfillmentType: 'manual_task',
  },
  {
    key: 'build_ladder',
    phase: 'foundation',
    title: 'Build the four-tier ladder',
    detail: 'Free, $10, $25, $100. Your number is calculated on this exact ladder: most fans join at the bottom, and the small group at the top pays for everything. One tier at one price leaves most of it uncollected.',
    dueDay: 3,
    href: '/account/tiers',
    fulfillmentType: 'manual_task',
  },
  {
    key: 'stock_vault',
    phase: 'foundation',
    title: 'Put five things behind the paywall',
    detail: 'Unreleased songs, alternate versions, demos, voice memos. You already own these. An empty tier is the fastest way to get cancelled in month two.',
    dueDay: 7,
    href: '/studio/music',
    fulfillmentType: 'content_drop',
  },
  {
    key: 'first_product',
    phase: 'foundation',
    title: 'List one thing fans can buy without subscribing',
    detail: 'Stems, a sample pack, a beat. Some fans will never subscribe and will happily buy once. This line is a fifth of your number and it is the easiest fifth.',
    dueDay: 10,
    href: '/studio/shop',
    fulfillmentType: 'manual_task',
  },
  {
    key: 'point_links',
    phase: 'foundation',
    title: 'Point every link you control at your CRWN page',
    detail: 'Bio, pinned post, email footer, Discord, YouTube description. Traffic you already have is going somewhere that cannot pay you.',
    dueDay: 12,
    href: '/account/profile',
    fulfillmentType: 'manual_task',
  },
  {
    key: 'set_promises',
    phase: 'foundation',
    title: 'Decide what each paid tier gets every month',
    detail: 'Write the promise before you sell it. This calendar then tells you what you owe and when, which is the difference between a membership and a refund request.',
    dueDay: 14,
    href: '/studio/promise',
    fulfillmentType: 'manual_task',
  },

  // ---- Founding window: days 15-45. The spike. ----
  {
    key: 'open_founder_window',
    phase: 'founding_window',
    title: 'Open a founding window with a cap and an end date',
    detail: 'A membership that is always open is a membership fans join later, which usually means never. A capped founding offer with a deadline is what turns intent into a payment this month.',
    dueDay: 15,
    href: '/account/tiers',
    fulfillmentType: 'access_unlock',
    accelerator: true,
  },
  {
    key: 'announce_launch',
    phase: 'founding_window',
    title: 'Announce it everywhere you post',
    detail: 'One post reaches a small slice of your audience. Assume most of your fans will not see the first announcement, because they will not.',
    dueDay: 16,
    href: '/messages',
    fulfillmentType: 'message',
  },
  {
    key: 'dm_top_fans',
    phase: 'founding_window',
    title: 'Personally message your 50 most engaged fans',
    detail: 'The people who comment on everything and buy every drop. A personal ask converts several times better than a broadcast, and these are the fans who fill the top tier.',
    dueDay: 20,
    href: '/studio/fans',
    fulfillmentType: 'message',
    accelerator: true,
  },
  {
    key: 'first_unlock',
    phase: 'founding_window',
    title: 'Deliver the first supporter-only drop',
    detail: 'Inside the first two weeks of anyone paying. The gap between paying and receiving is where early cancellations come from.',
    dueDay: 28,
    href: '/studio/music',
    fulfillmentType: 'content_drop',
  },
  {
    key: 'second_announce',
    phase: 'founding_window',
    title: 'Post the window closing, twice',
    detail: 'Once at a week left, once on the final day. The last 48 hours of a deadline routinely out-earn the first two weeks of it.',
    dueDay: 40,
    href: '/messages',
    fulfillmentType: 'message',
    accelerator: true,
  },
  {
    key: 'first_live',
    phase: 'founding_window',
    title: 'Go live for supporters only',
    detail: 'The first time a member feels the difference between following you and paying you. Schedule it before the window closes so it is a reason to join now.',
    dueDay: 45,
    href: '/studio/live',
    fulfillmentType: 'livestream',
  },

  // ---- Rhythm: days 46-90. Prove the promise repeats. ----
  {
    key: 'release_waterfall',
    phase: 'rhythm',
    title: 'Put your next release through the waterfall',
    detail: 'Top tier first, then down the ladder, then the DSPs last. This is the single clearest reason to pay you instead of streaming you, and it costs you nothing you were not already releasing.',
    dueDay: 55,
    href: '/studio/music',
    fulfillmentType: 'content_drop',
  },
  {
    key: 'monthly_unlock',
    phase: 'rhythm',
    title: 'Ship the monthly vault unlock',
    detail: 'The promise you sold. Miss it twice and the cancellations start, and a cancelled member almost never comes back.',
    dueDay: 60,
    href: '/studio/music',
    fulfillmentType: 'content_drop',
  },
  {
    key: 'first_mission',
    phase: 'rhythm',
    title: 'Give fans one clear job',
    detail: '"Please support me" is why your fans do nothing. One specific ask, with a number and a reward, is what gets completed.',
    dueDay: 70,
    href: '/missions',
    fulfillmentType: 'manual_task',
  },
  {
    key: 'demand_test',
    phase: 'rhythm',
    title: 'Run a demand test before you make the next big thing',
    detail: 'Find out what your fans will actually pay for before you spend three months making it. A test that fails saves more than one that passes earns.',
    dueDay: 85,
    href: '/proof-of-demand',
    fulfillmentType: 'manual_task',
  },
  {
    key: 'welcome_sequence',
    phase: 'rhythm',
    title: 'Set up the welcome message new supporters get',
    detail: 'It runs once and then works on every future member without you. The first 24 hours after joining decide whether month two happens.',
    dueDay: 90,
    href: '/messages',
    fulfillmentType: 'message',
  },

  // ---- Fan engine: days 91-180. Stop being your only marketer. ----
  {
    key: 'turn_on_referrals',
    phase: 'fan_engine',
    title: 'Turn on fan referrals',
    detail: 'Your fans know people who sound like you. Paying them a cut for bringing supporters is the cheapest acquisition you will ever run, and it compounds while you sleep.',
    dueDay: 95,
    href: '/account/referrals',
    fulfillmentType: 'manual_task',
    accelerator: true,
  },
  {
    key: 'clip_bounty',
    phase: 'fan_engine',
    title: 'Launch a clip bounty',
    detail: 'Pay fans to cut and post your content. Reach you did not have to make, from accounts the algorithm has not already shown your face to.',
    dueDay: 110,
    href: '/bounties',
    fulfillmentType: 'manual_task',
    accelerator: true,
  },
  {
    key: 'road_campaign',
    phase: 'fan_engine',
    title: 'Launch your first Road To campaign',
    detail: 'A public goal fans can move. It converts the fans who will not subscribe for perks but will absolutely fund a mission they believe in.',
    dueDay: 130,
    href: '/campaigns',
    fulfillmentType: 'manual_task',
  },
  {
    key: 'squads',
    phase: 'fan_engine',
    title: 'Put your most active fans in a squad',
    detail: 'The fans already doing the work, named and organized. Recognition costs nothing and it is what keeps a superfan from drifting.',
    dueDay: 150,
    href: '/squads',
    fulfillmentType: 'manual_task',
  },
  {
    key: 'city_unlock',
    phase: 'fan_engine',
    title: 'Run a city unlock',
    detail: 'Make fans in one city prove the demand before you book anything. It turns a touring guess into a pre-validated room, and it makes local fans recruit each other.',
    dueDay: 170,
    href: '/city-unlocks',
    fulfillmentType: 'manual_task',
  },

  // ---- Depth: days 181-270. The top tier fills here. ----
  {
    key: 'premium_access',
    phase: 'depth',
    title: 'Sell access to you, not just to your music',
    detail: 'Voice notes, 1-on-1 calls, custom verses. A handful of fans will pay more for this than a hundred pay for a membership, and they are already on your list.',
    dueDay: 190,
    href: '/offers',
    fulfillmentType: 'event',
  },
  {
    key: 'ticketed_live',
    phase: 'depth',
    title: 'Ticket a live session',
    detail: 'A paid room, not a free one. Fans who buy a ticket show up, and the ones who show up are the ones who upgrade.',
    dueDay: 210,
    href: '/studio/live',
    fulfillmentType: 'livestream',
  },
  {
    key: 'expand_shop',
    phase: 'depth',
    title: 'Expand the shop to five products',
    detail: 'Stems, sample packs, presets, loop kits. This is the a la carte line in your number, and it is the part that does not depend on anyone subscribing.',
    dueDay: 230,
    href: '/studio/shop',
    fulfillmentType: 'manual_task',
  },
  {
    key: 'upgrade_push',
    phase: 'depth',
    title: 'Ask your entry-tier members to move up',
    detail: 'They already pay you. The top tier is the last part of your number to fill, and the people most likely to fill it are the ones who have been in the room for six months.',
    dueDay: 250,
    href: '/messages',
    fulfillmentType: 'message',
    accelerator: true,
  },
  {
    key: 'team_splits',
    phase: 'depth',
    title: 'Put your collaborators on splits',
    detail: 'Producers and managers paid automatically from what comes in. Do it before the money is big enough to argue about.',
    dueDay: 265,
    href: '/studio/team',
    fulfillmentType: 'manual_task',
  },

  // ---- Retention: days 271-365. Churn is the only thing that can still take it back. ----
  {
    key: 'winback',
    phase: 'retention',
    title: 'Message everyone who cancelled',
    detail: 'A cancelled member is a fan who is still listening. Ask why, fix the one thing they name, and invite them back.',
    dueDay: 280,
    href: '/studio/fans',
    fulfillmentType: 'message',
  },
  {
    key: 'promise_audit',
    phase: 'retention',
    title: 'Audit every promise you sold',
    detail: 'Anything on this calendar you marked late or never delivered is a cancellation with a delay on it. Fix the ones you keep missing, or stop selling them.',
    dueDay: 300,
    href: '/studio/promise',
    fulfillmentType: 'manual_task',
  },
  {
    key: 'second_founder_window',
    phase: 'retention',
    title: 'Run the founding window again for the top tier',
    detail: 'A year of proof behind you and a different audience than you had in month one. The fans who said no in week three are not the same people now.',
    dueDay: 330,
    href: '/account/tiers',
    fulfillmentType: 'access_unlock',
    accelerator: true,
  },
  {
    key: 'review_numbers',
    phase: 'retention',
    title: 'Recalculate your number with real data',
    detail: 'You now know your actual conversion rate and your actual churn instead of an estimate. Rebuild the plan on what happened, not on what was projected.',
    dueDay: 365,
    href: '/studio/analytics',
    fulfillmentType: 'manual_task',
  },
];

// ---------------------------------------------------------------------------

// Which single step gets pulled to the front for an artist who arrived through a given
// calculator. They came in for one specific thing and saw a number attached to it; making them
// wait three months to build that thing is how the number stops feeling like theirs. Keys are
// the calculator slugs used everywhere else in the funnel (see leadMagnetMissions.ts). Only
// tools that map to a LIVE feature appear here.
export const ENTRY_TOOL_FIRST_MOVE: Record<string, string> = {
  worth: 'build_ladder',
  'vault-revenue-planner': 'stock_vault',
  'share-to-earn-planner': 'turn_on_referrals',
  'live-experience-calculator': 'first_live',
  'own-your-fans-calculator': 'point_links',
  'movement-page-blueprint': 'point_links',
  'fan-mission-generator': 'first_mission',
  'proof-of-demand-test-builder': 'demand_test',
  'clip-to-earn-campaign-planner': 'clip_bounty',
  'founder-window-builder': 'open_founder_window',
};

/** Day the promoted entry step is scheduled: straight after the founding window opens. */
const ENTRY_PROMOTION_DAY = 18;

export interface RampMilestone extends RampPhaseDef {
  startsAt: string; // ISO
  endsAt: string; // ISO
  targetMonthlyCents: number | null;
  targetPayers: number | null;
}

export interface RampStep extends RampStepDef {
  dueAt: string; // ISO
  phaseName: string;
  /** Pulled forward because this is the thing their calculator was about. */
  entryPriority?: boolean;
}

export interface Ramp {
  /** The calculator's steady-state number this ramp is aimed at. Null if unknown. */
  targetMonthlyCents: number | null;
  startedAt: string;
  /** Day the full number is expected on the standard curve. */
  totalDays: number;
  /** Day it lands if every accelerator step is run on time. */
  acceleratedDays: number;
  phases: RampMilestone[];
  steps: RampStep[];
}

/**
 * Net monthly cents a single paying supporter is worth on the recommended ladder.
 *
 * Derived from the calculator's OWN assumptions, never a second copy of the prices: a
 * duplicated price map that feeds arithmetic is how CRWN once overpaid a commission by 5x.
 * If the ladder or the fee changes, this moves with it.
 */
export function netCentsPerPayer(): number {
  const a = getAssumptions('conservative');
  const gross =
    a.tier1Share * a.tier1PriceCents +
    a.tier2Share * a.tier2PriceCents +
    a.tier3Share * a.tier3PriceCents +
    a.alacarteArpuCents;
  return gross * (1 - a.platformFeePercent / 100);
}

const DAY_MS = 86_400_000;

/** The ramp for one artist: dated phases with dollar milestones, and dated steps. */
export function buildRamp(opts: {
  targetMonthlyCents?: number | null;
  startedAt: Date;
  /** Calculator slug they signed up through. Promotes that tool's step to the front. */
  entryTool?: string | null;
}): Ramp {
  const target =
    typeof opts.targetMonthlyCents === 'number' && opts.targetMonthlyCents > 0
      ? Math.round(opts.targetMonthlyCents)
      : null;
  const start = opts.startedAt.getTime();
  const perPayer = netCentsPerPayer();
  const totalPayers = target ? Math.round(target / perPayer) : null;

  const phases: RampMilestone[] = RAMP_PHASES.map((p) => ({
    ...p,
    startsAt: new Date(start + p.startDay * DAY_MS).toISOString(),
    endsAt: new Date(start + p.endDay * DAY_MS).toISOString(),
    targetMonthlyCents: target === null ? null : Math.round(target * p.mrrPct),
    targetPayers: totalPayers === null ? null : Math.round(totalPayers * p.payerPct),
  }));

  const phaseName = new Map(RAMP_PHASES.map((p) => [p.key, p.name]));
  const promotedKey = opts.entryTool ? ENTRY_TOOL_FIRST_MOVE[opts.entryTool] : undefined;

  const steps: RampStep[] = RAMP_STEPS.map((s) => {
    // Promotion never moves a step LATER, and never disturbs Foundation: an artist still cannot
    // sell before Stripe and a ladder exist, whatever they came in for.
    const promote = s.key === promotedKey && s.dueDay > ENTRY_PROMOTION_DAY;
    const dueDay = promote ? ENTRY_PROMOTION_DAY : s.dueDay;
    const phase = promote ? 'founding_window' : s.phase;
    return {
      ...s,
      phase,
      dueDay,
      dueAt: new Date(start + dueDay * DAY_MS).toISOString(),
      phaseName: phaseName.get(phase) ?? '',
      ...(promote ? { entryPriority: true } : {}),
    };
  }).sort((a, b) => a.dueDay - b.dueDay);

  return {
    targetMonthlyCents: target,
    startedAt: opts.startedAt.toISOString(),
    totalDays: 365,
    // Running every accelerator pulls the curve in by about a third. It is a planning
    // figure, not a promise, and it is stated as "nearer month eight" wherever it is shown.
    acceleratedDays: 240,
    phases,
    steps,
  };
}

// ---------------------------------------------------------------------------
// PROGRESS: the next win, not the whole journey.
//
// Artists do not quit because the goal is hard. They quit because the next win feels too far
// away. A game never opens with "you will beat this in 200 hours", it says punch a tree, then
// craft a pickaxe. The destination never moves; only the next rung is ever in focus.
//
// So the ramp ships the arc, and THIS decides what the artist is actually shown: one milestone,
// one next action, and a bar that moves. Everything else stays locked and quiet.
//
// Note what is deliberately NOT here: XP, badges and levels. The Quest Engine already owns
// progression (`src/lib/quests`), it is built and dark. A second levelling system would be two
// sources of truth for the same feeling. The ramp should feed it, never duplicate it.

export interface RampStepState {
  key: string;
  /** As stored on the fulfillment event. */
  status: 'pending' | 'completed' | 'missed' | 'overdue' | 'today' | 'upcoming';
  dueAt: string;
}

export interface RampProgress {
  currentPhaseKey: RampPhaseKey | null;
  /** The single thing to do next. Null once every step is done. */
  nextStep: RampStep | null;
  /** The next step that compresses the timeline, when it is not already `nextStep`. */
  nextAccelerator: RampStep | null;
  stepsDone: number;
  stepsTotal: number;
  phaseStepsDone: number;
  phaseStepsTotal: number;
  /** 0-100. Money-based when we know their MRR, step-based otherwise. */
  phaseProgressPct: number;
  /** 0-100 across the whole year, same rule. */
  overallProgressPct: number;
  currentMrrCents: number | null;
  /** The milestone being worked toward right now. */
  nextMilestoneName: string | null;
  nextMilestoneTargetCents: number | null;
  /** How much further to the next milestone, and in supporters, which is the motivating unit. */
  centsToNextMilestone: number | null;
  supportersToNextMilestone: number | null;
  /** Days late the oldest unfinished step is. 0 when on or ahead of plan. */
  behindDays: number;
  /** Days of runway bought by finishing early. 0 when not ahead. */
  aheadDays: number;
  /** Projected days to the full number given actual pace. */
  projectedTotalDays: number;
  projectedFinishAt: string;
}

/**
 * Where this artist actually is, from what they have completed and what they are earning.
 *
 * Deliberately deterministic. "Adaptive" does not have to mean a model: re-planning from real
 * completion dates and real MRR is adaptive, explainable, and cannot hallucinate a milestone.
 */
export function computeRampProgress(
  ramp: Ramp,
  input: { steps: RampStepState[]; currentMrrCents?: number | null },
  now: Date = new Date(),
): RampProgress {
  const t = now.getTime();
  const byKey = new Map(input.steps.map((s) => [s.key, s]));
  const isDone = (key: string) => byKey.get(key)?.status === 'completed';

  const stepsDone = ramp.steps.filter((s) => isDone(s.key)).length;
  const incomplete = ramp.steps.filter((s) => !isDone(s.key));
  const nextStep = incomplete[0] ?? null;
  const nextAccelerator = incomplete.find((s) => s.accelerator && s.key !== nextStep?.key) ?? null;

  // The phase in play is the one holding the next unfinished step, NOT the one the calendar
  // date says. An artist three weeks behind is still in Founding window, and telling them they
  // are in "Rhythm" while they have not launched is how a plan stops being believed.
  const currentPhaseKey = nextStep?.phase ?? (phaseAt(ramp, now)?.key ?? null);
  const phaseSteps = ramp.steps.filter((s) => s.phase === currentPhaseKey);
  const phaseStepsDone = phaseSteps.filter((s) => isDone(s.key)).length;

  // Pace. Behind = how late the oldest unfinished step is. Ahead = how far into the future the
  // next unfinished step sits, i.e. runway bought by working early.
  const overdue = incomplete.filter((s) => new Date(s.dueAt).getTime() < t);
  const behindDays = overdue.length
    ? Math.floor((t - Math.min(...overdue.map((s) => new Date(s.dueAt).getTime()))) / DAY_MS)
    : 0;
  const aheadDays =
    !behindDays && nextStep ? Math.max(0, Math.floor((new Date(nextStep.dueAt).getTime() - t) / DAY_MS)) : 0;

  // Re-plan. Slipping pushes the number out; working early pulls it in, floored at the
  // accelerated bound so the projection never promises the impossible.
  const projectedTotalDays = Math.max(
    ramp.acceleratedDays,
    ramp.totalDays + behindDays - Math.min(aheadDays, ramp.totalDays - ramp.acceleratedDays),
  );

  const mrr = typeof input.currentMrrCents === 'number' ? input.currentMrrCents : null;
  const phases = ramp.phases;
  const idx = phases.findIndex((p) => p.key === currentPhaseKey);
  const currentPhase = idx >= 0 ? phases[idx] : null;
  const prevTarget = idx > 0 ? (phases[idx - 1].targetMonthlyCents ?? 0) : 0;
  const phaseTarget = currentPhase?.targetMonthlyCents ?? null;

  // Money moves the bar when we know it and the band is non-zero (Foundation earns nothing by
  // design, so there it stays a step count).
  const moneyBand = phaseTarget !== null && phaseTarget > prevTarget;
  const phaseProgressPct =
    mrr !== null && moneyBand
      ? clampPct(((mrr - prevTarget) / (phaseTarget! - prevTarget)) * 100)
      : phaseSteps.length
        ? clampPct((phaseStepsDone / phaseSteps.length) * 100)
        : 0;

  const overallProgressPct =
    mrr !== null && ramp.targetMonthlyCents
      ? clampPct((mrr / ramp.targetMonthlyCents) * 100)
      : clampPct((stepsDone / ramp.steps.length) * 100);

  const centsToNext = phaseTarget !== null && mrr !== null ? Math.max(0, phaseTarget - mrr) : null;
  const perPayer = netCentsPerPayer();

  return {
    currentPhaseKey: (currentPhaseKey as RampPhaseKey) ?? null,
    nextStep,
    nextAccelerator,
    stepsDone,
    stepsTotal: ramp.steps.length,
    phaseStepsDone,
    phaseStepsTotal: phaseSteps.length,
    phaseProgressPct,
    overallProgressPct,
    currentMrrCents: mrr,
    nextMilestoneName: currentPhase?.name ?? null,
    nextMilestoneTargetCents: phaseTarget,
    centsToNextMilestone: centsToNext,
    supportersToNextMilestone: centsToNext === null ? null : Math.ceil(centsToNext / perPayer),
    behindDays,
    aheadDays,
    projectedTotalDays,
    projectedFinishAt: new Date(new Date(ramp.startedAt).getTime() + projectedTotalDays * DAY_MS).toISOString(),
  };
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Which phase a given date falls in. Null before the start or after day 365. */
export function phaseAt(ramp: Ramp, at: Date = new Date()): RampMilestone | null {
  const t = at.getTime();
  return (
    ramp.phases.find((p) => t >= new Date(p.startsAt).getTime() && t <= new Date(p.endsAt).getTime()) ?? null
  );
}
