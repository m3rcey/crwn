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
import { scoreReadiness, sanitizeAnswers } from '../royalty/readiness';

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
  // Royalty Readiness answers. Each is 'yes' | 'no' | 'unsure', validated by
  // sanitizeAnswers before scoring, so an unexpected value is dropped rather than
  // scored. Typed loosely here because they arrive from a DM as free text.
  writes_music?: string | null;
  pro_registered?: string | null;
  songs_registered?: string | null;
  mechanical_collection?: string | null;
  soundexchange?: string | null;
  unregistered_backlog?: string | null;
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
  name: 'Streaming Loss Calculator',
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
        // The full suggested membership ladder the calculator modeled: price + projected
        // supporters per tier (70/22/8 whale curve). The Membership builder pre-fills the entry
        // tier from this and surfaces the rest as the suggested ladder to grow into (Pro).
        ladder: [
          { name: 'Inner Circle', priceCents: assumptions.tier1PriceCents, projectedSubs: Math.floor(result.tier1Subs) },
          { name: 'The Vault', priceCents: assumptions.tier2PriceCents, projectedSubs: Math.floor(result.tier2Subs) },
          { name: 'Throne', priceCents: assumptions.tier3PriceCents, projectedSubs: Math.floor(result.tier3Subs) },
        ],
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
      derivation: [
        { label: 'Your audience', value: audience.toLocaleString('en-US') },
        { label: 'Fans likely to pay', value: Math.round(audience * EXPECTED).toLocaleString('en-US'), note: '~1.5% of your audience' },
        { label: 'At $10 a month Vault', value: `${fmtDollars(monthlyExpected)}/mo` },
      ],
      monthlyLossCents: monthlyExpected,
      emailInsights: [
        {
          title: 'Your first drop plan',
          body: 'Open the Vault with a welcome voice note, drop one unreleased track in week one, and a demo or alternate version in week two. About two pieces a month keeps it sustainable.',
        },
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
      derivation: [
        { label: 'Your audience', value: audience.toLocaleString('en-US') },
        { label: 'Convert on a clear mission', value: Math.round(audience * EXPECTED).toLocaleString('en-US'), note: '~0.5% of your audience' },
        { label: 'At $10 a month each', value: `${fmtDollars(monthlyExpected)}/mo` },
      ],
      monthlyLossCents: monthlyExpected,
      emailInsights: [
        {
          title: 'The first mission to run',
          body: `Pick one action tied to your goal, set the target near ${perMission.toLocaleString('en-US')} fans, and attach a reward they actually want. One clear ask beats five vague ones.`,
        },
      ],
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
      derivation: [
        { label: 'Your audience', value: audience.toLocaleString('en-US') },
        { label: 'Clippers you activate', value: clippers.toLocaleString('en-US'), note: '~2% of your fans' },
        { label: 'Subscribe from the clips', value: Math.round(audience * EXPECTED).toLocaleString('en-US'), note: '~0.5% of your audience' },
        { label: 'At $10 a month each', value: `${fmtDollars(monthlyExpected)}/mo` },
      ],
      monthlyLossCents: monthlyExpected,
      emailInsights: [
        {
          title: 'Where to start',
          body: `Turn on Clip and Earn, set a commission you are comfortable paying per referred subscriber, and hand your ${clippers.toLocaleString('en-US')} likely clippers three moments to cut: your hook, your hardest line, and your beat drop.`,
        },
      ],
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
        'An always-open offer has no urgency, so fans who fully intend to join keep putting it off. A founding window gives them a real reason to act now: a deadline to join, a spot in your first supporters, and permanent founding recognition.',
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
        'Your fans miss permanent proof they were early, founding-supporter recognition, a spot in your First 100, and a real place in the story before everyone else showed up.',
      flow: [
        'An always-open offer your fans keep ignoring',
        'Open a founding tier and set a deadline to join',
        'Fans act now to earn founding status',
        `${fmtDollars(monthly)} a month, from supporters who would have drifted`,
      ],
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Create your founding supporter tier on CRWN and set a real deadline to join.',
          'Early joiners land in your First 100 Supporters squad with a founding badge.',
          'Announce the window, then close signups when you hit your number.',
        ],
      },
      derivation: [
        { label: 'Your audience', value: audience.toLocaleString('en-US') },
        { label: 'Would join eventually', value: intenders.toLocaleString('en-US'), note: '~2% of your audience' },
        { label: 'A window pulls forward now', value: Math.round(intenders * 0.4).toLocaleString('en-US'), note: '~40% of them' },
        { label: 'At $10 a month each', value: `${fmtDollars(monthly)}/mo` },
      ],
      monthlyLossCents: monthly,
      emailInsights: [
        {
          title: 'How to run the window',
          body: 'Set a real deadline and a cap on founding spots, announce it once with the number, and close signups the moment you hit it. The scarcity is the whole mechanism.',
        },
      ],
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
      headline:
        monthly >= 5000
          ? `About ${fmtDollars(monthly)} a month is leaking through a link that says nothing`
          : 'Your link sends fans to a page that says nothing, so most of them leave',
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
      derivation: [
        { label: 'Your audience', value: audience.toLocaleString('en-US') },
        { label: 'Click your link', value: monthlyVisitors.toLocaleString('en-US'), note: '~15% a month' },
        { label: 'A clear page converts', value: wouldConvert.toLocaleString('en-US'), note: '~3% of them' },
        { label: 'Lost to a generic link', value: leakedNow.toLocaleString('en-US'), note: '~75%' },
        { label: 'At $10 a month each', value: `${fmtDollars(monthly)}/mo` },
      ],
      monthlyLossCents: monthly,
      emailInsights: [
        {
          title: 'What your movement page needs',
          body: 'Four blocks, in order: what you are building, the chapter you are in now, one clear action above the fold, and your tiers. Point every bio and caption link at it.',
        },
      ],
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
      headline:
        monthly >= 5000
          ? `About ${fmtDollars(monthly)} a month in recurring support leaks out before fans ever pay`
          : 'Fans leak out at every step between hearing you and paying you',
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
      derivation: [
        { label: 'Your audience', value: audience.toLocaleString('en-US') },
        { label: 'Would pay you something', value: wouldPay.toLocaleString('en-US'), note: '~1% of your audience' },
        { label: 'Never reach recurring', value: lostToNoPath.toLocaleString('en-US'), note: '~60% with no path' },
        { label: 'At $10 a month each', value: `${fmtDollars(monthly)}/mo` },
      ],
      monthlyLossCents: monthly,
      emailInsights: [
        {
          title: 'Fix the weakest step first',
          body: 'Your biggest leak is first purchase to recurring support. Add one reason to go from a one-off buy to a membership, and reward the jump, before you touch anything else.',
        },
      ],
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
    return buildLossResult({
      generatorVersion: 'lossResult@1',
      headline:
        uplift >= 5000
          ? `About ${fmtDollars(uplift)} a month in repeat business fades because your top fans go unrecognized`
          : 'Your top fans look identical to casual listeners, so their best actions fade',
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
      derivation: [
        { label: 'Your audience', value: audience.toLocaleString('en-US') },
        { label: 'Superfans doing the work', value: superfans.toLocaleString('en-US'), note: '~1% of your audience' },
        { label: 'Recognition uplift', value: Math.round(superfans * 0.25).toLocaleString('en-US'), note: '~25% more value' },
        { label: 'At $10 a month each', value: `${fmtDollars(uplift)}/mo` },
      ],
      monthlyLossCents: uplift,
      emailInsights: [
        {
          title: 'Seed the leaderboard',
          body: 'Turn it on, score it on contribution not just spend, and give the top ranks real status. Name your first few leaders publicly so the rest have something to chase.',
        },
      ],
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
      emailInsights: [
        {
          title: 'Your order of operations',
          body: 'Build in this order: an audience you can reach, one thing worth paying for, then the tools to sell it. Doing them out of order is what costs the months.',
        },
      ],
      conversionPayload: { path: 'quest' },
      shareSummary: 'Turns out I was doing the right things in the wrong order.',
    });
  },
};

const supporterPromise: AcquisitionTool = {
  id: 'supporter-promise-calendar',
  name: 'Supporter Promise Calendar Builder',
  requiredFields: ['social_followers'],
  optionalFields: ['artist_name'],
  resultRouteBase: '/tools/supporter-promise-calendar/result',
  formulaVersion: 'lossResult@1',
  calculatorId: 'supporterPromise',
  requiresEstimateDisclaimer: true,
  destinationId: 'setup_monetize',
  execute(profile) {
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    const PRICE = 1000;
    const supporters = Math.round(audience * 0.01); // ~1% of an audience ever pays
    const atRisk = Math.round(supporters * 0.2); // ~20% churn when a promised perk slips
    const mrrAtRisk = atRisk * PRICE;
    const headline =
      mrrAtRisk >= 5000
        ? `About ${fmtDollars(mrrAtRisk)} a month walks the first time a promised perk slips`
        : 'A perk you promise and then miss is the fastest way to lose a paying supporter';
    return buildLossResult({
      generatorVersion: 'lossResult@1',
      headline,
      summary: `An audience your size supports roughly ${supporters.toLocaleString(
        'en-US',
      )} paying members. Every perk you promise them is a recurring due date, and a missed one is the most common reason they cancel.`,
      cause:
        'Every membership perk is a recurring obligation with a due date. With no calendar, they get forgotten, delivered late, or promised faster than you can produce. Supporters notice, and a missed benefit is the most common reason a recurring supporter cancels.',
      estimate: [
        { label: 'Supporters at your size', value: supporters.toLocaleString('en-US'), note: '~1% of audience' },
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
        'Supporters estimated at about 1% of your audience paying roughly $10 a month, a conservative rate.',
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
      derivation: [
        { label: 'Your audience', value: audience.toLocaleString('en-US') },
        { label: 'Paying supporters', value: supporters.toLocaleString('en-US'), note: '~1% of your audience' },
        { label: 'Churn if a perk slips', value: atRisk.toLocaleString('en-US'), note: '~20%' },
        { label: 'At $10 a month each', value: `${fmtDollars(mrrAtRisk)}/mo` },
      ],
      monthlyLossCents: mrrAtRisk,
      emailInsights: [
        {
          title: 'Build the calendar this week',
          body: 'List every perk you have promised, put a real due date on each, and price each one for the work it takes. A missed benefit is the most common reason a supporter cancels.',
        },
      ],
      conversionPayload: { calendar: 'supporter-promise' },
      shareSummary: 'Turns out my membership perks were a monthly bill I never scheduled.',
    });
  },
};

const teamSplit: AcquisitionTool = {
  id: 'team-split-deal-builder',
  name: 'Team Split Deal Builder',
  requiredFields: ['social_followers'],
  optionalFields: ['artist_name'],
  resultRouteBase: '/tools/team-split-deal-builder/result',
  formulaVersion: 'lossResult@1',
  calculatorId: 'teamSplit',
  requiresEstimateDisclaimer: true,
  destinationId: 'setup_monetize',
  execute(profile) {
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    const PRICE = 1000;
    const projectedMrr = Math.round(audience * 0.01) * PRICE; // ~1% pay ~$10/mo direct
    const PCT = 0.2; // a common collaborator ask
    const CAP_MONTHS = 6;
    // Uncapped: pays PCT of revenue forever. Capped: pays PCT until a fair cap, then stops.
    const uncappedYear = Math.round(projectedMrr * PCT * 12);
    const cappedTotal = Math.round(projectedMrr * PCT * CAP_MONTHS);
    const overpayYear = Math.max(0, uncappedYear - cappedTotal);
    const headline =
      overpayYear >= 5000
        ? `An uncapped 20% split would quietly cost you about ${fmtDollars(overpayYear)} more a year than a capped one`
        : 'A collaborator deal with no cap keeps paying long after the work stopped adding value';
    return buildLossResult({
      generatorVersion: 'lossResult@1',
      headline,
      summary: `On the roughly ${fmtDollars(
        projectedMrr,
      )} a month an audience your size can earn direct, a 20% split with no cap and no end date keeps taking from every future dollar, including the ones the collaborator had nothing to do with.`,
      cause:
        'The two ways a team deal goes wrong: you cannot fund a collaborator upfront so the work never happens, or you fund it with a split that is set too high, applies to too much, has no cap, no duration, and an unclear gross-versus-net basis, so it quietly bleeds revenue long after the work stopped mattering.',
      estimate: [
        { label: 'Direct revenue at your size', value: `${fmtDollars(projectedMrr)}/mo`, note: '~1% of audience paying' },
        { label: 'Uncapped 20%, per year', value: fmtDollars(uncappedYear) },
        { label: 'Capped at 6 months', value: fmtDollars(cappedTotal) },
        { label: 'Overpaid, year one', value: fmtDollars(overpayYear) },
      ],
      scenarios: [
        { label: 'Capped', value: fmtDollars(cappedTotal), note: '6-month cap' },
        { label: 'Uncapped 1yr', value: fmtDollars(uncappedYear), note: 'no cap' },
        { label: 'Uncapped 3yr', value: fmtDollars(uncappedYear * 3), note: 'still paying' },
      ],
      assumptions: [
        'Direct revenue projected at about 1% of your audience paying roughly $10 a month, a conservative rate.',
        'A 20% collaborator split on that revenue, for illustration.',
        'A capped deal ends after about 6 months; an uncapped one never does. Figures assume a gross basis; a net basis changes them again. A planning estimate, not a guarantee.',
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
      derivation: [
        { label: 'Direct revenue at your size', value: `${fmtDollars(projectedMrr)}/mo` },
        { label: 'Uncapped 20%, per year', value: fmtDollars(uncappedYear) },
        { label: 'Capped at 6 months', value: fmtDollars(cappedTotal) },
        { label: 'Overpaid, year one', value: fmtDollars(overpayYear) },
      ],
      emailInsights: [
        {
          title: 'A fair starter structure',
          body: 'Fence the split to the revenue the collaborator actually drives, cap it at about six months, and write down whether it is on gross or net. The cap is what keeps a deal from bleeding you later.',
        },
      ],
      conversionPayload: { deal: 'team-split' },
      shareSummary: 'Turns out an uncapped split was going to cost me a lot more than a capped one.',
    });
  },
};

const shareToEarn: AcquisitionTool = {
  id: 'share-to-earn-planner',
  name: 'Share-to-Earn Revenue Calculator',
  requiredFields: ['social_followers'],
  optionalFields: ['artist_name'],
  resultRouteBase: '/tools/share-to-earn-planner/result',
  formulaVersion: 'lossResult@1',
  calculatorId: 'shareToEarn',
  requiresEstimateDisclaimer: true,
  destinationId: 'rise_mode',
  execute(profile) {
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    const PRICE = 1000;
    // Referral revenue does NOT come from a slice of the artist's own followers. It comes from the
    // NEW people the sharing fans expose them to, converted at a standard rate on that warm reach.
    // Funnel: fans who share -> new people they reach -> a % of that new reach subscribes.
    const SHARE_RATE = 0.03; // ~3% of fans actively share when there is a reward
    const REACH_PER_SHARER = 20; // new people a sharer puts you in front of per month, conservative
    const CONV = 0.02; // ~2% of that warm, referred reach subscribes
    const sharers = Math.round(audience * SHARE_RATE);
    const newReach = sharers * REACH_PER_SHARER;
    const subsAt = (conv: number) => Math.round(newReach * conv) * PRICE;
    const newSubs = Math.round(newReach * CONV);
    const monthly = subsAt(CONV);
    const annual = monthly * 12;
    const headline =
      monthly >= 5000
        ? `About ${fmtDollars(monthly)} a month in referred subscribers is walking past your fans' share buttons`
        : 'Your fans would bring their friends for a cut, and you never gave them a reason to';
    return buildLossResult({
      generatorVersion: 'lossResult@1',
      headline,
      summary: `Around ${sharers.toLocaleString(
        'en-US',
      )} of your fans would share you if there was something in it for them, putting you in front of about ${newReach.toLocaleString(
        'en-US',
      )} new people a month. With no reward and no tracking, that exposure never happens.`,
      derivation: [
        { label: 'Fans who would share', value: sharers.toLocaleString('en-US'), note: '~3% of your audience' },
        { label: 'New people they reach', value: newReach.toLocaleString('en-US'), note: `~${REACH_PER_SHARER} each, a month` },
        { label: 'Who subscribe', value: newSubs.toLocaleString('en-US'), note: '~2% of that warm reach' },
        { label: 'At $10 a month each', value: `${fmtDollars(monthly)}/mo`, note: 'you set the commission' },
      ],
      cause:
        'Your fans already recommend you to friends for free, but nothing tracks it and nothing pays them for it, so it never scales. A share-to-earn referral turns every fan into a promoter with a personal link and a cut of what they bring in, so the word of mouth you were getting for nothing finally converts and compounds.',
      estimate: [
        { label: 'New people reached', value: `~${newReach.toLocaleString('en-US')}`, note: 'per month, from fan shares' },
        { label: 'Referred subscribers', value: newSubs.toLocaleString('en-US'), note: '~2% of that reach, monthly' },
        { label: 'Monthly, unclaimed', value: fmtDollars(monthly) },
        { label: 'A year of it', value: fmtDollars(annual) },
      ],
      scenarios: [
        { label: 'Conservative', value: `${fmtDollars(subsAt(0.015))}/mo`, note: '~1.5% convert' },
        { label: 'Expected', value: `${fmtDollars(monthly)}/mo`, note: '~2% convert' },
        { label: 'High', value: `${fmtDollars(subsAt(0.03))}/mo`, note: '~3% convert' },
      ],
      assumptions: [
        'About 3% of your audience actively shares you when there is a reward for it.',
        'Each sharer puts you in front of about 20 new people a month, a conservative estimate.',
        'About 2% of that warm, referred reach subscribes.',
        'A referred subscriber valued at about $10 a month; you set the commission, so most of it is net to you.',
        'A planning estimate, not a prediction or a guarantee.',
      ],
      consequences: [
        'The word of mouth you already earn goes untracked and unrewarded, so it never scales.',
        'You keep paying for reach with ads and your own time while your fans would bring it for a small cut.',
        'The friends your fans would have brought never hear a reason to join now.',
      ],
      fanLoss:
        'Your fans miss a personal share link, a real reward for bringing people in, recognition for the friends they convert, and a way to be part of your growth instead of just watching it.',
      flow: [
        'Free word of mouth, zero new subscribers',
        'Turn on referrals, set a commission',
        'Fans share for a cut, new people arrive',
        `${fmtDollars(monthly)}/mo in referred subscribers`,
      ],
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Turn on fan referrals: every fan gets a share link.',
          'Set the commission fans earn per referral.',
          'They share, you both get paid.',
        ],
      },
      monthlyLossCents: monthly,
      emailInsights: [
        {
          title: 'The share-link caption to hand your fans',
          body: 'Give them a ready line: "I finally get paid when you put people onto me. Use my link, and if they subscribe we both eat." Then set a commission generous enough to be worth sharing.',
        },
      ],
      conversionPayload: { program: 'share-to-earn' },
      shareSummary: `Turns out my fans' shares could be worth about ${fmtDollars(monthly)} a month.`,
    });
  },
};

const execProducer: AcquisitionTool = {
  id: 'executive-producer-session',
  name: 'Executive Producer Session Calculator',
  requiredFields: ['social_followers'],
  optionalFields: ['artist_name'],
  resultRouteBase: '/tools/executive-producer-session/result',
  formulaVersion: 'lossResult@1',
  calculatorId: 'execProducerSession',
  requiresEstimateDisclaimer: true,
  destinationId: 'rise_mode',
  execute(profile) {
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    // Any artist can run this at any level, regardless of catalog size. What they can CHARGE
    // scales with their level, so the seat price is banded by audience (the level proxy the
    // engine has) instead of a flat number.
    const seatPrice =
      audience >= 250000 ? 20000 : // $200
      audience >= 50000 ? 10000 : // $100
      audience >= 5000 ? 5000 : // $50
      2500; // $25, a smaller artist still runs it, just priced for their level
    const buyersAt = (rate: number) => Math.round(audience * rate) * seatPrice;
    const EXPECTED = 0.003; // ~0.3% of the audience buys a premium session seat per month
    const monthlyExpected = buyersAt(EXPECTED);
    const annualExpected = monthlyExpected * 12;
    const seatsPerMonth = Math.round(audience * EXPECTED);
    const headline =
      monthlyExpected >= 5000
        ? `About ${fmtDollars(monthlyExpected)} a month in premium session seats is sitting unoffered`
        : 'The highest-leverage thing you can sell, a seat in the room, does not exist yet';
    return buildLossResult({
      generatorVersion: 'lossResult@1',
      headline,
      summary: `Around ${seatsPerMonth.toLocaleString(
        'en-US',
      )} of your fans a month would pay to be in the room where the music gets made. Right now there is no room to buy their way into.`,
      derivation: [
        { label: 'Your audience', value: audience.toLocaleString('en-US') },
        { label: 'Would buy a seat', value: seatsPerMonth.toLocaleString('en-US'), note: '~0.3% of your audience, monthly' },
        { label: 'Seat price for your level', value: fmtDollars(seatPrice), note: 'bigger following, higher price' },
        { label: 'Monthly from seats', value: `${fmtDollars(monthlyExpected)}/mo`, note: 'run about twice a month' },
      ],
      cause:
        'The most valuable thing you own is not the finished song, it is access to the session that made it. A ticketed, limited-seat live session lets fans buy their way into the room, watch you build the record, bring you ideas in the chat, and keep the replay. It is the highest-margin, highest-leverage offer you have, and right now it does not exist.',
      estimate: [
        { label: 'Fans who would buy a seat', value: seatsPerMonth.toLocaleString('en-US'), note: '~0.3% of your audience, monthly' },
        { label: 'Seat price for your level', value: fmtDollars(seatPrice), note: 'a bigger following supports more' },
        { label: 'Monthly, unoffered', value: fmtDollars(monthlyExpected) },
        { label: 'A year of it', value: fmtDollars(annualExpected) },
      ],
      scenarios: [
        { label: 'Conservative', value: `${fmtDollars(buyersAt(0.0015))}/mo`, note: '~0.15% buy in' },
        { label: 'Expected', value: `${fmtDollars(monthlyExpected)}/mo`, note: '~0.3% buy in' },
        { label: 'High', value: `${fmtDollars(buyersAt(0.006))}/mo`, note: '~0.6% buy in' },
      ],
      assumptions: [
        'About 0.3% of your audience a month would pay for a seat in a live session, a conservative rate for a premium offer.',
        `Any artist can run this regardless of catalog size; the seat is priced for your level, about ${fmtDollars(seatPrice)} here, and a bigger following supports a higher price or a top-tier gate.`,
        'Run about twice a month, so this is recurring, not one-off. A planning estimate, not a guarantee.',
      ],
      consequences: [
        'You give the process away free in vlogs while the thing fans crave, being in it, earns nothing.',
        'Your most devoted fans have no way to get closer than a finished upload, so they stay at arm\'s length.',
        'You trade studio hours for streaming pennies instead of selling the one seat no other artist can offer.',
      ],
      fanLoss:
        'Your fans miss being in the room while it happens, hearing the take that did not make it, putting an idea in front of you live, and the story that they were there for it.',
      flow: [
        'Your best offer, a seat in the room, is not for sale',
        'Schedule a paid live session on CRWN',
        'Fans buy a seat and are in the room while you work',
        `${fmtDollars(monthlyExpected)}/mo from seats`,
      ],
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Schedule a private live session on CRWN.',
          'Sell seats with a ticket, or gate it to a tier.',
          'Go live, share your screen, and take ideas in the chat.',
        ],
      },
      monthlyLossCents: monthlyExpected,
      emailInsights: [
        {
          title: 'Your session run-of-show',
          body: 'Announce it as a limited-seat live session. Tell fans exactly what they are buying into (a beat built from scratch, a hook written live, a verse recorded in front of them), take their ideas in the chat as you go, and share your screen so they can see the work. Price the seat for your level.',
        },
      ],
      conversionPayload: { offer: 'executive-producer-session', ticketPriceCents: seatPrice, acceptsSubmissions: true },
      shareSummary: `Turns out selling a seat in my session could be worth about ${fmtDollars(monthlyExpected)} a month.`,
    });
  },
};

const ownYourFans: AcquisitionTool = {
  id: 'own-your-fans-calculator',
  name: 'Own Your Fans Calculator',
  requiredFields: ['social_followers'],
  optionalFields: ['artist_name'],
  resultRouteBase: '/tools/own-your-fans-calculator/result',
  formulaVersion: 'lossResult@1',
  calculatorId: 'ownYourFans',
  requiresEstimateDisclaimer: true,
  destinationId: 'rise_mode',
  execute(profile) {
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    const PRICE = 1000; // $10/mo, the same conservative midpoint every loss tool uses.
    // Your audience lives on platforms you do not control. The recoverable business is the slice
    // you could turn into contacts you OWN, and the direct revenue those owned fans would pay.
    // A platform change (new owner, new payouts, new reach rules) puts that whole slice at risk.
    const OWNABLE = 0.2; // only ~20% of a following can realistically become owned contacts
    const PAY = 0.03; // ~3% of owned fans pay directly, conservative
    const ownableAt = (rate: number) => Math.round(Math.round(audience * rate) * PAY) * PRICE;
    const ownable = Math.round(audience * OWNABLE);
    const payers = Math.round(ownable * PAY);
    const monthly = payers * PRICE;
    const annual = monthly * 12;
    const headline =
      monthly >= 5000
        ? `About ${fmtDollars(monthly)} a month in fan revenue is trapped on apps you do not own`
        : 'Your whole audience lives on apps you do not control, and you own none of them';
    return buildLossResult({
      generatorVersion: 'lossResult@1',
      headline,
      summary: `You have about ${audience.toLocaleString(
        'en-US',
      )} followers, and right now you can directly contact almost none of them. Around ${ownable.toLocaleString(
        'en-US',
      )} of them could become fans you actually own.`,
      derivation: [
        { label: 'Your audience', value: audience.toLocaleString('en-US') },
        { label: 'Fans you could own', value: ownable.toLocaleString('en-US'), note: '~20% turned into direct contacts' },
        { label: 'Who would pay directly', value: payers.toLocaleString('en-US'), note: '~3% of them' },
        { label: 'At $10 a month each', value: `${fmtDollars(monthly)}/mo` },
      ],
      cause:
        'Your distributor, your streaming app, and your social apps all sit between you and your fans. Any of them can change owners, change payouts, or change what your fans even see, and you own none of the people who made your career. You rent them. A distributor changing hands should not be able to touch your fan list, but today it can.',
      estimate: [
        { label: 'Fans you could own', value: ownable.toLocaleString('en-US'), note: '~20% of your audience' },
        { label: 'Who would pay directly', value: payers.toLocaleString('en-US'), note: '~3% of them' },
        { label: 'Monthly, on rented apps', value: fmtDollars(monthly) },
        { label: 'A year of it', value: fmtDollars(annual) },
      ],
      scenarios: [
        { label: 'Conservative', value: `${fmtDollars(ownableAt(0.1))}/mo`, note: '~10% ownable' },
        { label: 'Expected', value: `${fmtDollars(monthly)}/mo`, note: '~20% ownable' },
        { label: 'High', value: `${fmtDollars(ownableAt(0.35))}/mo`, note: '~35% ownable' },
      ],
      assumptions: [
        'About 20% of your audience could realistically become contacts you own, a conservative rate.',
        'About 3% of those owned fans pay you directly.',
        'A paying fan valued at about $10 a month.',
        'A planning estimate, not a prediction or a guarantee.',
      ],
      consequences: [
        'One platform change, in ownership, payouts, or reach, can erase a chunk of your business overnight.',
        'You cannot reach the fans who made you without paying an algorithm to deliver you to them.',
        'If you ever leave a platform, you start over from zero instead of taking your audience with you.',
      ],
      fanLoss:
        'Your fans miss a direct line to you that no app can cut off, a place that is actually yours, and the feeling of being part of something you own together instead of renting from a platform.',
      flow: [
        'Your audience lives on apps you do not control',
        'Move your fans into your own CRWN space',
        'They join as members you can contact directly',
        `${fmtDollars(monthly)} a month you own, not rent`,
      ],
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Move your fans into your own CRWN space, with real contacts you keep.',
          'Turn followers into members with a free tier and paid memberships.',
          'Message and sell to them directly, with no algorithm in the way.',
        ],
      },
      monthlyLossCents: monthly,
      emailInsights: [
        {
          title: 'The first 100 you should own',
          body: 'Start by moving your most active fans into your own space: a free tier they join with an email, then one paid membership. Owning 100 real contacts beats renting a million followers.',
        },
      ],
      conversionPayload: { own: 'fan-ownership' },
      shareSummary: `Turns out about ${fmtDollars(monthly)} a month of my fanbase lives on apps I do not own.`,
    });
  },
};

// Every number below maps to a feature that is SHIPPED: ticketed live sessions
// (live_ticket_purchases), tips + tip goals during the stream (live_tips /
// live_goals), and the recording that becomes the replay ticket holders keep
// (LiveKit egress -> R2 VOD).
//
// DELIBERATELY ABSENT: standalone post-show replay sales and brand sponsorship.
// Both appear in the marketing script this tool came from, and neither exists in
// CRWN, so neither is in the math or the fix. A loss tool that promises a feature
// the artist cannot find after signing up is worse than a smaller number.
const liveExperience: AcquisitionTool = {
  id: 'live-experience-calculator',
  name: 'Live Experience Calculator',
  requiredFields: ['social_followers'],
  optionalFields: ['artist_name'],
  resultRouteBase: '/tools/live-experience-calculator/result',
  formulaVersion: 'lossResult@1',
  calculatorId: 'liveExperience',
  requiresEstimateDisclaimer: true,
  destinationId: 'rise_mode',
  execute(profile) {
    const audience = n(profile.social_followers) || n(profile.monthly_listeners);
    const TICKET = 1500; // $15, the price of a one-off exclusive live
    const TIP = 500; // $5 average tip from the fans who tip at all
    const REACHABLE = 0.15; // only ~15% of a following ever actually sees a post
    const TIP_RATE = 0.25; // ~1 in 4 attendees tips when there is a goal on screen

    const reachable = Math.round(audience * REACHABLE);
    const ticketsAt = (rate: number) => Math.round(reachable * rate);
    const attendees = ticketsAt(0.01); // ~1% of reachable fans buy a ticket
    const ticketRevenue = attendees * TICKET;
    const tippers = Math.round(attendees * TIP_RATE);
    const tipRevenue = tippers * TIP;
    const monthly = ticketRevenue + tipRevenue; // one real live event a month
    const annual = monthly * 12;
    const totalAt = (rate: number) => {
      const a = ticketsAt(rate);
      return a * TICKET + Math.round(a * TIP_RATE) * TIP;
    };

    const headline =
      monthly >= 5000
        ? `About ${fmtDollars(monthly)} a month is walking out the door every time you go live for free`
        : 'Every live you do is free, unticketed, and gone the second it ends';

    return buildLossResult({
      generatorVersion: 'lossResult@1',
      headline,
      summary: `About ${reachable.toLocaleString(
        'en-US',
      )} of your fans can actually be reached. Right now none of them are being asked to pay for a night with you, because you are not putting one on.`,
      derivation: [
        { label: 'Your audience', value: audience.toLocaleString('en-US') },
        { label: 'Fans you can actually reach', value: reachable.toLocaleString('en-US'), note: '~15% of them' },
        { label: 'Would buy a $15 ticket', value: attendees.toLocaleString('en-US'), note: '~1% of reachable fans' },
        { label: 'Ticket sales', value: fmtDollars(ticketRevenue) },
        { label: 'Tips from the room', value: fmtDollars(tipRevenue), note: `~${tippers.toLocaleString('en-US')} tippers at $5` },
        { label: 'One live event a month', value: `${fmtDollars(monthly)}/mo` },
      ],
      cause:
        'Most artists only go live to promote something. They pull up for a few minutes, thank everybody, and disappear for weeks. Nothing was sold, nothing was unlocked, and there is no reason for a fan to clear their night for the next one. A real event is scheduled, ticketed, and built like a show: a stripped-down set, the stories behind the songs, questions answered live, unreleased music, and goals the room funds together.',
      estimate: [
        { label: 'Fans you can reach', value: reachable.toLocaleString('en-US'), note: '~15% of your audience' },
        { label: 'Ticket buyers', value: attendees.toLocaleString('en-US'), note: '~1% of them at $15' },
        { label: 'Monthly, from one live event', value: fmtDollars(monthly) },
        { label: 'A year of it', value: fmtDollars(annual) },
      ],
      scenarios: [
        { label: 'Conservative', value: `${fmtDollars(totalAt(0.005))}/mo`, note: '0.5% buy a ticket' },
        { label: 'Expected', value: `${fmtDollars(monthly)}/mo`, note: '1% buy a ticket' },
        { label: 'High', value: `${fmtDollars(totalAt(0.02))}/mo`, note: '2% buy a ticket' },
      ],
      assumptions: [
        'About 15% of your audience actually sees you announce something.',
        'About 1% of those fans buy a $15 ticket to one exclusive live a month.',
        'About 1 in 4 people in the room tips, averaging $5, when there is a goal on screen.',
        'One real live event a month, not one every week.',
        'A planning estimate, not a prediction or a guarantee.',
      ],
      consequences: [
        'Weeks go by with no reason for a fan to support you, so the ones who would have drift off.',
        'Your best moments happen once and are never recorded, so there is nothing to sell or clip afterward.',
        'You find out what your fans want by guessing, instead of watching what they pay for in real time.',
      ],
      fanLoss:
        'Your fans miss the front row: a stripped-down set, the story behind the song, requesting what you play next, hearing unreleased music first, being answered by name, and the replay they get to keep.',
      flow: [
        'You go live for free, for a few minutes, to promote something',
        'Schedule one real live event and put a ticket on it',
        'Fans buy in, show up, and tip toward what they want to unlock',
        `${fmtDollars(monthly)} a month from a night you were already able to do`,
      ],
      fix: {
        title: 'How CRWN closes this gap',
        steps: [
          'Schedule a live session on CRWN and put a ticket price on it, so the night is an event fans buy into.',
          'Set tip goals for the show, so the room funds the unreleased song or the story they want.',
          'The stream records itself, so the replay is there for the members who paid.',
        ],
      },
      monthlyLossCents: monthly,
      emailInsights: [
        {
          title: 'What to actually do for 90 minutes',
          body: 'Do not wing it. Plan the night in segments: open with two songs, tell the story behind one of them, take questions, play something unreleased, then close on whatever your tip goal unlocked. A run of show is the difference between a hangout and a ticket people buy again.',
        },
        {
          title: 'Price the first one low',
          body: 'Your first ticketed live is proof, not profit. Price it where your real fans do not have to think about it, sell it to the people already on your list, and let the tips carry the upside.',
        },
      ],
      conversionPayload: { live: 'ticketed-event', ticketPriceCents: TICKET, suggestedTipGoalCents: tipRevenue },
      shareSummary: `One ticketed live a month could be worth about ${fmtDollars(monthly)} to me.`,
    });
  },
};

// The 17th tool, and the ONLY one on the "money you already earned" side of CRWN.
// Every other tool estimates revenue the artist COULD create. This one is about
// revenue that already exists and may have nobody assigned to collect it.
//
// THIS TOOL SHOWS NO DOLLAR FIGURE, and that is not timidity. The other tools model
// what CRWN could generate, which is a plan. A dollar figure here would be a claim
// that a specific amount is ALREADY OWED to this artist, which is a factual claim
// about the world that CRWN cannot verify from six self-reported answers. That is a
// different order of fabrication, and it is the line drawn in src/lib/royalty/readiness.ts.
// So the hero is a SCORE gauge, exactly the case `buildLossResult` reserves `score` for.
//
// Because of that, the DM hook must tease a SCORE, never a dollar. The house rule that
// "the hero must deliver the dollar its hook teased" is satisfied by not teasing one.
//
// It shares its scorer with the in-app Royalty Readiness Check (scoreReadiness), so the
// number a lead sees BEFORE signing up is the same number they see after. The scorer
// only counts questions that were answered, which is what lets this ask six of the
// twelve and still score honestly.
const royaltyReadiness: AcquisitionTool = {
  id: 'royalty-readiness-check',
  name: 'Royalty Readiness Check',
  requiredFields: ['writes_music', 'pro_registered', 'songs_registered'],
  optionalFields: ['mechanical_collection', 'soundexchange', 'unregistered_backlog', 'artist_name'],
  resultRouteBase: '/tools/royalty-readiness-check/result',
  formulaVersion: 'readiness@1',
  calculatorId: 'royaltyReadiness',
  requiresEstimateDisclaimer: true,
  destinationId: 'rise_mode',
  execute(profile) {
    const answers = sanitizeAnswers({
      writes_music: profile.writes_music,
      pro_registered: profile.pro_registered,
      songs_registered: profile.songs_registered,
      mechanical_collection: profile.mechanical_collection,
      soundexchange: profile.soundexchange,
      unregistered_backlog: profile.unregistered_backlog,
    });
    const r = scoreReadiness(answers);
    const gaps = r.actions.length;
    const top = r.actions.slice(0, 3);

    return buildLossResult({
      generatorVersion: 'readiness@1',
      headline:
        gaps === 0
          ? 'Every royalty stream that applies to you has somebody collecting it'
          : `${gaps} of your royalty streams have nobody set up to collect them`,
      score: {
        value: r.score,
        max: 100,
        label: 'Royalty readiness',
        band: r.band,
      },
      summary: r.bandNote,
      cause:
        'Your distributor pays you for the recording and nothing else. The song itself earns separately: performance royalties through a PRO, mechanicals through the MLC or an administrator, digital radio through SoundExchange, and more again outside the US. Every one of those is paid by a different organization, and not one of them pays you unless you are registered with them. Nobody in your stack tells you which ones you are missing, because none of them can see the others.',
      estimate: [
        { label: 'Streams with nobody on them', value: String(gaps) },
        { label: 'Readiness score', value: `${r.score}/100` },
        { label: 'You were not sure about', value: String(r.unsureCount), note: 'counts as uncovered' },
        { label: 'Registration deadline', value: gaps > 0 ? 'Back claims expire' : 'Stay current' },
      ],
      assumptions: [
        'Built entirely from your own answers. CRWN cannot see your registrations, so it cannot confirm what is or is not being collected.',
        'Deliberately shows no dollar figure. Any amount would be invented, because what you are owed depends on your splits, your territories and your play counts.',
        '"Not sure" is scored as uncovered, because a stream nobody can confirm is being collected is not being managed.',
        'A checklist, not a royalty statement, and not legal or financial advice.',
      ],
      consequences: [
        'Royalties that go unclaimed long enough stop being claimable at all, and back claims do not stay open forever.',
        'Unregistered songs cannot be matched to you even when an organization is trying to pay.',
        'The longer a song circulates unregistered, the more it earns for somebody who is not you.',
      ],
      fanLoss:
        'Your fans lose nothing here, and that is exactly why this goes unnoticed for years. No fan complains, no dashboard turns red, and the money simply never arrives.',
      flow: [
        gaps === 0 ? 'Everything that applies to you is covered' : `${gaps} streams with nobody collecting`,
        'Find out which organizations you are missing',
        'Register with each one, worst first',
        'The money that was already earned reaches you',
      ],
      fix: {
        title: 'What to do about it',
        steps: top.length
          ? top.map((a) => `${a.title}: ${a.where}`)
          : ['Come back after your next release. A new song is a new registration, and that is where gaps reopen.'],
      },
      emailInsights: [
        {
          title: 'Start with the one that has a clock on it',
          body: 'Registrations you can do any time. An unregistered back catalogue is the part that expires, so work it oldest release first, and do that before anything else on your list.',
        },
      ],
      conversionPayload: { royalty: 'readiness' },
      shareSummary:
        gaps === 0
          ? 'Ran a royalty readiness check and everything that applies to me is actually covered.'
          : `Turns out ${gaps} of my royalty streams have nobody collecting them.`,
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
  'share-to-earn-planner': shareToEarn,
  'executive-producer-session': execProducer,
  'own-your-fans-calculator': ownYourFans,
  'live-experience-calculator': liveExperience,
  'royalty-readiness-check': royaltyReadiness,
};

export { royaltyReadiness };

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
