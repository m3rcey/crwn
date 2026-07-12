// The Lead Magnet registry. One typed, client-safe config per tool drives its public
// page, artist page, wizard, result renderer, CTA, and conversion adapter.
//
// Adding a tool = add a config here + a generator in resultGenerators.ts. No new pages.

import { CONSENT_TEXT_VERSION } from './disclaimers';
import type { LeadMagnetConfig } from './types';

const VAULT_REVENUE_PLANNER: LeadMagnetConfig = {
  slug: 'vault-revenue-planner',
  name: 'Vault Revenue Planner',
  featureName: 'Artist Vault',
  category: 'Monetize',
  description: 'See what the unreleased music sitting on your phone is costing you every month.',
  videoAngle: 'You already have enough unreleased content to launch a paid fan Vault. It is making nothing on your hard drive.',
  publicRoute: '/tools/vault-revenue-planner',
  artistRoute: '/artist/tools/vault-revenue-planner',
  icon: '🗝️',
  timeToComplete: '3 min',
  hero: {
    eyebrow: 'Artist Vault',
    headline: 'The music on your phone is earning you nothing.',
    subheadline: 'Every demo, voice memo and unreleased track you sit on is money your supporters would already be paying you. See what sitting on it costs you, and get a 30-day plan to release it.',
    primaryCta: 'Plan my Vault',
    image: '/tool-vault.jpg',
    imageAlt: 'An artist in a dim studio surrounded by shelves of unreleased music',
  },
  inputs: [
    { key: 'artistName', type: 'text', label: 'Your artist name', required: true, maxLength: 80, step: 'identity', placeholder: 'e.g. M3RCEY' },
    { key: 'genre', type: 'text', label: 'Your genre', maxLength: 40, step: 'identity', placeholder: 'e.g. R&B, drill, indie' },
    { key: 'unreleasedSongs', type: 'number', label: 'Unreleased songs', min: 0, max: 5000, step: 'inventory' },
    { key: 'demos', type: 'number', label: 'Demos', min: 0, max: 5000, step: 'inventory' },
    { key: 'voiceMemos', type: 'number', label: 'Voice memos', min: 0, max: 5000, step: 'inventory' },
    { key: 'studioClips', type: 'number', label: 'Studio clips', min: 0, max: 5000, step: 'inventory' },
    { key: 'btsVideos', type: 'number', label: 'Behind-the-scenes videos', min: 0, max: 5000, step: 'inventory' },
    { key: 'lyricSheets', type: 'number', label: 'Lyric sheets or notes', min: 0, max: 5000, step: 'inventory' },
    { key: 'altVersions', type: 'number', label: 'Alternate versions', min: 0, max: 5000, step: 'inventory' },
    { key: 'archivedPhotos', type: 'number', label: 'Archived photos', min: 0, max: 20000, step: 'inventory' },
    { key: 'supporterCount', type: 'number', label: 'Current supporters (optional)', help: 'Used as context only, never as a guaranteed conversion.', min: 0, max: 10000000, step: 'audience' },
    {
      key: 'dropFrequency', type: 'option', label: 'How often can you drop?', required: true, step: 'offer',
      options: [
        { value: 'weekly', label: 'Weekly', hint: 'A drop every week', icon: '🔥' },
        { value: 'biweekly', label: 'Every two weeks', hint: 'Steady and sustainable', icon: '📆' },
        { value: 'monthly', label: 'Monthly', hint: 'One strong drop a month', icon: '🗓️' },
      ],
    },
    { key: 'monthlyPrice', type: 'currency', label: 'Monthly price you have in mind', help: 'A planning number. We suggest a range around it.', min: 0, max: 500, step: 'offer', placeholder: '10' },
    { key: 'willingPrivate', type: 'toggle', label: 'Willing to post private, unreleased content?', step: 'positioning' },
  ],
  wizardSteps: [
    { id: 'identity', group: 'Profile', title: 'Who is this Vault for?', subtitle: 'Start with your name and sound.' },
    { id: 'inventory', group: 'Inventory', title: 'What do you already have?', subtitle: 'Rough counts are fine. This is what your Vault runs on.' },
    { id: 'audience', group: 'Audience', title: 'Who is already with you?', subtitle: 'Context only. Skip if you are not sure.' },
    { id: 'offer', group: 'Offer', title: 'Shape the offer', subtitle: 'Cadence and price you are comfortable with.' },
    { id: 'positioning', group: 'Offer', title: 'One last thing', subtitle: 'How real are you willing to get?' },
    { id: 'review', group: 'Review', title: 'Review', subtitle: 'Check your answers, then see your Vault plan.' },
  ],
  resultGeneratorKey: 'vaultRevenuePlan',
  resultSections: [
    { key: 'readiness', title: 'Your Vault readiness', preview: true },
    { key: 'inventory', title: 'What is already in your Vault', preview: true },
    { key: 'offer', title: 'Recommended offer' },
    { key: 'schedule', title: '30-day release plan' },
    { key: 'firstFive', title: 'First five drops' },
    { key: 'pitch', title: 'Pitch to your fans' },
    { key: 'assumptions', title: 'Assumptions' },
    { key: 'nextSteps', title: 'Build it in CRWN' },
  ],
  publicPreviewSections: ['readiness', 'inventory'],
  leadCapture: { required: false, consentCopy: 'Email me my Vault plan and occasional CRWN tips for artists.' },
  cta: {
    publicPrimary: 'Create your CRWN account and build your Vault',
    publicSecondary: 'Email my Vault plan',
    artistPrimary: 'Save my Vault plan',
    artistSecondary: 'Build a Vault tier',
  },
  conversionTarget: { type: 'saved_plan', label: 'Save your Vault plan', route: '/profile' },
  requiresEstimateDisclaimer: true,
  analyticsMetadata: { toolId: 'vault-revenue-planner', category: 'Monetize', promotedFeature: 'Artist Vault' },
};

const PROOF_OF_DEMAND: LeadMagnetConfig = {
  slug: 'proof-of-demand-test-builder',
  name: 'Proof of Demand Test Builder',
  featureName: 'Proof of Demand',
  category: 'Validate',
  description: 'Stop funding merch, shows and products that nobody was going to buy.',
  videoAngle: 'Do not spend first and hope fans buy later. Make fans prove demand before you commit a dollar.',
  publicRoute: '/tools/proof-of-demand-test-builder',
  artistRoute: '/artist/tools/proof-of-demand-test-builder',
  icon: '📊',
  timeToComplete: '2 min',
  hero: {
    eyebrow: 'Proof of Demand',
    headline: 'You find out nobody wanted it after you have already paid for it.',
    subheadline: 'Guessing is what kills the merch run, the tour date and the deluxe. Make fans prove demand first, so you never fund another drop that nobody shows up for.',
    primaryCta: 'Build my demand test',
    image: '/tool-proof-of-demand.jpg',
    imageAlt: 'An artist in a dark studio checking his phone, weighing whether fans really want it',
  },
  inputs: [
    {
      key: 'ideaType', type: 'option', label: 'What are you testing?', required: true, step: 'idea',
      options: [
        { value: 'merch', label: 'Merch', icon: '👕' },
        { value: 'show', label: 'A show or event', icon: '🎤' },
        { value: 'product', label: 'A product', icon: '📦' },
        { value: 'video', label: 'A video', icon: '🎬' },
      ],
    },
    { key: 'ideaDescription', type: 'textarea', label: 'Describe the idea', required: true, maxLength: 300, step: 'idea', placeholder: 'e.g. A limited hoodie in my album colors', example: 'A limited hoodie in my album colors' },
    {
      key: 'signalType', type: 'option', label: 'How do fans show demand?', required: true, step: 'signal',
      options: [
        { value: 'rsvp', label: 'RSVP', hint: 'Tap to say they are in', icon: '✋' },
        { value: 'vote', label: 'Vote', hint: 'Pick this over other ideas', icon: '🗳️' },
        { value: 'waitlist', label: 'Waitlist', hint: 'Join to be first', icon: '📝' },
      ],
    },
    { key: 'threshold', type: 'number', label: 'How many fans to make it real?', required: true, min: 1, max: 1000000, step: 'target', placeholder: '50' },
    { key: 'fanbaseSize', type: 'number', label: 'Roughly how big is your fanbase? (optional)', help: 'Helps us suggest a realistic threshold.', min: 0, max: 100000000, step: 'target' },
    { key: 'price', type: 'currency', label: 'Price idea (optional)', help: 'A non-binding interest signal. Fans are not charged in a demand test.', min: 0, max: 100000, step: 'details' },
    { key: 'city', type: 'text', label: 'City (optional)', maxLength: 60, step: 'details', placeholder: 'e.g. Atlanta' },
  ],
  wizardSteps: [
    { id: 'idea', group: 'Idea', title: 'What are you thinking of making?', subtitle: 'The clearer the idea, the cleaner the test.' },
    { id: 'signal', group: 'Signal', title: 'How do fans prove they want it?', subtitle: 'One simple action.' },
    { id: 'target', group: 'Target', title: 'What number makes it real?', subtitle: 'The threshold that turns yes into go.' },
    { id: 'details', group: 'Details', title: 'A couple of optional details', subtitle: 'Skip anything that does not apply.' },
    { id: 'review', group: 'Review', title: 'Review', subtitle: 'Check it, then see your test.' },
  ],
  resultGeneratorKey: 'proofOfDemandTest',
  resultSections: [
    { key: 'structure', title: 'Your demand test', preview: true },
    { key: 'threshold', title: 'Recommended threshold', preview: true },
    { key: 'copy', title: 'Launch copy' },
    { key: 'nextSteps', title: 'Build it in CRWN' },
    { key: 'assumptions', title: 'Assumptions' },
  ],
  publicPreviewSections: ['structure', 'threshold'],
  leadCapture: { required: false, consentCopy: 'Email me my demand test and occasional CRWN tips for artists.' },
  cta: {
    publicPrimary: 'Create your CRWN account and launch this test',
    publicSecondary: 'Email my demand test',
    artistPrimary: 'Create this in Proof of Demand',
    artistSecondary: 'Save as a plan',
  },
  conversionTarget: { type: 'live_feature', label: 'Create this in Proof of Demand', route: '/proof-of-demand/new', adapterKey: 'proofOfDemand' },
  requiresEstimateDisclaimer: true,
  analyticsMetadata: { toolId: 'proof-of-demand-test-builder', category: 'Validate', promotedFeature: 'Proof of Demand' },
};

const FAN_MISSION: LeadMagnetConfig = {
  slug: 'fan-mission-generator',
  name: 'Fan Mission Generator',
  featureName: 'Fan Missions',
  category: 'Engage',
  description: 'Stop losing the fans who would have helped if you had asked them properly.',
  videoAngle: 'Most artists tell fans to support them with no specific action. One clear mission is easier to complete and to measure.',
  publicRoute: '/tools/fan-mission-generator',
  artistRoute: '/artist/tools/fan-mission-generator',
  icon: '🎯',
  timeToComplete: '2 min',
  hero: {
    eyebrow: 'Fan Missions',
    headline: '"Please support me" is why your fans do nothing.',
    subheadline: 'A vague ask gets scrolled past, and the fans who would have shown up for you never do. Turn your goal into one action, one number and one reward they can actually complete.',
    primaryCta: 'Generate my mission',
    image: '/tool-fan-mission.jpg',
    imageAlt: 'An artist on stage reaching out to clasp the hand of a fan in the crowd',
  },
  inputs: [
    {
      key: 'goal', type: 'option', label: 'What is your goal?', required: true, step: 'goal',
      options: [
        { value: 'grow', label: 'Grow my audience', icon: '📈' },
        { value: 'streams', label: 'Get more streams', icon: '🎧' },
        { value: 'subscribers', label: 'Get more supporters', icon: '👑' },
        { value: 'launch', label: 'Launch a release', icon: '🚀' },
      ],
    },
    {
      key: 'fanAction', type: 'option', label: 'What do fans do?', required: true, step: 'action',
      options: [
        { value: 'share', label: 'Share the link', icon: '🔁' },
        { value: 'clip', label: 'Clip and post', icon: '✂️' },
        { value: 'referral', label: 'Bring a friend', icon: '🤝' },
        { value: 'presave', label: 'Pre-save the release', icon: '💾' },
      ],
    },
    { key: 'destinationUrl', type: 'url', label: 'Link fans go to (optional)', step: 'action', placeholder: 'https://' },
    { key: 'participantCount', type: 'number', label: 'How many fans to complete it?', required: true, min: 1, max: 1000000, step: 'target', placeholder: '50' },
    {
      key: 'rewardType', type: 'option', label: 'What is the reward?', required: true, step: 'reward',
      options: [
        { value: 'points', label: 'Leaderboard points', icon: '🏅' },
        { value: 'badge', label: 'A badge', icon: '🎖️' },
        { value: 'access', label: 'Exclusive access', icon: '🔓' },
        { value: 'custom', label: 'Something custom', icon: '🎁' },
      ],
    },
    { key: 'rewardDetail', type: 'text', label: 'Describe the reward (optional)', maxLength: 120, step: 'reward' },
    { key: 'leaderboard', type: 'toggle', label: 'Show a leaderboard?', step: 'reward' },
    {
      key: 'proof', type: 'option', label: 'How is it verified?', required: true, step: 'proof',
      options: [
        { value: 'auto', label: 'Automatic', hint: 'Counted by the platform', icon: '⚙️' },
        { value: 'link', label: 'They submit a link', icon: '🔗' },
        { value: 'screenshot', label: 'They submit a screenshot', icon: '📸' },
      ],
    },
  ],
  wizardSteps: [
    { id: 'goal', group: 'Goal', title: 'What are you trying to move?', subtitle: 'Pick the one goal this mission serves.' },
    { id: 'action', group: 'Action', title: 'What is the one fan action?', subtitle: 'One action is easier to complete and to count.' },
    { id: 'target', group: 'Target', title: 'What is the number?', subtitle: 'How many fans complete it.' },
    { id: 'reward', group: 'Reward', title: 'What do they get?', subtitle: 'Make the reward worth it.' },
    { id: 'proof', group: 'Proof', title: 'How do you verify it?', subtitle: 'Pick something you can actually check.' },
    { id: 'review', group: 'Review', title: 'Review', subtitle: 'Check it, then see your mission.' },
  ],
  resultGeneratorKey: 'fanMission',
  resultSections: [
    { key: 'summary', title: 'Mission summary', preview: true },
    { key: 'whatFansDo', title: 'What fans do', preview: true },
    { key: 'verification', title: 'How completion is verified' },
    { key: 'reward', title: 'Reward' },
    { key: 'promo', title: 'Promotion copy' },
    { key: 'nextSteps', title: 'Launch in CRWN' },
  ],
  publicPreviewSections: ['summary', 'whatFansDo'],
  leadCapture: { required: false, consentCopy: 'Email me my mission and occasional CRWN tips for artists.' },
  cta: {
    publicPrimary: 'Create your CRWN account and launch this mission',
    publicSecondary: 'Email my mission',
    artistPrimary: 'Launch in the mission builder',
    artistSecondary: 'Save as a plan',
  },
  conversionTarget: { type: 'live_feature', label: 'Launch in the mission builder', route: '/missions/new', adapterKey: 'mission' },
  requiresEstimateDisclaimer: false,
  analyticsMetadata: { toolId: 'fan-mission-generator', category: 'Engage', promotedFeature: 'Fan Missions' },
};

const CLIP_TO_EARN: LeadMagnetConfig = {
  slug: 'clip-to-earn-campaign-planner',
  name: 'Clip-to-Earn Campaign Planner',
  featureName: 'Clip-to-Earn',
  category: 'Grow',
  description: 'Stop letting fan clips grow somebody else\'s page instead of yours.',
  videoAngle: 'Your fans are already reposting clips. Give them the right moments, rules, tracking, and reward.',
  publicRoute: '/tools/clip-to-earn-campaign-planner',
  artistRoute: '/artist/tools/clip-to-earn-campaign-planner',
  icon: '✂️',
  timeToComplete: '3 min',
  hero: {
    eyebrow: 'Clip-to-Earn',
    headline: 'Your fans are clipping you. You are getting nothing back.',
    subheadline: 'Undirected clips die in somebody else\'s feed and you never see the reach or the revenue. Build a campaign so every clip points back at you.',
    primaryCta: 'Plan my campaign',
    image: '/tool-clip-to-earn.jpg',
    imageAlt: 'A phone on a tripod filming an artist performing under a gold ring light',
  },
  inputs: [
    { key: 'sourceContent', type: 'text', label: 'What are they clipping?', required: true, maxLength: 80, step: 'source', placeholder: 'e.g. my new single "Crown"' },
    {
      key: 'sourceType', type: 'option', label: 'What type of content is it?', required: true, step: 'source',
      options: [
        { value: 'song', label: 'A song', icon: '🎵' },
        { value: 'video', label: 'A music video', icon: '🎬' },
        { value: 'live', label: 'A live moment', icon: '📡' },
        { value: 'other', label: 'Something else', icon: '✨' },
      ],
    },
    { key: 'sourceUrl', type: 'url', label: 'Link to the content you own (optional)', help: 'For the artist version, only content you own can convert.', step: 'source', placeholder: 'https://' },
    {
      key: 'platforms', type: 'checkboxGroup', label: 'Where should fans post?', required: true, step: 'format',
      options: [
        { value: 'TikTok', label: 'TikTok', icon: '🎵' },
        { value: 'Reels', label: 'Instagram Reels', icon: '📸' },
        { value: 'Shorts', label: 'YouTube Shorts', icon: '▶️' },
      ],
    },
    {
      key: 'clipTypes', type: 'checkboxGroup', label: 'Best moments to clip', step: 'format',
      options: [
        { value: 'hook moment', label: 'The hook', icon: '🪝' },
        { value: 'beat drop', label: 'The beat drop', icon: '🔊' },
        { value: 'emotional line', label: 'An emotional line', icon: '💔' },
        { value: 'funny moment', label: 'A funny moment', icon: '😂' },
      ],
    },
    {
      key: 'clipLength', type: 'option', label: 'Clip length', required: true, step: 'format',
      options: [
        { value: '7-15s', label: '7 to 15 seconds', icon: '⚡' },
        { value: '15-30s', label: '15 to 30 seconds', icon: '⏱️' },
        { value: '30-60s', label: '30 to 60 seconds', icon: '🎞️' },
      ],
    },
    {
      key: 'rewardType', type: 'option', label: 'How do top clippers win?', required: true, step: 'reward',
      options: [
        { value: 'badge', label: 'A badge', icon: '🎖️' },
        { value: 'points', label: 'Leaderboard points', icon: '🏅' },
        { value: 'access', label: 'Exclusive access', icon: '🔓' },
        { value: 'commission_boost', label: 'A commission boost', hint: 'Stacks on your clip-to-earn rate (Pro)', icon: '💸' },
      ],
    },
    { key: 'topClipAward', type: 'text', label: 'Top clip award (optional)', maxLength: 120, step: 'reward', placeholder: 'e.g. a signed vinyl' },
    { key: 'requiredCaption', type: 'text', label: 'Required caption text (optional)', maxLength: 120, step: 'rules' },
    { key: 'requiredHashtags', type: 'tags', label: 'Required hashtags (optional)', step: 'rules', placeholder: 'Add a hashtag and press enter' },
    { key: 'approvalRequired', type: 'toggle', label: 'Review clips before they count?', step: 'rules' },
  ],
  wizardSteps: [
    { id: 'source', group: 'Source', title: 'What are fans clipping?', subtitle: 'Only clip content you have the rights to.' },
    { id: 'format', group: 'Format', title: 'Set the format', subtitle: 'Platforms, moments, and length.' },
    { id: 'reward', group: 'Reward', title: 'Set the reward', subtitle: 'What makes clippers show up.' },
    { id: 'rules', group: 'Rules', title: 'Set the rules', subtitle: 'Keep it clean and trackable.' },
    { id: 'review', group: 'Review', title: 'Review', subtitle: 'Check it, then see your campaign.' },
  ],
  resultGeneratorKey: 'clipToEarnCampaign',
  resultSections: [
    { key: 'brief', title: 'Clipper brief', preview: true },
    { key: 'rules', title: 'Clip rules', preview: true },
    { key: 'bestMoments', title: 'Best moments to clip' },
    { key: 'reward', title: 'Reward structure' },
    { key: 'captions', title: 'Approved captions' },
    { key: 'moderation', title: 'Moderation checklist' },
    { key: 'launch', title: 'Launch post' },
    { key: 'nextSteps', title: 'Launch in CRWN' },
  ],
  publicPreviewSections: ['brief', 'rules'],
  leadCapture: { required: false, consentCopy: 'Email me my campaign and occasional CRWN tips for artists.' },
  cta: {
    publicPrimary: 'Create your CRWN account and launch this campaign',
    publicSecondary: 'Email my campaign',
    artistPrimary: 'Launch in the bounty builder',
    artistSecondary: 'Save as a plan',
  },
  conversionTarget: {
    type: 'live_feature',
    label: 'Launch in the bounty builder',
    route: '/bounties/new',
    adapterKey: 'bounty',
    requiresProCapability: 'allowsClipper',
  },
  requiresEstimateDisclaimer: false,
  analyticsMetadata: { toolId: 'clip-to-earn-campaign-planner', category: 'Grow', promotedFeature: 'Clip-to-Earn' },
};

export const LEAD_MAGNETS: LeadMagnetConfig[] = [
  VAULT_REVENUE_PLANNER,
  PROOF_OF_DEMAND,
  FAN_MISSION,
  CLIP_TO_EARN,
];

export const LEAD_MAGNET_BY_SLUG: Record<string, LeadMagnetConfig> = Object.fromEntries(
  LEAD_MAGNETS.map((m) => [m.slug, m]),
);

export function getLeadMagnet(slug: string): LeadMagnetConfig | null {
  return LEAD_MAGNET_BY_SLUG[slug] ?? null;
}

export const LEAD_MAGNET_SLUGS: string[] = LEAD_MAGNETS.map((m) => m.slug);

/**
 * Tools that live on their OWN page rather than running the shared wizard/generator, so they
 * cannot be a LeadMagnetConfig. They still belong in the tools directory. The directory links
 * straight out to `href`; nothing here is rebuilt.
 */
export type ExternalTool = {
  key: string;
  name: string;
  description: string;
  category: string;
  timeToComplete: string;
  featureName: string;
  href: string;
  image: string;
  imageAlt: string;
};

export const EXTERNAL_TOOLS: ExternalTool[] = [
  {
    key: 'worth',
    name: 'What Your Music Is Worth',
    description: 'See how little streaming actually pays you, and what the same fans would be worth on CRWN.',
    category: 'Monetize',
    timeToComplete: '1 min',
    featureName: 'Worth Calculator',
    href: '/worth',
    image: '/tool-worth.jpg',
    imageAlt: 'An artist alone in a dark studio staring at a disappointing number on his phone',
  },
];
