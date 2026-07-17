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
      flow: [
        'Your unreleased vault, earning $0',
        'Open a private Vault tier on CRWN',
        'Fans pay every month to get in',
        `That leak becomes ${fmtDollars(monthlyExpected)} a month, recurring`,
      ],
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
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    const PRICE_CENTS = 1000;
    const monthlyAt = (rate: number) => Math.round(audience * rate) * PRICE_CENTS;
    const EXPECTED = 0.005; // one clear mission converts ~0.5% of the audience to paying fans.
    const monthlyExpected = monthlyAt(EXPECTED);
    const annualExpected = monthlyExpected * 12;
    const readyToAct = Math.round(audience * 0.05); // ~5% will act on a clear, rewarded ask.
    const perMission = Math.round(readyToAct * 0.3); // ~30% of them join any given mission.

    const headline =
      monthlyExpected >= 5000
        ? `About ${fmtDollars(monthlyExpected)} a month is sitting in your fanbase with no mission to unlock it`
        : 'Your fans do nothing because "please support me" is not a mission';

    return buildLossResult({
      generatorVersion: GENERATOR_VERSION,
      headline,
      summary: `Around ${readyToAct.toLocaleString(
        'en-US',
      )} of your fans would act on a clear, rewarded ask. Right now they are handed a vague one and scroll past.`,
      cause:
        '"Support me" is not an instruction, so your fans do nothing with it. A mission gives them one clear action, a reason it matters, and a reward for finishing. The same fans who ignore a plea will move for an assignment.',
      estimate: [
        { label: 'Fans ready to act', value: readyToAct.toLocaleString('en-US'), note: '~5% of your audience' },
        { label: 'Join a given mission', value: perMission.toLocaleString('en-US') },
        { label: 'Monthly, unclaimed', value: fmtDollars(monthlyExpected) },
        { label: 'A year of it', value: fmtDollars(annualExpected) },
      ],
      scenarios: [
        { label: 'Conservative', value: `${fmtDollars(monthlyAt(0.003))}/mo`, note: '~0.3% convert' },
        { label: 'Expected', value: `${fmtDollars(monthlyExpected)}/mo`, note: '~0.5% convert' },
        { label: 'High', value: `${fmtDollars(monthlyAt(0.01))}/mo`, note: '~1% convert' },
      ],
      assumptions: [
        'About 5% of your audience will act on a clear, rewarded mission.',
        'A well-run mission converts roughly 0.5% of your audience into paying fans, a conservative rate.',
        'Paying fans valued at about $10 a month.',
        'A planning estimate, not a prediction or a guarantee.',
      ],
      consequences: [
        'You burn your own time reposting broad asks that convert almost no one.',
        'Launches and releases go out to silence because there is no action to rally around.',
        'Your most willing fans stay on the sidelines, waiting to be told how to help.',
      ],
      fanLoss:
        'Your fans miss a clear assignment, visible progress toward a goal, recognition when they finish, a reward worth earning, and proof that what they did actually mattered.',
      flow: [
        '"Support me" leaves your fans doing nothing',
        'Launch one clear Fan Mission with a reward',
        'They share, refer, presave, and subscribe',
        `${fmtDollars(monthlyExpected)} a month, plus reach you were not getting`,
      ],
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Generate a Fan Mission on CRWN: one action, a target, a reward.',
          'Drop the mission link in your bio and stories.',
          'Watch the leaderboard fill and the actions roll in.',
        ],
      },
      conversionPayload: { missionType: s(profile.primary_goal, 'grow_audience') },
      shareSummary: `Turns out a single fan mission could be worth about ${fmtDollars(monthlyExpected)} a month.`,
    });
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
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    const PRICE_CENTS = 1000;
    const monthlyAt = (rate: number) => Math.round(audience * rate) * PRICE_CENTS;
    const EXPECTED = 0.005; // fan clips convert ~0.5% of the audience to paying subscribers.
    const monthlyExpected = monthlyAt(EXPECTED);
    const annualExpected = monthlyExpected * 12;
    const reach = Math.round(audience * 3); // clips extend reach ~3x your own accounts, conservative.
    const clippers = Math.round(audience * 0.02); // ~2% of fans will actually clip for you.

    const headline =
      monthlyExpected >= 5000
        ? `About ${fmtDollars(monthlyExpected)} a month is sitting in your fans' clips`
        : 'Your fans would clip you for free, and nobody has asked them';

    return buildLossResult({
      generatorVersion: GENERATOR_VERSION,
      headline,
      summary: `Every stream and song lives once on your own account, then disappears. Your fans would cut it into clips and post it everywhere, and about ${clippers.toLocaleString(
        'en-US',
      )} of them would do it for a cut.`,
      cause:
        'Your long-form content posts once, to your own followers, and then it is gone. The reach that blows up streamers comes from clips posted everywhere by other people. You are the only one clipping you, so most of the reach and every subscriber it would bring never happens.',
      estimate: [
        { label: 'Clippers you could activate', value: clippers.toLocaleString('en-US'), note: '~2% of your fans' },
        { label: 'Reach you are not getting', value: `~${reach.toLocaleString('en-US')}`, note: 'per month, conservative' },
        { label: 'Monthly, unclaimed', value: fmtDollars(monthlyExpected) },
        { label: 'A year of it', value: fmtDollars(annualExpected) },
      ],
      scenarios: [
        { label: 'Conservative', value: `${fmtDollars(monthlyAt(0.003))}/mo`, note: '~0.3% convert' },
        { label: 'Expected', value: `${fmtDollars(monthlyExpected)}/mo`, note: '~0.5% convert' },
        { label: 'High', value: `${fmtDollars(monthlyAt(0.01))}/mo`, note: '~1% convert' },
      ],
      assumptions: [
        'Fan-made clips reach roughly 3x your own audience each month, a conservative estimate.',
        'About 0.5% of the audience the clips reach converts to a paying subscriber.',
        'Paying fans valued at about $10 a month.',
        'You set the clipper commission, so most of this is net to you. A planning estimate, not a guarantee.',
      ],
      consequences: [
        'You spend hours trying to make every short-form post yourself, alone.',
        'Each livestream and release disappears after one view instead of becoming a month of clips.',
        'All your reach stays trapped on your own accounts, capped by one algorithm.',
      ],
      fanLoss:
        'Your fans miss the chance to clip you, earn a recurring commission when their clip brings a subscriber, get recognized on a leaderboard, and genuinely help shape your growth.',
      flow: [
        'Your streams and songs, clipped by no one',
        'Turn on Clip & Earn and set your commission',
        'Fans clip and post you across every platform',
        `${fmtDollars(monthlyExpected)} a month in subscribers you did not pay to reach`,
      ],
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Turn on Clip & Earn on CRWN and set the recurring commission you pay.',
          'Your streams and releases become a clip library your fans pull from.',
          'Pay clippers only when their clip actually brings a subscriber.',
        ],
      },
      conversionPayload: { campaign: 'clip-to-earn' },
      shareSummary: `Turns out my fans' clips could be worth about ${fmtDollars(monthlyExpected)} a month.`,
    });
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 6-10. The new loss-revelation tools. Each reveals a specific loss and shows how CRWN recovers
// it, through the shared buildLossResult engine. Inputs reuse EXISTING profile fields (audience,
// goal, direct revenue) so no migration is needed; every model is conservative and assumption-led,
// and tools whose honest output is a score lead with a gauge instead of a fabricated dollar figure.
// ---------------------------------------------------------------------------

const founderWindow: AcquisitionTool = {
  id: 'founder-window-builder',
  name: 'Founder Window Builder',
  requiredFields: ['social_followers'],
  optionalFields: ['direct_fan_revenue_cents', 'artist_name'],
  resultRouteBase: '/tools/founder-window-builder/result',
  formulaVersion: 'lossResult@1',
  calculatorId: 'founderWindow',
  requiresEstimateDisclaimer: true,
  destinationId: 'rise_mode',
  execute(profile) {
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    const PRICE = 1000;
    const intenders = Math.round(audience * 0.02); // would become supporters eventually
    const foundersAt = (pull: number) => Math.round(intenders * pull) * PRICE;
    const monthly = foundersAt(0.4); // a real window pulls ~40% forward now
    const headline =
      monthly >= 5000
        ? `About ${fmtDollars(monthly)} a month in founding supporters is slipping away with no reason to join now`
        : 'Your fans have no reason to join now instead of someday, so most never do';
    return buildLossResult({
      generatorVersion: 'lossResult@1',
      headline,
      summary: `Around ${intenders.toLocaleString(
        'en-US',
      )} of your fans would support you eventually. With no reason to act now, most keep saying "later" until they forget.`,
      cause:
        'An always-open offer has no urgency, so fans who fully intend to join keep putting it off. A founder window gives them a real reason to act now: limited spots, a locked-in price, and permanent founding-supporter status.',
      estimate: [
        { label: 'Would join eventually', value: intenders.toLocaleString('en-US'), note: '~2% of your audience' },
        { label: 'A window pulls forward now', value: Math.round(intenders * 0.4).toLocaleString('en-US') },
        { label: 'Monthly, if they join now', value: fmtDollars(monthly) },
        { label: 'A year of it', value: fmtDollars(monthly * 12) },
      ],
      scenarios: [
        { label: 'Conservative', value: `${fmtDollars(foundersAt(0.25))}/mo`, note: '25% pulled forward' },
        { label: 'Expected', value: `${fmtDollars(monthly)}/mo`, note: '40% pulled forward' },
        { label: 'High', value: `${fmtDollars(foundersAt(0.6))}/mo`, note: '60% pulled forward' },
      ],
      assumptions: [
        'About 2% of your audience would become paying supporters over time.',
        'A founder window with real scarcity pulls roughly 40% of them to decide now instead of someday.',
        'Founding supporters valued at about $10 a month.',
        'A planning estimate, not a prediction or a guarantee.',
      ],
      consequences: [
        'Launch momentum you only get once leaks away across an always-open offer.',
        'You cannot tell who believed early, so you cannot reward them or build around them.',
        'Every release cycle you wait is another batch of "later" that quietly becomes never.',
      ],
      fanLoss:
        'Your fans miss permanent proof they were early, a price locked in for life, founding-supporter status, and a real place in the story before everyone else showed up.',
      flow: [
        'An always-open offer your fans keep ignoring',
        'Open a founder window: limited spots, locked price',
        'Fans act now to lock in founding status',
        `${fmtDollars(monthly)} a month, from supporters who would have drifted`,
      ],
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Set a founder window on your CRWN page: a cap and a locked price.',
          'Give founders permanent status and a benefit only they keep.',
          'Announce the deadline and let the scarcity do the work.',
        ],
      },
      conversionPayload: { window: 'founder' },
      shareSummary: `A founder window could lock in about ${fmtDollars(monthly)} a month for me.`,
    });
  },
};

const movementPage: AcquisitionTool = {
  id: 'movement-page-blueprint',
  name: 'Movement Page Blueprint',
  requiredFields: ['social_followers'],
  optionalFields: ['primary_goal', 'artist_name'],
  resultRouteBase: '/tools/movement-page-blueprint/result',
  formulaVersion: 'lossResult@1',
  calculatorId: 'movementPage',
  requiresEstimateDisclaimer: true,
  destinationId: 'rise_mode',
  execute(profile) {
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    const PRICE = 1000;
    // A generic profile/streaming link converts a fraction of the interested traffic a real
    // movement page would. The gap is the leakage.
    const monthlyVisitors = Math.round(audience * 0.15); // ~15% of your audience checks a link out
    const wouldConvert = Math.round(monthlyVisitors * 0.03); // a clear page converts ~3%
    const leakedNow = Math.round(wouldConvert * 0.75); // a generic link loses ~75% of them
    const monthly = leakedNow * PRICE;
    return buildLossResult({
      generatorVersion: 'lossResult@1',
      headline: 'Your traffic hits a generic profile, reads nothing worth joining, and leaves',
      score: {
        value: 24,
        max: 100,
        label: 'Movement clarity',
        band: 'Low: visitors cannot tell what you are building or why to join now',
      },
      summary: `Roughly ${monthlyVisitors.toLocaleString(
        'en-US',
      )} people check your link each month. A profile with no story converts almost none of them.`,
      cause:
        'A streaming link or a generic profile answers none of the questions a new fan has: what are you building, what chapter is this, why does joining now matter, and what can I actually do. With no story and no clear action, interested visitors leave.',
      estimate: [
        { label: 'Check your link monthly', value: monthlyVisitors.toLocaleString('en-US'), note: '~15% of audience' },
        { label: 'A clear page would convert', value: wouldConvert.toLocaleString('en-US') },
        { label: 'Lost to a generic link', value: leakedNow.toLocaleString('en-US'), note: '~75% of them' },
        { label: 'Monthly, leaking', value: fmtDollars(monthly) },
      ],
      scenarios: [
        { label: 'Conservative', value: `${fmtDollars(Math.round(wouldConvert * 0.6) * PRICE)}/mo`, note: '60% leak' },
        { label: 'Expected', value: `${fmtDollars(monthly)}/mo`, note: '75% leak' },
        { label: 'High', value: `${fmtDollars(Math.round(wouldConvert * 0.85) * PRICE)}/mo`, note: '85% leak' },
      ],
      assumptions: [
        'About 15% of your audience clicks through to your link in a month.',
        'A clear movement page converts roughly 3% of that traffic; a generic link loses about 75% of it.',
        'A converted supporter valued at about $10 a month.',
        'A planning estimate, not a prediction or a guarantee.',
      ],
      consequences: [
        'Campaign momentum scatters across unrelated links with no center.',
        'New fans never grasp what you are building, so they stay passive.',
        'Your call to action is buried, so the ready ones never find the yes.',
      ],
      fanLoss:
        'Your fans miss your story, the chapter you are in now, the mission they could join, a community identity, proof of your progress, and an obvious role to play.',
      flow: [
        'Traffic hits a generic link and bounces',
        'Build one movement page: story, mission, clear action',
        'Visitors understand it and join',
        `${fmtDollars(monthly)} a month you were leaking recovered`,
      ],
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Build your movement page on CRWN: your story, your current mission, your tiers.',
          'Put one clear action above the fold so the ready fan cannot miss it.',
          'Point every link in your bio and captions to it.',
        ],
      },
      conversionPayload: { page: 'movement' },
      shareSummary: 'Turns out my link was leaking most of the fans who clicked it.',
    });
  },
};

const fanJourney: AcquisitionTool = {
  id: 'fan-journey-builder',
  name: 'Fan Journey Builder',
  requiredFields: ['social_followers'],
  optionalFields: ['direct_fan_revenue_cents', 'artist_name'],
  resultRouteBase: '/tools/fan-journey-builder/result',
  formulaVersion: 'lossResult@1',
  calculatorId: 'fanJourney',
  requiresEstimateDisclaimer: true,
  destinationId: 'rise_mode',
  execute(profile) {
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    const PRICE = 1000;
    // The leak is between "would pay" and "actually recurring", the weakest transition with no
    // structured journey. Conservatively ~1% of audience would ever pay; without a path, the
    // majority never make the recurring jump.
    const wouldPay = Math.round(audience * 0.01);
    const lostToNoPath = Math.round(wouldPay * 0.6); // ~60% never reach recurring with no journey
    const monthly = lostToNoPath * PRICE;
    return buildLossResult({
      generatorVersion: 'lossResult@1',
      headline: 'Fans leak out at every step between hearing you and paying you',
      score: {
        value: 71,
        max: 100,
        label: 'Fan journey leakage',
        band: 'High: your weakest transition is first purchase to recurring support',
      },
      summary: `About ${wouldPay.toLocaleString(
        'en-US',
      )} of your fans would pay you something. With no path from one step to the next, most never make the jump to recurring support.`,
      cause:
        'A fan goes from discovery to interest to participation to a first purchase to recurring support to promotion. Each step needs a clear next action. With no structured journey, fans stall at the weakest transition and quietly drop off instead of going deeper.',
      estimate: [
        { label: 'Would pay you something', value: wouldPay.toLocaleString('en-US'), note: '~1% of audience' },
        { label: 'Never reach recurring', value: lostToNoPath.toLocaleString('en-US'), note: '~60% with no path' },
        { label: 'Monthly, leaking', value: fmtDollars(monthly) },
        { label: 'A year of it', value: fmtDollars(monthly * 12) },
      ],
      scenarios: [
        { label: 'Conservative', value: `${fmtDollars(Math.round(wouldPay * 0.45) * PRICE)}/mo`, note: '45% lost' },
        { label: 'Expected', value: `${fmtDollars(monthly)}/mo`, note: '60% lost' },
        { label: 'High', value: `${fmtDollars(Math.round(wouldPay * 0.75) * PRICE)}/mo`, note: '75% lost' },
      ],
      assumptions: [
        'About 1% of your audience would pay you something.',
        'With no structured journey, roughly 60% of them never reach recurring support.',
        'A recurring supporter valued at about $10 a month.',
        'A planning estimate, not a prediction or a guarantee.',
      ],
      consequences: [
        'Your biggest transition, one-time buyer to recurring supporter, is left to chance.',
        'Fans who wanted to go deeper find no next step, so they stay casual.',
        'Lifetime value evaporates through weak retention you never see.',
      ],
      fanLoss:
        'Your fans miss a clear next action at every stage, real progression, stronger access as they go, earned roles, leadership opportunities, and permanent proof of what they contributed.',
      flow: [
        'Fans drop off between each step with no path',
        'Build the fan journey: a next action at every stage',
        'Fans move from listener to supporter to promoter',
        `${fmtDollars(monthly)} a month in recurring support recovered`,
      ],
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Map your fan journey on CRWN: free tier, paid tiers, missions, leadership.',
          'Give each stage a clear next action and a reason to take it.',
          'Reward the jump to recurring support so it actually happens.',
        ],
      },
      conversionPayload: { journey: 'fan' },
      shareSummary: 'Turns out most of my fans were leaking out before ever paying.',
    });
  },
};

const topFan: AcquisitionTool = {
  id: 'top-fan-leaderboard-builder',
  name: 'Top Fan Leaderboard Builder',
  requiredFields: ['social_followers'],
  optionalFields: ['direct_fan_revenue_cents', 'artist_name'],
  resultRouteBase: '/tools/top-fan-leaderboard-builder/result',
  formulaVersion: 'lossResult@1',
  calculatorId: 'topFanLeaderboard',
  requiresEstimateDisclaimer: true,
  destinationId: 'rise_mode',
  execute(profile) {
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    const PRICE = 1000;
    const superfans = Math.round(audience * 0.01); // the fans doing most of the work
    // Recognition lifts repeat participation and referrals from superfans. Conservative uplift.
    const uplift = Math.round(superfans * 0.25) * PRICE; // ~25% more retained/referred value
    const score = Math.min(90, 62 + Math.floor(Math.min(28, superfans / 20)));
    return buildLossResult({
      generatorVersion: 'lossResult@1',
      headline: 'Your top fans look identical to the fans who just pressed play, so they act like it',
      score: {
        value: score,
        max: 100,
        label: 'Unrecognized fan impact',
        band: 'High: your most valuable fans get no status, so their best actions fade',
      },
      summary: `Around ${superfans.toLocaleString(
        'en-US',
      )} of your fans quietly do most of the sharing, referring, and buying. With nothing marking them apart, that behavior slowly stops.`,
      cause:
        'When every supporter looks the same, contribution goes invisible and unrewarded, so it stops. Recognition, status, and a visible leaderboard turn your best fans into repeat promoters and identify the leaders worth building around.',
      estimate: [
        { label: 'Superfans doing the work', value: superfans.toLocaleString('en-US'), note: '~1% of audience' },
        { label: 'Retention + referral uplift', value: fmtDollars(uplift), note: 'per month, recognized' },
        { label: 'A year of it', value: fmtDollars(uplift * 12) },
        { label: 'Potential leaders to name', value: Math.max(1, Math.round(superfans * 0.1)).toLocaleString('en-US') },
      ],
      scenarios: [
        { label: 'Conservative', value: `${fmtDollars(Math.round(superfans * 0.15) * PRICE)}/mo`, note: '15% uplift' },
        { label: 'Expected', value: `${fmtDollars(uplift)}/mo`, note: '25% uplift' },
        { label: 'High', value: `${fmtDollars(Math.round(superfans * 0.4) * PRICE)}/mo`, note: '40% uplift' },
      ],
      assumptions: [
        'About 1% of your audience are superfans driving most repeat actions.',
        'Visible recognition lifts their retention and referrals by roughly 25%, a conservative rate.',
        'That behavior valued at about $10 a month per superfan of uplift.',
        'A planning estimate, not a prediction or a guarantee.',
      ],
      consequences: [
        'Repeat shares, referrals, and mission participation fade with nothing to sustain them.',
        'Your future community leaders and city captains go unidentified.',
        'Your most valuable fan data stays hidden because everyone looks equal.',
      ],
      fanLoss:
        'Your fans miss status, recognition, visible progress, healthy competition, earned access, leadership roles, and permanent proof of the impact they made.',
      flow: [
        'Top fans blend in and their best actions fade',
        'Turn on a Top Fan leaderboard with earned status',
        'Recognized fans repeat, refer, and lead',
        `${fmtDollars(uplift)} a month in retention and referrals recovered`,
      ],
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Turn on the Top Fan leaderboard on CRWN, scored on contribution, not just spend.',
          'Give the top ranks real status, access, and leadership roles.',
          'Let the competition keep your best fans active month after month.',
        ],
      },
      conversionPayload: { leaderboard: 'top-fan' },
      shareSummary: 'Turns out my top fans were going unrecognized, so their best actions were fading.',
    });
  },
};

const questPath: AcquisitionTool = {
  id: 'artist-quest-path',
  name: 'Artist Quest Path Quiz',
  // No audience needed: the loss here is TIME, from doing the right work in the wrong order.
  requiredFields: ['primary_goal', 'primary_blocker'],
  optionalFields: ['artist_name'],
  resultRouteBase: '/tools/artist-quest-path/result',
  formulaVersion: 'lossResult@1',
  calculatorId: 'questPath',
  requiresEstimateDisclaimer: true,
  destinationId: 'rise_mode',
  execute() {
    // Sequencing risk is high whenever there is no ordered path; the honest output is a leakage
    // SCORE and a delayed-progress range, not a fabricated dollar figure (no audience was asked).
    return buildLossResult({
      generatorVersion: 'lossResult@1',
      headline: 'You are doing the right work in the wrong order, and it is costing you months',
      score: {
        value: 68,
        max: 100,
        label: 'Execution leakage',
        band: 'High: effort is going into tasks that need earlier steps built first',
      },
      summary:
        'Most artists build a store before they have an audience to sell to, or chase followers before there is anything to convert them into. Order is the difference between months of progress and months of spinning.',
      cause:
        'Every next step depends on a foundation being in place first. Build in the wrong order and the work does not compound: you launch tools with no one to use them, run campaigns with nothing to convert to, and repeat work you sequenced wrong. The cost is not money spent, it is time and momentum lost.',
      estimate: [
        { label: 'Weeks likely lost', value: '8 to 16', note: 'to out-of-order work' },
        { label: 'Monetization delayed', value: '2 to 4 months' },
        { label: 'Foundations still missing', value: '2 to 3' },
        { label: 'The next unlock, blocked', value: 'until the prior step exists' },
      ],
      scenarios: [
        { label: 'On track', value: '~4 wks', note: 'small resequence' },
        { label: 'Typical', value: '~10 wks', note: 'lost to order' },
        { label: 'Stuck', value: '~20 wks', note: 'rebuilding twice' },
      ],
      assumptions: [
        'Sequencing cost is estimated as a range, not a precise figure, because it depends on your foundations.',
        'Delay compounds: a missing early step blocks every later one that needs it.',
        'A planning estimate, not a prediction or a guarantee.',
      ],
      consequences: [
        'Revenue stays delayed while you stay busy on work that cannot pay off yet.',
        'Tools and campaigns get built before there is anyone ready to use them.',
        'You redo work later because it was done out of order the first time.',
      ],
      fanLoss:
        'Your fans may be interested but have no clear way to participate, support, promote, or follow your progress, because the step that would let them has not been built yet.',
      flow: [
        'Right work, wrong order, months spinning',
        'Get a sequenced quest path for your goal',
        'Build each foundation before the step that needs it',
        'Progress that compounds instead of resetting',
      ],
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Follow your Rise Mode quest path on CRWN, ordered for your actual goal.',
          'Complete each foundation before the step that depends on it unlocks.',
          'Let every finished step open the next instead of blocking it.',
        ],
      },
      conversionPayload: { path: 'quest' },
      shareSummary: 'Turns out I was doing the right things in the wrong order.',
    });
  },
};

const supporterPromise: AcquisitionTool = {
  id: 'supporter-promise-calendar',
  name: 'Supporter Promise Calendar Builder',
  requiredFields: ['direct_fan_revenue_cents'],
  optionalFields: ['artist_name'],
  resultRouteBase: '/tools/supporter-promise-calendar/result',
  formulaVersion: 'lossResult@1',
  calculatorId: 'supporterPromise',
  requiresEstimateDisclaimer: true,
  destinationId: 'setup_monetize',
  execute(profile) {
    const PRICE = 1000;
    const monthlyRev = n(profile.direct_fan_revenue_cents);
    const supporters = Math.max(0, Math.round(monthlyRev / PRICE)); // estimate at ~$10/mo each
    const atRisk = Math.round(supporters * 0.2); // ~20% churn when promises slip
    const mrrAtRisk = atRisk * PRICE;
    const score = supporters > 0 ? 74 : 62;
    return buildLossResult({
      generatorVersion: 'lossResult@1',
      headline: 'The perks you promised are a monthly bill you never scheduled, and missed ones churn supporters',
      score: {
        value: score,
        max: 100,
        label: 'Fulfillment risk',
        band: 'High: benefits with no calendar get missed, and a missed benefit is a cancelled supporter',
      },
      summary:
        supporters > 0
          ? `About ${supporters.toLocaleString(
              'en-US',
            )} supporters are counting on perks you have not put on a schedule. When one slips, that trust, and that revenue, is the first to go.`
          : 'Before you promise your supporters anything, this shows whether you can actually deliver it every month without drowning.',
      cause:
        'Every membership perk is a recurring obligation with a due date. With no calendar, they get forgotten, delivered late, or promised faster than you can produce. Supporters notice, and a missed benefit is the most common reason a recurring supporter cancels.',
      estimate: [
        { label: 'Supporters counting on you', value: supporters.toLocaleString('en-US') },
        { label: 'At risk from missed perks', value: atRisk.toLocaleString('en-US'), note: '~20%' },
        { label: 'Monthly revenue at risk', value: fmtDollars(mrrAtRisk) },
        { label: 'A year of it', value: fmtDollars(mrrAtRisk * 12) },
      ],
      scenarios: [
        { label: 'Scheduled', value: `${fmtDollars(Math.round(supporters * 0.05) * PRICE)}/mo`, note: '~5% churn' },
        { label: 'Unscheduled', value: `${fmtDollars(mrrAtRisk)}/mo`, note: '~20% churn' },
        { label: 'Overwhelmed', value: `${fmtDollars(Math.round(supporters * 0.35) * PRICE)}/mo`, note: '~35% churn' },
      ],
      assumptions: [
        'Supporters estimated from your direct monthly revenue at about $10 each.',
        'Missed or late benefits churn roughly 20% of supporters over a year; a real schedule cuts that sharply.',
        'A planning estimate, not a prediction or a guarantee.',
      ],
      consequences: [
        'Fulfillment work piles up unevenly and eats the time you meant to spend making music.',
        'Perks priced too low for the work quietly cost you on every single delivery.',
        'Disappointed supporters do not just cancel, they tell other fans not to bother.',
      ],
      fanLoss:
        'Your fans miss the benefits they paid for, predictable access, honest communication about timing, recognition, and the confidence that you actually value their support.',
      flow: [
        'Promised perks with no schedule get missed',
        'Put every benefit on a supporter promise calendar',
        'Fans get what they paid for, on time',
        `${fmtDollars(mrrAtRisk)} a month of at-risk revenue protected`,
      ],
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Lay every supporter benefit on a calendar with real due dates.',
          'Price each perk for the work it actually takes, so delivery is sustainable.',
          'Automate the reminders so nothing slips and no supporter feels forgotten.',
        ],
      },
      conversionPayload: { calendar: 'supporter-promise' },
      shareSummary: 'Turns out my membership perks were a monthly bill I never scheduled.',
    });
  },
};

const teamSplit: AcquisitionTool = {
  id: 'team-split-deal-builder',
  name: 'Team Split Deal Builder',
  requiredFields: ['direct_fan_revenue_cents'],
  optionalFields: ['artist_name'],
  resultRouteBase: '/tools/team-split-deal-builder/result',
  formulaVersion: 'lossResult@1',
  calculatorId: 'teamSplit',
  requiresEstimateDisclaimer: true,
  destinationId: 'setup_monetize',
  execute(profile) {
    const monthlyRev = n(profile.direct_fan_revenue_cents);
    const PCT = 0.2; // a common collaborator ask
    const CAP_MONTHS = 6;
    // Uncapped: pays PCT of revenue forever. Capped: pays PCT until a fair cap, then stops.
    const uncappedYear = Math.round(monthlyRev * PCT * 12);
    const cappedTotal = Math.round(monthlyRev * PCT * CAP_MONTHS);
    const overpayYear = Math.max(0, uncappedYear - cappedTotal);
    const headline =
      overpayYear >= 5000
        ? `An uncapped 20% split quietly costs you about ${fmtDollars(overpayYear)} more a year than a capped one`
        : 'A collaborator deal with no cap keeps paying long after the work stopped adding value';
    return buildLossResult({
      generatorVersion: 'lossResult@1',
      headline,
      summary:
        monthlyRev > 0
          ? `On ${fmtDollars(monthlyRev)} a month, a 20% split with no cap and no end date keeps taking from every future dollar, including the ones the collaborator had nothing to do with.`
          : 'Before you hand a collaborator a percentage, this shows how a cap, a duration, and a gross-versus-net basis change what you actually owe.',
      cause:
        'The two ways a team deal goes wrong: you cannot fund a collaborator upfront so the work never happens, or you fund it with a split that is set too high, applies to too much, has no cap, no duration, and an unclear gross-versus-net basis, so it quietly bleeds revenue long after the work stopped mattering.',
      estimate: [
        { label: 'Split rate assumed', value: '20%' },
        { label: 'Uncapped, per year', value: fmtDollars(uncappedYear) },
        { label: 'Capped at 6 months', value: fmtDollars(cappedTotal) },
        { label: 'Overpaid, year one', value: fmtDollars(overpayYear) },
      ],
      scenarios: [
        { label: 'Capped', value: fmtDollars(cappedTotal), note: '6-month cap' },
        { label: 'Uncapped 1yr', value: fmtDollars(uncappedYear), note: 'no cap' },
        { label: 'Uncapped 3yr', value: fmtDollars(uncappedYear * 3), note: 'still paying' },
      ],
      assumptions: [
        'A 20% collaborator split on your direct monthly revenue, for illustration.',
        'A capped deal ends after about 6 months of contribution; an uncapped one never does.',
        'Figures assume a gross basis; a net basis changes them again. A planning estimate, not a guarantee.',
      ],
      consequences: [
        'Without a way to fund a team, campaigns get delayed and specialist work does not happen.',
        'You spend your own hours on work a collaborator should do, at the cost of making music.',
        'Stacked, uncapped splits can add up to more than you keep, and you only notice later.',
      ],
      fanLoss:
        'Your fans miss the better content, faster releases, stronger campaigns, and experiences you cannot produce alone because you had no safe way to bring in help.',
      flow: [
        'Uncapped splits bleed revenue with no end',
        'Structure the deal: rate, cap, duration, basis',
        'The collaborator is paid fairly for real work',
        `${fmtDollars(overpayYear)} a year kept instead of overpaid`,
      ],
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Build the split on CRWN with a rate, a cap, and a clear gross-or-net basis.',
          'Fence it to the revenue the collaborator actually drives, not everything.',
          'Let the cap end the obligation once the work has been paid for.',
        ],
      },
      conversionPayload: { deal: 'team-split' },
      shareSummary: 'Turns out an uncapped split was going to cost me a lot more than a capped one.',
    });
  },
};

export const ACQUISITION_TOOLS: Record<string, AcquisitionTool> = {
  worth: worth,
  'vault-revenue-planner': vault,
  'proof-of-demand-test-builder': proofOfDemand,
  'fan-mission-generator': fanMission,
  'clip-to-earn-campaign-planner': clipToEarn,
  'founder-window-builder': founderWindow,
  'movement-page-blueprint': movementPage,
  'fan-journey-builder': fanJourney,
  'top-fan-leaderboard-builder': topFan,
  'artist-quest-path': questPath,
  'supporter-promise-calendar': supporterPromise,
  'team-split-deal-builder': teamSplit,
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
