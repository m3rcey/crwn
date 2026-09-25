// Deterministic result generators for lead-magnet tools.
//
// Rules (CLAUDE.md + prompt):
//  - Pure functions of normalized inputs. Same input + same version => same output.
//  - No unsupported claims, no invented audience data, no guarantees.
//  - Currency inputs arrive as DOLLARS (what the user typed); we emit display strings
//    and integer CENTS in conversionPayload. The server re-runs the SAME generator to
//    recompute before persisting/converting (never trusts a client-sent result).
//  - Cap unreasonable outputs. Return useful results even when optional fields are omitted.
//
// Bump GENERATOR_VERSION when logic changes so saved rows keep their historical output.

import type { GeneratedResult, LeadMagnetInputValues, ResultSection } from './types';
import {
  VAULT_INVENTORY_TYPES,
  VAULT_ITEMS_PER_DROP,
  buildVaultSchedule,
  normalizeVaultCadence,
  planVaultDrops,
  readVaultInventory,
  vaultDropPlanLines,
  vaultDropsPerMonth,
  vaultDropsPhrase,
  vaultDropsTitle,
  vaultInventoryLines,
  type VaultCadence,
} from './vaultPlan';

export const GENERATOR_VERSION = '1.0.0';

// ---- helpers ----
const int = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
};
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
const bool = (v: unknown): boolean => v === true || v === 'true';
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);
const usd = (dollars: number): string => '$' + Math.round(dollars).toLocaleString('en-US');
const cents = (dollars: number): number => Math.round(dollars * 100);
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

// ============================================================
// 1. Vault Revenue Planner
// ============================================================
function vaultRevenuePlan(v: LeadMagnetInputValues): GeneratedResult {
  const artist = str(v.artistName, 'You');
  const genre = str(v.genre);
  // Only what the artist entered. Every list, drop and schedule row below is built from this, so a
  // content type they never typed a count for cannot appear anywhere in their plan.
  const nonZero = readVaultInventory(v as Record<string, unknown>);
  const totalItems = nonZero.reduce((s, i) => s + i.count, 0);
  // The cadence the artist picked IS the cadence (the question is required). It used to be
  // silently swapped for a "recommended" one when the runway was short, so the plan the artist
  // read was not the plan they chose. A short runway is now SAID, never acted on for them.
  const cadence: VaultCadence = normalizeVaultCadence(v.dropFrequency) ?? 'weekly';
  const perMonth = vaultDropsPerMonth(cadence);
  const itemsPerDrop = VAULT_ITEMS_PER_DROP;
  const runwayDrops = Math.floor(totalItems / itemsPerDrop);
  const runwayMonths = perMonth > 0 ? Math.floor(runwayDrops / perMonth) : 0;
  const priceDollars = clamp(num(v.monthlyPrice, 0), 0, 500);
  const supporters = int(v.supporterCount);
  const members = clamp(int(v.vaultMembers), 0, 1_000_000);
  const willingPrivate = bool(v.willingPrivate);

  // Readiness score: content depth + cadence feasibility + willingness.
  let readiness = 0;
  readiness += clamp(totalItems, 0, 40) * 1.5; // up to 60
  readiness += willingPrivate ? 20 : 5;
  readiness += runwayMonths >= 2 ? 20 : runwayMonths >= 1 ? 10 : 0;
  readiness = clamp(Math.round(readiness), 0, 100);

  const notReady = totalItems === 0;
  const cadenceWord = CADENCE_WORDS[cadence];
  // Said, not acted on: the artist keeps the cadence they chose and sees what it costs them.
  const shortRunway = !notReady && cadence !== 'monthly' && cadence !== 'quarterly' && runwayMonths < 2;

  // Price band is a planning suggestion, never a guarantee.
  const lowP = priceDollars > 0 ? Math.max(1, Math.round(priceDollars * 0.7)) : 5;
  const highP = priceDollars > 0 ? Math.round(priceDollars * 1.3) : 15;

  // The first drops the ENTERED inventory can fill, five at most. This was one line per content
  // TYPE, so an artist with 42 pieces in two types was shown "First five drops" over two lines.
  const drops = planVaultDrops(nonZero);
  const inventoryLines = vaultInventoryLines(nonZero);
  const contentPhrase = nonZero.length
    ? joinWords(nonZero.map((i) => VAULT_INVENTORY_TYPES.find((t) => t.key === i.key)?.plural ?? i.label.toLowerCase()))
    : 'private content';

  // WHAT THE CATALOG IS WORTH: the Fan Economy scripts' math, on the artist's own numbers only.
  // Fans who would join (their estimate, no rate applied) x their price is the month; x 12 is the
  // year. The catalog's own worth is that month times the months of drops the work they ALREADY
  // made covers at the cadence they chose. Months are rounded to one decimal and the worth is
  // computed from the rounded figure, so the tiles multiply out exactly as shown. Gross: nothing
  // here models CRWN's fee, and the assumptions say so rather than retyping a rate.
  // At least one full drop, or the catalog's worth would read "$0 you have not charged for".
  const priced = runwayDrops > 0 && members > 0 && priceDollars > 0;
  const monthlyDollars = members * priceDollars;
  const monthsCovered = perMonth > 0 ? Math.round((runwayDrops / perMonth) * 10) / 10 : 0;
  const catalogDollars = monthlyDollars * monthsCovered;
  const monthsWord = (m: number) => `${m.toLocaleString('en-US')} month${m === 1 ? '' : 's'}`;

  const sections: ResultSection[] = [
    ...(priced
      ? [
          {
            key: 'worth',
            title: 'What your catalog is worth',
            kind: 'projection' as const,
            // The hero grid renders value + label only, so every label carries its own meaning.
            metrics: [
              { label: 'Fans you expect to pay', value: members.toLocaleString('en-US') },
              { label: 'Your monthly price', value: usd(priceDollars) },
              { label: 'A year of it', value: usd(monthlyDollars * 12) },
              { label: 'Drops you already made', value: runwayDrops.toLocaleString('en-US') },
              { label: `Months those drops cover (${cadenceWord})`, value: monthsCovered.toLocaleString('en-US') },
              { label: 'What your finished work is worth', value: usd(catalogDollars) },
            ],
          },
        ]
      : []),
    {
      // The score is content depth, runway and willingness. It knows nothing about demand, price
      // or a published page, so it is named for what it measures and never for a launch.
      key: 'readiness',
      title: 'Your Vault content readiness',
      kind: 'score',
      score: readiness,
      scoreMax: 100,
      scoreLabel: notReady ? 'Not ready yet: add content first' : readiness >= 60 ? 'Enough content to start' : 'Nearly enough content',
    },
    {
      key: 'inventory',
      title: 'What is already in your Vault',
      kind: 'list',
      items: inventoryLines.length ? inventoryLines : ['No private content entered yet'],
    },
    {
      key: 'offer',
      title: 'Recommended offer',
      kind: 'summary',
      text: notReady
        ? 'Start by capturing a few pieces of private content, then launch a simple monthly Vault. A Vault with zero content is not ready to charge for.'
        : `A ${cadenceWord} Vault${genre ? ` for your ${genre} supporters` : ''}, the cadence you chose. Planning price range: ${usd(lowP)} to ${usd(highP)} per month. You have about ${runwayDrops} drops (${runwayMonths} month${runwayMonths === 1 ? '' : 's'}) of runway at that cadence.${
            shortRunway ? ' That is under two months of content, so a slower cadence would stretch it. The choice stays yours.' : ''
          }`,
    },
    {
      key: 'schedule',
      title: '30-day release plan',
      kind: 'schedule',
      rows: notReady
        ? [{ when: 'First', what: 'Capture a few pieces of private content. There is nothing to schedule until you have some.' }]
        : buildVaultSchedule(cadence, drops),
    },
    notReady
      ? {
          key: 'firstFive',
          title: 'Five things you could capture first',
          kind: 'list',
          items: ['Record one voice memo introducing the Vault', 'Share one unreleased snippet', 'Post one lyric or note', 'Add one behind-the-scenes clip', 'Preview your next song idea'],
        }
      : {
          key: 'firstFive',
          title: vaultDropsTitle(drops.length),
          kind: 'list',
          items: drops.map((d, idx) => `Drop ${idx + 1}: ${d}`),
        },
    {
      key: 'pitch',
      title: 'Pitch to your fans',
      kind: 'copy',
      text: `${artist} is opening a private Vault. ${contentPhrase.charAt(0).toUpperCase()}${contentPhrase.slice(1)} you will not find anywhere else, dropped ${cadenceWord}. Join for ${priceDollars > 0 ? usd(priceDollars) : usd(lowP)} a month and hear it first.`,
    },
    {
      key: 'assumptions',
      title: 'Assumptions',
      kind: 'assumptions',
      items: [
        `Runway assumes about ${itemsPerDrop} items per drop at the ${cadenceWord} cadence you chose.`,
        'The readiness score measures your content and your runway only. It does not measure demand, your price, or whether your page and payouts are set up.',
        'Every drop in this plan uses only the content you entered. Nothing here assumes material you did not list.',
        'Price range is a planning suggestion based on your comfort input, not a demand measurement.',
        ...(priced
          ? [
              `How many fans would pay (${members.toLocaleString('en-US')}) is your own estimate. CRWN applies no conversion rate to it.`,
              `Your catalog's worth is fans x price x the months your finished drops cover. The monthly and yearly figures are gross, before CRWN's fee and card processing.`,
              'A planning number, not a prediction or a promise.',
            ]
          : []),
        supporters > 0 && priced && members > supporters
          ? `You expect more fans to pay (${members.toLocaleString('en-US')}) than you have supporters today (${supporters.toLocaleString('en-US')}). That may be worth a second look.`
          : supporters > 0
            ? `You have ${supporters} current supporters as context only.`
            : 'No current supporter count provided.',
      ],
    },
    {
      key: 'nextSteps',
      title: 'Build it in CRWN',
      kind: 'nextSteps',
      items: ['Create a supporter tier for the Vault', 'Add your first gated drop', 'Post the launch pitch to your fans'],
    },
  ];

  return {
    generatorVersion: GENERATOR_VERSION,
    // "Your Vault is 100% ready" read as launch readiness and was re-shown after signup to an
    // artist with no live offer. The score is about CONTENT, so the headline says content.
    // Priced (every result from the current wizard): the headline and hero carry the money, and the
    // readiness score moves below it as a section. A result without a fan count (saved before the
    // question existed) keeps the content-readiness headline it always had.
    headline: notReady
      ? 'Your Vault needs a little content first'
      : priced
        ? `${artist}, your catalog could earn ${usd(monthlyDollars)} a month`
        : `${artist}, your Vault content is ${readiness}% ready`,
    summary: notReady
      ? 'You have not entered private content yet. Capture a few pieces and you can launch a recurring supporter Vault.'
      : priced
        ? `${members.toLocaleString('en-US')} fans at ${usd(priceDollars)} a month. What you already made covers ${monthsWord(monthsCovered)} of drops: ${usd(catalogDollars)} you have not charged for.`
        : `You have enough for about ${runwayDrops} drops. Here is your ${cadenceWord} Vault plan and ${vaultDropsPhrase(drops.length)}.`,
    ...(priced
      ? {
          heroEyebrow: 'Your unreleased catalog, unsold, every month',
          heroValue: usd(monthlyDollars),
          heroSuffix: '/mo',
          // Gross subscription money, the same kind of figure the DM Vault result already stores,
          // so projected GMV and the nurture emails read it without a special case.
          estimatedMonthlyCents: cents(monthlyDollars),
          estimatedAnnualCents: cents(monthlyDollars * 12),
        }
      : {}),
    sections,
    conversionPayload: {
      tierName: 'Gold',
      priceCents: cents(priceDollars > 0 ? priceDollars : lowP),
      // The artist's OWN answers, carried so the builder opens on them instead of on a template:
      // the cadence they picked, the inventory they counted, and the plan derived from both.
      cadence,
      inventory: nonZero.map((i) => ({ key: i.key, count: i.count })),
      dropPlan: notReady ? [] : vaultDropPlanLines(cadence, drops),
      description: `Private Vault: ${contentPhrase} dropped ${cadenceWord}.`,
    },
    shareSummary: notReady
      ? 'I just planned my private fan Vault with CRWN.'
      : `I just planned a ${cadenceWord} fan Vault: ${runwayDrops} drops ready to go.`,
  };
}

const CADENCE_WORDS: Record<VaultCadence, string> = {
  weekly: 'weekly',
  biweekly: 'biweekly',
  monthly: 'monthly',
  quarterly: 'quarterly',
};

const joinWords = (words: string[]): string =>
  words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

// ============================================================
// 2. Proof of Demand Test Builder
// ============================================================
function proofOfDemandTest(v: LeadMagnetInputValues): GeneratedResult {
  const idea = str(v.ideaDescription, 'your idea');
  const ideaType = str(v.ideaType, 'product');
  const signal = str(v.signalType, 'rsvp'); // rsvp | vote | waitlist
  const fanbase = int(v.fanbaseSize);
  let threshold = int(v.threshold);
  const priceDollars = clamp(num(v.price, 0), 0, 100000);
  const city = str(v.city);

  // Recommend a sane threshold range. If a fanbase is given, anchor to 3-10% of it.
  const recLow = fanbase > 0 ? Math.max(10, Math.round(fanbase * 0.03)) : 25;
  const recHigh = fanbase > 0 ? Math.max(recLow + 10, Math.round(fanbase * 0.1)) : 100;
  // Cap an unreasonable user threshold that exceeds their whole fanbase.
  const capped = fanbase > 0 && threshold > fanbase;
  if (capped) threshold = Math.round(fanbase * 0.1);
  if (threshold <= 0) threshold = recLow;

  const signalVerb = signal === 'vote' ? 'vote' : signal === 'waitlist' ? 'join the waitlist' : 'RSVP';

  const sections: ResultSection[] = [
    {
      key: 'structure',
      title: 'Your demand test',
      kind: 'summary',
      text: `Before you spend on ${ideaType === 'product' ? 'this product' : `this ${ideaType}`}${city ? ` in ${city}` : ''}, ask fans to ${signalVerb}. If ${threshold} fans ${signalVerb}, you build it. If not, you saved the money.`,
    },
    {
      key: 'threshold',
      title: 'Recommended threshold',
      kind: 'projection',
      metrics: [
        { label: 'Your target', value: `${threshold} ${signalVerb}s` },
        { label: 'Suggested range', value: `${recLow} to ${recHigh}`, note: fanbase > 0 ? 'about 3 to 10 percent of your fanbase' : 'starting range for a first test' },
        ...(priceDollars > 0 ? [{ label: 'Interest price (not a charge)', value: usd(priceDollars), note: 'signals willingness to pay, no card is charged' }] : []),
      ],
    },
    {
      key: 'copy',
      title: 'Launch copy',
      kind: 'copy',
      text: `Headline: Should I make this?\n\nAsk: I am thinking about ${idea}. If enough of you ${signalVerb}, I will build it. ${signalVerb === 'RSVP' ? 'Tap RSVP' : signalVerb === 'vote' ? 'Cast your vote' : 'Join the waitlist'} if you want it.\n\nReminder: ${threshold - Math.round(threshold * 0.4)} of ${threshold} so far. Close to unlocking.\n\nIf it hits: You did it. ${idea} is happening because you proved the demand.\n\nIf it misses: Not this time. Thank you for being honest, it saved me from guessing.`,
    },
    {
      key: 'nextSteps',
      title: 'Build it in CRWN',
      kind: 'nextSteps',
      items: ['Open Proof of Demand', 'Set your idea, signal type, and threshold', 'Share the public test link with your fans'],
    },
    {
      key: 'assumptions',
      title: 'Assumptions',
      kind: 'assumptions',
      items: [
        'The interest price is a non-binding signal. Fans are not charged in a demand test.',
        capped ? 'Your threshold was above your whole fanbase, so it was capped to a reachable target.' : 'Threshold range is a planning suggestion, not a prediction.',
      ],
    },
  ];

  return {
    generatorVersion: GENERATOR_VERSION,
    headline: 'Your demand test is ready',
    summary: `Ask fans to ${signalVerb}. Hit ${threshold} and you build it. Miss it and you kept your money.`,
    sections,
    conversionPayload: {
      title: (idea.length > 110 ? idea.slice(0, 107) + '...' : idea) || 'New idea',
      description: idea,
      signal_type: signal,
      goal_count: threshold,
      test_price: priceDollars > 0 ? cents(priceDollars) : null,
      unlock_message: `If ${threshold} of you ${signalVerb}, I will make it.`,
    },
    shareSummary: `I am testing demand before I spend a dollar. ${threshold} ${signalVerb}s and it is a go.`,
  };
}

// ============================================================
// 3. Fan Mission Generator
// ============================================================
function fanMission(v: LeadMagnetInputValues): GeneratedResult {
  const action = str(v.fanAction, 'share'); // share | clip | referral | subscribe | rsvp | presave | comment
  const destination = str(v.destinationUrl);
  const target = Math.max(1, int(v.participantCount, 50));
  const rewardType = str(v.rewardType, 'points'); // points | badge | access | custom
  const rewardDetail = str(v.rewardDetail);
  const leaderboard = bool(v.leaderboard);
  // Verification is derived from the action below (`a.verify`), never asked: a pre-save is
  // automatic, a share needs a link or a screenshot. Older saved rows may still carry a `proof`
  // answer in input_data; nothing reads it, and their stored result is unchanged.

  const actionCopy: Record<string, { title: string; do: string; verify: string }> = {
    share: { title: 'Share the track', do: 'Share the link to your story or feed', verify: 'Screenshot or link to your post' },
    clip: { title: 'Clip and post', do: 'Make a short clip and post it', verify: 'Link to your clip' },
    referral: { title: 'Bring a friend', do: 'Get a friend to follow or subscribe', verify: 'They use your referral link' },
    subscribe: { title: 'Join the inner circle', do: 'Subscribe to unlock the goal', verify: 'Automatic on subscribe' },
    rsvp: { title: 'RSVP to the moment', do: 'RSVP so we hit the number', verify: 'Automatic on RSVP' },
    presave: { title: 'Pre-save the release', do: 'Pre-save before drop day', verify: 'Automatic on pre-save' },
    comment: { title: 'Drop your comment', do: 'Comment your answer', verify: 'Your comment is counted' },
  };
  const a = actionCopy[action] ?? actionCopy.share;

  const rewardText =
    rewardType === 'points'
      ? 'Points toward the leaderboard'
      : rewardType === 'badge'
      ? rewardDetail || 'A supporter badge'
      : rewardType === 'access'
      ? rewardDetail || 'Unlock exclusive access'
      : rewardDetail || 'A custom reward';

  const sections: ResultSection[] = [
    { key: 'summary', title: 'Mission summary', kind: 'summary', text: `${a.title}: get ${target} fans to complete one clear action before the deadline. One action, one number, one reward.` },
    { key: 'whatFansDo', title: 'What fans do', kind: 'list', items: [a.do, destination ? `Go to: ${destination}` : 'Use the link on your mission', `Goal: ${target} fans complete this`] },
    { key: 'verification', title: 'How completion is verified', kind: 'summary', text: a.verify },
    { key: 'reward', title: 'Reward', kind: 'summary', text: `${rewardText}${leaderboard ? '. Top fans rise on the leaderboard.' : ''}` },
    {
      key: 'promo',
      title: 'Promotion copy',
      kind: 'copy',
      text: `Launch: New mission. ${a.do}. First ${target} of us and we unlock it. Link in bio.\n\nStory: We are at [X] of ${target}. Almost there. ${a.do}.\n\nDone: We did it. ${target} of you showed up. Reward is live.`,
    },
    { key: 'nextSteps', title: 'Launch in CRWN', kind: 'nextSteps', items: ['Open the mission builder', 'Review the prefilled action, target, and reward', 'Publish and share with your fans'] },
  ];

  // Map to the real `missions` insert shape (see discovery: type/goal_count/reward_type...).
  const missionType = ['share', 'clip', 'referral', 'subscribe', 'rsvp', 'vote', 'live', 'city', 'comment', 'presave'].includes(action) ? action : 'custom';
  const rt = ['points', 'badge', 'credits', 'access', 'commission', 'custom'].includes(rewardType) ? rewardType : 'points';

  return {
    generatorVersion: GENERATOR_VERSION,
    headline: `${a.title} mission`,
    summary: `One action, ${target} fans, one reward. Here is your ready-to-launch fan mission.`,
    sections,
    conversionPayload: {
      type: missionType,
      title: a.title,
      description: `${a.do}. Goal: ${target} fans.`,
      goal_count: target,
      reward_type: rt,
      reward_detail: rewardDetail || rewardText,
      cta: a.title,
      audience: 'all',
    },
    shareSummary: `Running a fan mission: ${a.title.toLowerCase()} to ${target} and we unlock it.`,
  };
}

// ============================================================
// 4. Clip-to-Earn Campaign Planner
// ============================================================
function clipToEarnCampaign(v: LeadMagnetInputValues): GeneratedResult {
  const source = str(v.sourceContent, 'your content');
  const sourceType = str(v.sourceType, 'song');
  const platforms = list(v.platforms);
  const clipTypes = list(v.clipTypes);
  const rewardType = str(v.rewardType, 'badge'); // badge | points | access | commission_boost | custom
  const topClipAward = str(v.topClipAward);
  const clipLength = str(v.clipLength, '15-30s');
  const hashtags = list(v.requiredHashtags);
  const caption = str(v.requiredCaption);
  const approvalRequired = bool(v.approvalRequired);

  const platformList = platforms.length ? platforms.join(', ') : 'TikTok, Reels, Shorts';
  const clipList = clipTypes.length ? clipTypes : ['hook moment', 'emotional line', 'beat drop'];

  // Named so the SAME derived lists can ride into conversionPayload for the builder's prefill,
  // instead of the builder re-asking for rules and moments the artist already answered for. Nothing
  // is recomputed and nothing new is derived: these are the exact strings the result renders.
  const clipRules = [
    `Length: ${clipLength}`,
    `Platforms: ${platformList}`,
    caption ? `Caption must include: ${caption}` : 'Use your own hook in the caption',
    hashtags.length ? `Hashtags: ${hashtags.map((h) => (h.startsWith('#') ? h : '#' + h)).join(' ')}` : 'Add the campaign hashtag',
    approvalRequired ? 'Clips are reviewed before they count' : 'Clips count automatically once posted',
    'Only clip content you have the rights to use',
  ];
  const bestMoments = clipList.map((c) => `A ${c} from ${source}`);

  const sections: ResultSection[] = [
    { key: 'brief', title: 'Clipper brief', kind: 'summary', text: `Clip ${source} (${sourceType}) into ${clipLength} vertical clips for ${platformList}. Post them, tag the campaign, and climb the board.` },
    { key: 'rules', title: 'Clip rules', kind: 'list', items: clipRules },
    { key: 'bestMoments', title: 'Best moments to clip', kind: 'checklist', items: bestMoments },
    { key: 'reward', title: 'Reward structure', kind: 'summary', text: `${rewardLabel(rewardType)}${topClipAward ? `. Top clip wins: ${topClipAward}.` : ''}` },
    { key: 'captions', title: 'Approved captions', kind: 'copy', text: `1) You have not heard ${source} until you have heard this part.\n2) POV: this ${sourceType} lives in your head rent free.\n3) Tag someone who needs ${source} today.` },
    { key: 'moderation', title: 'Moderation checklist', kind: 'checklist', items: ['Clip uses only approved source content', 'Caption and hashtags present', 'Length within range', 'No misleading edits'] },
    { key: 'launch', title: 'Launch post', kind: 'copy', text: `Clip-to-earn is live. Clip ${source}, post it on ${platformList}, tag the campaign. Best clips win.` },
    { key: 'nextSteps', title: 'Launch in CRWN', kind: 'nextSteps', items: ['Open the bounty builder', 'Review the prefilled challenge and reward', 'Publish and share the best moments with your clippers'] },
  ];

  // Map to /api/bounties payload (see discovery). v1 rewards are NON-CASH.
  const bountyReward = ['points', 'badge', 'access', 'commission_boost', 'custom'].includes(rewardType) ? rewardType : 'badge';

  return {
    generatorVersion: GENERATOR_VERSION,
    headline: 'Your clip-to-earn campaign',
    summary: `A structured clipping campaign for ${source}: rules, best moments, captions, and rewards.`,
    sections,
    conversionPayload: {
      title: `Clip ${source}`,
      description: `Clip ${source} (${sourceType}) into ${clipLength} clips for ${platformList}.`,
      bountyType: 'most_clicks',
      rewardType: bountyReward,
      rewardDetail: topClipAward || rewardLabel(rewardType),
      eligibility: 'all',
      approvalRequired,
      // ADDITIVE, for the deliverable builder's prefill only. The bounty adapter (bountyParams)
      // reads named keys and is unaffected, the rendered sections are byte-identical, and no number
      // changes, so GENERATOR_VERSION is deliberately NOT bumped: it is shared with the vault,
      // proof-of-demand and fan-mission generators, whose output did not change. Results saved
      // before this simply lack these keys and the builder falls back to its generic defaults.
      sourceContent: str(v.sourceContent),
      moments: bestMoments,
      rules: clipRules,
    },
    shareSummary: `Launching a clip-to-earn campaign. Clip it, post it, climb the board.`,
  };
}

function rewardLabel(rewardType: string): string {
  switch (rewardType) {
    case 'points':
      return 'Clippers earn points on the leaderboard';
    case 'access':
      return 'Top clippers unlock exclusive access';
    case 'commission_boost':
      return 'Top clippers get a commission boost on the existing clip-to-earn rate';
    case 'custom':
      return 'Custom reward for top clippers';
    default:
      return 'Clippers earn a badge for taking part';
  }
}

// ---- dispatcher ----
export type ResultGeneratorKey =
  | 'vaultRevenuePlan'
  | 'proofOfDemandTest'
  | 'fanMission'
  | 'clipToEarnCampaign';

const GENERATORS: Record<ResultGeneratorKey, (v: LeadMagnetInputValues) => GeneratedResult> = {
  vaultRevenuePlan,
  proofOfDemandTest,
  fanMission,
  clipToEarnCampaign,
};

export function generateResult(key: string, values: LeadMagnetInputValues): GeneratedResult {
  const gen = GENERATORS[key as ResultGeneratorKey];
  if (!gen) throw new Error(`Unknown result generator: ${key}`);
  return gen(values);
}
