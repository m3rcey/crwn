// Calculator-specific modules. These are what make one universal core sequence serve every
// calculator: the core email says "here is your quick win" and this file supplies the words for
// the exact calculator the lead ran.
//
// Every slug in the lead-magnet registry (plus the external "worth" tool) has an explicit module so
// the copy is accurate and points at a REAL feature. Any slug without one falls back to a module
// derived from the registry (feature name + conversion route), so a newly added calculator is still
// nurtured, just more generically, until someone writes it a bespoke module.
//
// No em dashes. "the CRWN app", never bare "CRWN". Nothing here invents a number.

import { getLeadMagnet, EXTERNAL_TOOLS } from '@/lib/leadMagnets/registry';
import { isSubAvatarId, type SubAvatarId } from '@/lib/avatars/taxonomy';
import type { CalculatorModule } from './types';

// Sub-avatar modules (docs/SUB_AVATARS.md). All four avatars run the SAME calculator, so the tool
// slug can no longer personalize their nurture: the avatar does. When the enrollment's stored
// result names an avatar funnel, its module wins over the slug's; otherwise nothing changes.
const AVATAR_MODULES: Record<SubAvatarId, Omit<CalculatorModule, 'slug'>> = {
  highest_priority_empire_builder: {
    featureName: 'Membership',
    quickWin:
      'Pull the list of every fan who has ever paid you anything, anywhere. That list is the launch audience, and it is the one asset your platforms cannot take back.',
    firstBuild: 'Build the full four-tier ladder, not just an entry tier, and open it to the buyers you already have.',
    useCase:
      'The empire you are already running across separate platforms becomes one business where every fan and every offer compounds instead of resetting.',
    destinationRoute: '/offers/new',
  },
  established_independent_operator: {
    featureName: 'Membership',
    quickWin:
      'Pick the one tool in your stack you would most like to stop paying for, and write down exactly what it holds. That is your migration list, and it is shorter than it feels.',
    firstBuild: 'Build one membership that covers what your current tools cover, then move fans over on your own schedule.',
    useCase:
      'The business you already run yourself gets one operating system, so a new offer starts from your existing fans instead of from zero.',
    destinationRoute: '/offers/new',
  },
  brand_led_hip_hop_artist: {
    featureName: 'Membership',
    quickWin:
      'Change one link. Send this week\'s attention to a page you own instead of a platform profile, and watch how many of them you can still reach next month.',
    firstBuild: 'Build the membership your content has been missing a destination for, then point every caption at it.',
    useCase:
      'The attention your brand earns every week starts converting into members and contacts you own, instead of into metrics on somebody else\'s platform.',
    destinationRoute: '/offers/new',
  },
  rnb_empire_builder: {
    featureName: 'Membership',
    quickWin:
      'Choose five unreleased pieces your closest fans have never heard. That is a depth tier, and it is already recorded.',
    firstBuild: 'Build a depth-first membership: the vault plus one members-only listening session.',
    useCase:
      'The fans who already stayed get somewhere real to go deeper, and the devotion that paid nothing becomes recurring support.',
    destinationRoute: '/offers/new',
  },
};

const MODULES: Record<string, Omit<CalculatorModule, 'slug'>> = {
  'vault-revenue-planner': {
    featureName: 'Artist Vault',
    quickWin: 'Pick five things off your hard drive: a demo, a voice memo, an alternate take, a behind-the-scenes clip, a lyric photo. Those five are the first drops in a paid Vault. They are already made.',
    firstBuild: 'Turn on a Vault and load your first five items behind it.',
    useCase: 'The unreleased music sitting on your phone becomes a monthly Vault your real supporters pay for, instead of earning nothing where it is.',
    destinationRoute: '/studio',
  },
  'proof-of-demand-test-builder': {
    featureName: 'Proof of Demand',
    quickWin: 'Take the one idea you were about to spend money on and, before you spend anything, ask your fans to raise their hand for it first.',
    firstBuild: 'Set up one demand test with a clear yes-count that makes it real.',
    useCase: 'The merch run or show you were going to fund on a guess becomes something fans prove they want before you commit a dollar.',
    destinationRoute: '/proof-of-demand/new',
  },
  'fan-mission-generator': {
    featureName: 'Fan Missions',
    quickWin: 'Replace "please support me" with one specific ask: one action, one number, one reward. Vague asks get scrolled past. A clear mission gets done.',
    firstBuild: 'Launch one fan mission with a single action and a reward worth completing.',
    useCase: 'The fans who would have helped if you asked properly finally have one clear thing to do, and you can actually count who did it.',
    destinationRoute: '/missions/new',
  },
  'clip-to-earn-campaign-planner': {
    featureName: 'Clip-to-Earn',
    quickWin: 'Pick the one moment of yours fans already clip and give them the rules to point every clip back at you instead of growing a stranger\'s page.',
    firstBuild: 'Set up one Clip-to-Earn campaign around a moment you own.',
    useCase: 'The clips fans already make for free start driving reach and revenue to you instead of disappearing into someone else\'s feed.',
    destinationRoute: '/bounties/new',
  },
  'founder-window-builder': {
    featureName: 'Founder Window',
    quickWin: 'Give the fans who keep saying "later" a reason to join now: a limited founding-supporter window with something the ones who wait will not get.',
    firstBuild: 'Open a founder window with a founding-supporter perk and an end date.',
    useCase: 'The supporters who fully intend to join but never do get pulled forward now, instead of leaking away one "later" at a time.',
    destinationRoute: '/profile',
  },
  'movement-page-blueprint': {
    featureName: 'Movement Page',
    quickWin: 'Replace the generic link in your bio with one page that answers the three questions a new fan actually has, so your traffic stops bouncing off a streaming link.',
    firstBuild: 'Build one movement page and make it the link in your bio.',
    useCase: 'The traffic you already send to a generic profile starts converting into fans and supporters instead of leaking away.',
    destinationRoute: '/profile',
  },
  'fan-journey-builder': {
    featureName: 'Fan Journey',
    quickWin: 'Map the single worst leak: the step where fans who could pay you drop off. Usually it is first purchase to recurring. Fix that one step first.',
    firstBuild: 'Set up the one path that carries a new listener to a first small yes.',
    useCase: 'The fans who leak out between hearing you and paying you get a path from one step to the next instead of a dead end.',
    destinationRoute: '/profile',
  },
  'top-fan-leaderboard-builder': {
    featureName: 'Top Fan Leaderboard',
    quickWin: 'Give your most active supporters a status the rest can see. When contribution is invisible it fades. When it is visible it compounds.',
    firstBuild: 'Turn on a top-fan leaderboard so your best supporters are marked apart.',
    useCase: 'Your top fans, who quietly do most of the work, get recognition that keeps them doing it instead of going invisible and stopping.',
    destinationRoute: '/profile',
  },
  'artist-quest-path': {
    featureName: 'Rise Mode',
    quickWin: 'Do the next right thing, not the next loud thing. Rise Mode picks the one action that unlocks the rest, so you stop building things in the wrong order.',
    firstBuild: 'Start Rise Mode and take the first action it puts in front of you.',
    useCase: 'The months you would lose doing the right work in the wrong order turn into a sequence that actually compounds.',
    destinationRoute: '/profile/artist',
  },
  'supporter-promise-calendar': {
    featureName: 'Promise Calendar',
    quickWin: 'Write down every perk you promised a supporter and put a real date on each one. A missed perk is the most common reason a supporter cancels.',
    firstBuild: 'Put your membership perks on a Promise Calendar with real due dates.',
    useCase: 'The recurring revenue you put at risk with perks you never scheduled gets protected, because nothing quietly slips past a due date.',
    destinationRoute: '/profile',
  },
  'team-split-deal-builder': {
    featureName: 'Team Splits',
    quickWin: 'Take one collaborator deal and add the two things an open-ended split is missing: a cap and an end date. That is the difference between fair and forever.',
    firstBuild: 'Set up one capped team split so a collaborator is paid fairly, not forever.',
    useCase: 'An uncapped split that keeps taking from every future dollar becomes a capped deal that ends when the work stops mattering.',
    destinationRoute: '/profile',
  },
  'share-to-earn-planner': {
    featureName: 'Fan Referrals',
    quickWin: 'Give the fans who already recommend you for free a cut and a link to track. Word of mouth you do not reward never scales.',
    firstBuild: 'Turn on Fan Referrals so a fan who brings a friend earns a share.',
    useCase: 'The referrals your fans already make out of loyalty start converting and scaling, instead of going untracked and unpaid.',
    destinationRoute: '/profile',
  },
  'executive-producer-session': {
    featureName: 'Live Experiences',
    quickWin: 'Sell one seat in the room where the record gets made. The access to your process is your highest-margin offer at any level, and right now it sells for nothing.',
    firstBuild: 'Schedule one ticketed, limited-seat live session where fans watch you build.',
    useCase: 'The most valuable thing you own, access to the room, becomes a limited paid session instead of something you give away for free.',
    destinationRoute: '/studio/live',
  },
  'own-your-fans-calculator': {
    featureName: 'Own Your Fans',
    quickWin: 'Start capturing the one thing you do not own: a direct line to your fans. Every follower on an app you do not control can vanish with one rule change.',
    firstBuild: 'Set up one fan-capture page and start collecting fans you actually own.',
    useCase: 'The fanbase that lives on apps you do not control becomes a direct relationship you own, so you cannot lose it overnight.',
    destinationRoute: '/own-your-fans/plan',
  },
  'live-experience-calculator': {
    featureName: 'Live Experiences',
    quickWin: 'Turn your next "thanks for pulling up" livestream into one real ticketed event fans pay to attend and can tip during. Free streams end and leave nothing behind.',
    firstBuild: 'Set up one ticketed live experience with tips turned on.',
    useCase: 'The livestreams you only run to promote become one real ticketed event a month, with a ticket, tips, and something to sell after.',
    destinationRoute: '/studio/live',
  },
  'royalty-readiness-check': {
    featureName: 'Royalty Readiness',
    quickWin: 'Take the single gap your check flagged reddest and close it this week. Back claims do not stay open forever, so the oldest gap is the one that expires first.',
    firstBuild: 'Open the full readiness check and close the first collection gap it found.',
    useCase: 'The royalty streams you have earned from but nobody is collecting get someone assigned to them before the back claims expire.',
    destinationRoute: '/royalty-readiness',
  },
  'fan-stack-calculator': {
    featureName: 'Consolidated Membership',
    quickWin: 'List every tool currently holding a piece of your fan business and what each one knows that the others do not. That list is the cost of fragmentation, and it is also your migration checklist.',
    firstBuild: 'Rebuild your existing tiers as one four-tier membership in the CRWN app, priced so moving is an upgrade for your current members.',
    useCase: 'The members, buyers and community scattered across Patreon, Discord and your shop become one fan relationship in one place, where every offer can see every fan.',
    destinationRoute: '/offers/new',
  },
  'between-tour-calculator': {
    featureName: 'VIP Membership',
    quickWin: 'Pull the list of everyone who ever bought VIP or premium access from you. Those fans already proved they pay for access, and they are the first invite to a year-round membership.',
    firstBuild: 'Open one recurring VIP tier with early ticket access and a member stream in the off months.',
    useCase: 'The revenue that stops the night the tour ends becomes a membership your VIP buyers pay every month, tour or no tour.',
    destinationRoute: '/offers/new',
  },
  worth: {
    featureName: 'Membership',
    // NO "streaming pays pennies" framing, in either line. docs/ICP.md is explicit that the target
    // artist already knows that, and saying it tells them they are in the wrong room. The previous
    // copy said "Streaming pays you fractions of a cent" and "earn you almost nothing on streaming",
    // which is the exact beginner framing the ICP forbids, and it shipped because the content test
    // scanned only the sequence and never the modules injected into it.
    quickWin:
      'Set one monthly price for the paying group your result found. Not for your whole audience: for the small share who already buy from you somewhere else. That price is the only number a membership needs to start.',
    firstBuild: 'Build one fan membership tier and set its monthly price.',
    useCase:
      'The fans already paying you across other platforms get one place to join instead, priced by you, where the fan and the sale finally sit together.',
    destinationRoute: '/profile',
  },
};

// Derive a safe generic module from the registry when a slug has no bespoke entry above.
function fallbackModule(slug: string): CalculatorModule {
  const cfg = getLeadMagnet(slug);
  const ext = EXTERNAL_TOOLS.find((t) => t.key === slug);
  const featureName = cfg?.featureName || ext?.featureName || 'first CRWN build';
  const destinationRoute = cfg?.conversionTarget?.route || '/studio';
  return {
    slug,
    featureName,
    quickWin: `Build the first small version of your ${featureName} in the CRWN app. It takes minutes, and nothing you calculated gets lost.`,
    firstBuild: `Turn on your ${featureName} and set up its first version.`,
    useCase: `The opportunity your result found becomes a real ${featureName} inside the CRWN app instead of a number that stays out of reach.`,
    destinationRoute,
  };
}

/**
 * The nurture module for a lead. The sub-avatar wins when one is known, because all four avatars
 * run the same calculator and the slug alone would give every one of them identical copy. Falls
 * back to the tool's bespoke module, then to one derived from the registry, so a calculator with
 * no module is still nurtured.
 */
export function moduleFor(slug: string, subAvatar?: string | null): CalculatorModule {
  if (isSubAvatarId(subAvatar)) return { slug, ...AVATAR_MODULES[subAvatar] };
  const bespoke = MODULES[slug];
  if (bespoke) return { slug, ...bespoke };
  return fallbackModule(slug);
}
