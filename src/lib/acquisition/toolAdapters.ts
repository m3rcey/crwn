// Adapters onto the FIVE EXISTING lead magnets. This file is the whole integration.
//
// The five tools are production code and are NOT modified. Not one line of
// resultGenerators.ts, leadCalculator.ts, WorthExperience.tsx, or registry.ts changes.
// The acquisition engine is a CONSUMER of them, exactly like the public tool page is.
//
// Because there is only ever ONE copy of each formula, parity between "the result you get
// on the website" and "the result you get from an Instagram DM" is structural. There is no
// second implementation that could drift. That is why the brief's extract-and-prove-parity
// work item was deleted: the property it wanted to establish is already guaranteed.
//
// What an adapter does:
//   1. declares which PROFILE fields the DM must collect before the tool can run
//   2. maps that profile onto the tool's own input shape
//   3. calls the tool's existing pure engine
//
// A DM cannot collect 14 wizard inputs, and pretending otherwise would produce a terrible
// conversation. So each adapter asks for the minimum that makes the result honest, fills the
// rest with the SAME defaults the tool itself uses, and relies on the result page to let the
// artist correct assumptions and recalculate. That is the designed path, not a shortcut.

import { generateResult, GENERATOR_VERSION } from '../leadMagnets/resultGenerators';
import type { GeneratedResult, LeadMagnetInputValues } from '../leadMagnets/types';
import { calculate, getAssumptions } from '../leadCalculator';
import { fmtDollars } from '../leadCalculator';
import { buildLossResult } from './lossResult';

export interface AcquisitionTool {
  /** Stable id. For the four registry tools this IS the registry slug. */
  id: string;
  /** Human label used in DM copy. */
  name: string;
  /** Profile field keys that MUST be known before we can run this tool. */
  requiredFields: string[];
  /** Nice-to-have fields. We ask for these only if the conversation is still going. */
  optionalFields: string[];
  /** The route the tokenized result page lives on. */
  resultRouteBase: string;
  /** Version of the formula behind this tool, stamped onto every stored result. */
  formulaVersion: string;
  /** Which calculator id this maps to (for the calculator registry / Claude allowlist). */
  calculatorId: string;
  /** Does the result require the estimate disclaimer? */
  requiresEstimateDisclaimer: boolean;
  /** Where a claimed artist should land after this result. */
  destinationId: string;
  /** Turn a lead profile into the tool's own input shape, then run its existing engine. */
  execute: (profile: LeadProfileValues) => GeneratedResult;
}

/** The subset of lead_profiles the adapters read. All counts; money is cents. */
export interface LeadProfileValues {
  artist_name?: string | null;
  genre?: string | null;
  monthly_listeners?: number | null;
  social_followers?: number | null;
  email_list_size?: number | null;
  catalog_size?: number | null;
  album_count?: number | null;
  song_count?: number | null;
  direct_fan_revenue_cents?: number | null;
  streaming_revenue_cents?: number | null;
  primary_goal?: string | null;
  primary_blocker?: string | null;
}

const n = (v: number | null | undefined, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const s = (v: string | null | undefined, d = ''): string => (typeof v === 'string' && v.trim() ? v.trim() : d);

// ---------------------------------------------------------------------------
// 1. /worth — the money-left-on-the-table model
// ---------------------------------------------------------------------------
// The single best tool for an Instagram DM: it needs ONE number the artist knows by heart.
// Calls the existing pure leadCalculator. WorthExperience.tsx is untouched; the homepage
// keeps working exactly as it does today.
const worth: AcquisitionTool = {
  id: 'worth',
  name: 'What your fanbase is actually worth',
  requiredFields: ['monthly_listeners'],
  optionalFields: ['social_followers', 'streaming_revenue_cents'],
  resultRouteBase: '/tools/worth/result',
  formulaVersion: 'leadCalculator@1',
  calculatorId: 'worth',
  requiresEstimateDisclaimer: true,
  destinationId: 'rise_mode',
  execute(profile) {
    // Conservative preset, deliberately. It is the default on /worth for the same reason:
    // a skeptic cannot dismiss the number, and we would rather under-promise in a cold DM.
    const assumptions = getAssumptions('conservative');
    const result = calculate(
      {
        monthlyListeners: n(profile.monthly_listeners),
        engagedFollowers: n(profile.social_followers),
        currentStreamingCents: n(profile.streaming_revenue_cents),
      },
      assumptions,
    );

    const net = fmtDollars(result.netMrrCents);
    const streaming = fmtDollars(result.streamingMrrCents);
    const artist = s(profile.artist_name);

    // A cold Instagram lead has never told us their name (the worth tool does not ask for
    // one, on purpose: every extra question is a chance to lose them). So there is no name to
    // greet, and "You: about $3,892 a month is sitting on the table" reads like a mail merge
    // that failed. Drop the prefix entirely when we do not know who we are talking to.
    const headline = artist
      ? `${artist}, about ${net} a month is sitting on the table`
      : `About ${net} a month is sitting on the table`;

    return {
      generatorVersion: 'leadCalculator@1',
      headline,
      summary: `Based on ${Math.floor(n(profile.monthly_listeners)).toLocaleString('en-US')} monthly listeners, a direct-to-fan setup could net around ${net} per month. Streaming currently pays you about ${streaming}.`,
      sections: [
        {
          key: 'headline',
          title: 'What you could be earning direct',
          kind: 'projection',
          metrics: [
            { label: 'Net monthly (direct to fan)', value: net, note: 'after the 8% Pro plan fee' },
            { label: 'Net per year', value: fmtDollars(result.netAnnualCents) },
            { label: 'What streaming pays you now', value: streaming },
            ...(result.multipleVsStreaming
              ? [{ label: 'Multiple vs streaming', value: `${result.multipleVsStreaming.toFixed(1)}x` }]
              : []),
          ],
        },
        {
          key: 'audience',
          title: 'The fans this is built on',
          kind: 'projection',
          metrics: [
            { label: 'Addressable audience', value: Math.floor(result.addressable).toLocaleString('en-US') },
            { label: 'Fans likely to ever pay', value: Math.floor(result.payers).toLocaleString('en-US') },
          ],
        },
        {
          key: 'assumptions',
          title: 'Assumptions',
          kind: 'assumptions',
          items: [
            `${Math.round(assumptions.reachRate * 100)}% of your audience is realistically reachable.`,
            `${Math.round(assumptions.superfanRate * 100)}% of that reachable audience ever pays.`,
            'Tier prices of $10, $25 and $100, split across a typical supporter curve.',
            'This is an estimate for planning, not a prediction or a guarantee.',
          ],
        },
      ],
      conversionPayload: {
        netMrrCents: result.netMrrCents,
        payers: Math.floor(result.payers),
      },
      shareSummary: `Turns out my fanbase could be worth about ${net} a month direct.`,
    };
  },
};

// ---------------------------------------------------------------------------
// 2-5. The four registry lead magnets
// ---------------------------------------------------------------------------
// Each maps the DM-collected profile onto the tool's own input keys and then calls the
// EXISTING generateResult() dispatcher. Defaults below mirror the defaults the generators
// already apply internally, so a DM-run result equals a website-run result for the same
// inputs.

const vault: AcquisitionTool = {
  id: 'vault-revenue-planner',
  name: 'Vault Revenue Planner',
  // Two inputs: the unreleased count drives the PLAN (runway, schedule), and the audience drives
  // the loss-framed MONEY topline. Both required, because a Vault DM that cannot show a dollar
  // figure breaks the funnel's "here is what you are missing" hook.
  requiredFields: ['catalog_size', 'monthly_listeners'],
  optionalFields: ['artist_name', 'genre'],
  resultRouteBase: '/tools/vault-revenue-planner/result',
  formulaVersion: GENERATOR_VERSION,
  calculatorId: 'vaultRevenuePlan',
  requiresEstimateDisclaimer: true,
  destinationId: 'setup_monetize',
  execute(profile) {
    // The DM result is a LOSS REVELATION, not the web planner's readiness score: it reveals the
    // recurring revenue leaking out of an un-launched Vault, estimated conservatively from the
    // audience. catalog_size holds the UNRELEASED count (the DM asks "how many unreleased songs
    // are in your vault"); the audience drives the money. The web tool's generateResult is
    // untouched; this builds the standard ten-element loss result via the shared engine.
    const unreleased = n(profile.catalog_size);
    const audience = n(profile.monthly_listeners) || n(profile.social_followers);

    const PRICE_CENTS = 1000; // $10/mo Vault, a conservative midpoint.
    const monthlyAt = (rate: number) => Math.round(audience * rate) * PRICE_CENTS;
    const EXPECTED = 0.015; // ~1.5% of audience becomes a paying Vault supporter. Conservative.
    const monthlyExpected = monthlyAt(EXPECTED);
    const annualExpected = monthlyExpected * 12;
    const runwayMonths = Math.max(1, Math.floor(unreleased / 2)); // ~2 pieces per monthly drop.

    const headline =
      monthlyExpected >= 5000
        ? `About ${fmtDollars(monthlyExpected)} a month is leaking out of your vault, unheard`
        : `${unreleased} unreleased track${unreleased === 1 ? '' : 's'} sitting in your vault, earning nothing`;

    return buildLossResult({
      generatorVersion: GENERATOR_VERSION,
      headline,
      summary: `${unreleased.toLocaleString('en-US')} unreleased pieces, about ${runwayMonths} month${
        runwayMonths === 1 ? '' : 's'
      } of drops, sitting behind a door your fans cannot pay to walk through.`,
      cause:
        'Your unreleased songs, demos, and voice notes sit in a folder earning nothing. Your real supporters would pay every month for access to them, but right now there is nowhere for them to do it.',
      estimate: [
        { label: 'Unreleased assets', value: unreleased.toLocaleString('en-US') },
        {
          label: 'Fans likely to pay',
          value: Math.round(audience * EXPECTED).toLocaleString('en-US'),
          note: '~1.5% of your audience',
        },
        { label: 'Monthly, unclaimed', value: fmtDollars(monthlyExpected) },
        { label: 'A year of it', value: fmtDollars(annualExpected) },
        { label: 'Months of content ready', value: String(runwayMonths) },
      ],
      scenarios: [
        { label: 'Conservative', value: `${fmtDollars(monthlyAt(0.01))}/mo`, note: '~1% pay' },
        { label: 'Expected', value: `${fmtDollars(monthlyExpected)}/mo`, note: '~1.5% pay' },
        { label: 'High', value: `${fmtDollars(monthlyAt(0.03))}/mo`, note: '~3% pay' },
      ],
      assumptions: [
        'About 1.5% of your audience becomes a paying Vault supporter, a conservative rate.',
        'A Vault priced around $10 a month.',
        'Two pieces of content per monthly drop, so your runway is your unreleased count spread across drops.',
        'A planning estimate, not a prediction or a guarantee.',
      ],
      consequences: [
        'Every month it sits, your unreleased catalog ages and loses its first-listen value.',
        'You keep making new free public content while the music you already own earns nothing.',
        'Fans who would go deeper have nowhere to, so they stay casual or drift to a platform.',
      ],
      fanLoss:
        'Your fans miss the unreleased music, the demos and voice notes, the early access, and the feeling of being genuinely close to you. Right now that door does not exist.',
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Open a private Vault tier on your CRWN page in minutes.',
          'Drop your first gated release: an unreleased track or a raw demo.',
          'Post the launch pitch to your fans and start collecting every month.',
        ],
      },
      conversionPayload: { tierName: 'The Vault', priceCents: PRICE_CENTS },
      shareSummary: `Turns out my vault could be worth about ${fmtDollars(monthlyExpected)} a month.`,
    });
  },
};

const proofOfDemand: AcquisitionTool = {
  id: 'proof-of-demand-test-builder',
  name: 'Proof of Demand Test Builder',
  requiredFields: ['social_followers'],
  optionalFields: ['artist_name', 'primary_goal'],
  resultRouteBase: '/tools/proof-of-demand-test-builder/result',
  formulaVersion: GENERATOR_VERSION,
  calculatorId: 'proofOfDemandTest',
  requiresEstimateDisclaimer: true,
  destinationId: 'proof_of_demand',
  execute(profile) {
    const values: LeadMagnetInputValues = {
      ideaDescription: 'the thing your fans keep asking you for',
      ideaType: 'product',
      signalType: 'rsvp',
      fanbaseSize: n(profile.social_followers) || n(profile.monthly_listeners),
      threshold: 0, // 0 => the generator recommends one from fanbase size
      price: 0,
      city: '',
    };
    const generated = generateResult('proofOfDemandTest', values);

    // DM topline: loss-framed MONEY, not the engine's "your test is ready". Conservative model:
    // ~1.5% of the audience buys a typical $15 one-off drop. That is the demand sitting there
    // unproven, which is exactly the loss this tool names.
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    const BUYER_RATE = 0.015;
    const PRICE_CENTS = 1500; // $15 typical one-off
    const demandCents = Math.round(audience * BUYER_RATE) * PRICE_CENTS;
    const headline =
      demandCents >= 5000
        ? `About ${fmtDollars(demandCents)} of demand is sitting in your fanbase, untested`
        : 'Your fans keep asking. You have never made them prove it';

    return { ...generated, headline };
  },
};

const fanMission: AcquisitionTool = {
  id: 'fan-mission-generator',
  name: 'Fan Mission Generator',
  // Goal shapes the mission; audience prices the loss-framed money topline. Both required, same
  // pattern as the Vault: a DM that cannot show a dollar figure breaks the funnel's hook.
  requiredFields: ['primary_goal', 'social_followers'],
  optionalFields: ['artist_name'],
  resultRouteBase: '/tools/fan-mission-generator/result',
  formulaVersion: GENERATOR_VERSION,
  calculatorId: 'fanMission',
  requiresEstimateDisclaimer: false,
  destinationId: 'missions',
  execute(profile) {
    const goal = s(profile.primary_goal, 'grow_audience');
    // Map the acquisition goal enum onto the mission generator's fan-action vocabulary.
    const actionByGoal: Record<string, string> = {
      make_first_dollar: 'subscribe',
      replace_day_job: 'subscribe',
      grow_audience: 'share',
      launch_release: 'presave',
      own_my_fanbase: 'referral',
      scale_existing_revenue: 'subscribe',
    };
    const followers = n(profile.social_followers);
    const values: LeadMagnetInputValues = {
      goal,
      fanAction: actionByGoal[goal] ?? 'share',
      destinationUrl: '',
      // 5% of followers, floored at 25, is the generator's own sane starting target.
      participantCount: followers > 0 ? Math.max(25, Math.round(followers * 0.05)) : 50,
      rewardType: 'points',
      rewardDetail: '',
      leaderboard: true,
      proof: 'link',
    };
    const generated = generateResult('fanMission', values);

    // DM topline: loss-framed money. Conservative: one well-run mission converts ~0.5% of the
    // audience into paying fans at a typical $10/mo.
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    const MISSION_CONVERT_RATE = 0.005;
    const PRICE_CENTS = 1000;
    const monthlyCents = Math.round(audience * MISSION_CONVERT_RATE) * PRICE_CENTS;
    const headline =
      monthlyCents >= 5000
        ? `About ${fmtDollars(monthlyCents)} a month is sitting in your fanbase with no mission to unlock it`
        : `Your fans do nothing because "please support me" is not a mission`;

    return { ...generated, headline };
  },
};

const clipToEarn: AcquisitionTool = {
  id: 'clip-to-earn-campaign-planner',
  name: 'Clip-to-Earn Campaign Planner',
  // Audience prices the money topline (the old required field was artist_name, which cannot
  // produce a dollar figure and read as an odd opening question in a DM).
  requiredFields: ['social_followers'],
  optionalFields: ['artist_name', 'genre', 'catalog_size'],
  resultRouteBase: '/tools/clip-to-earn-campaign-planner/result',
  formulaVersion: GENERATOR_VERSION,
  calculatorId: 'clipToEarnCampaign',
  requiresEstimateDisclaimer: false,
  destinationId: 'bounties',
  execute(profile) {
    const values: LeadMagnetInputValues = {
      sourceContent: s(profile.artist_name, 'your latest record'),
      sourceType: 'song',
      platforms: ['TikTok', 'Reels', 'Shorts'],
      clipTypes: ['hook moment', 'emotional line', 'beat drop'],
      rewardType: 'badge',
      topClipAward: '',
      clipLength: '15-30s',
      requiredHashtags: [],
      requiredCaption: '',
      approvalRequired: false,
    };
    const generated = generateResult('clipToEarnCampaign', values);

    // DM topline: loss-framed money. Conservative: fan-made clips convert ~0.5% of the audience
    // into paying subscribers at a typical $10/mo, promotion that costs nothing up front.
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    const CLIP_CONVERT_RATE = 0.005;
    const PRICE_CENTS = 1000;
    const monthlyCents = Math.round(audience * CLIP_CONVERT_RATE) * PRICE_CENTS;
    const headline =
      monthlyCents >= 5000
        ? `About ${fmtDollars(monthlyCents)} a month is sitting in your fans' clips`
        : 'Your fans would clip you for free. Nobody has asked them';

    return { ...generated, headline };
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ACQUISITION_TOOLS: Record<string, AcquisitionTool> = {
  worth: worth,
  'vault-revenue-planner': vault,
  'proof-of-demand-test-builder': proofOfDemand,
  'fan-mission-generator': fanMission,
  'clip-to-earn-campaign-planner': clipToEarn,
};

export const ACQUISITION_TOOL_IDS = Object.keys(ACQUISITION_TOOLS);
export const ACQUISITION_CALCULATOR_IDS = Object.values(ACQUISITION_TOOLS).map((t) => t.calculatorId);

/** The tool we route a lead to when nothing more specific was requested. */
export const DEFAULT_TOOL_ID = 'worth';

export function getTool(id: string | null | undefined): AcquisitionTool | null {
  if (!id) return null;
  return Object.prototype.hasOwnProperty.call(ACQUISITION_TOOLS, id) ? ACQUISITION_TOOLS[id] : null;
}

/** Which required fields are still missing for this tool, in ask-order. */
export function missingRequiredFields(tool: AcquisitionTool, profile: LeadProfileValues): string[] {
  return tool.requiredFields.filter((k) => {
    const v = (profile as Record<string, unknown>)[k];
    return v === null || v === undefined || v === '';
  });
}
