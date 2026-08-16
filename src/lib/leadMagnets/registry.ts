// The Lead Magnet registry. One typed, client-safe config per tool drives its public
// page, artist page, wizard, result renderer, CTA, and conversion adapter.
//
// Adding a tool = add a config here + a generator in resultGenerators.ts. No new pages.

import { CONSENT_TEXT_VERSION } from './disclaimers';
import type { LeadMagnetConfig, LeadMagnetInputDefinition, LeadMagnetWizardStep } from './types';

const VAULT_REVENUE_PLANNER: LeadMagnetConfig = {
  slug: 'vault-revenue-planner',
  name: 'Vault Revenue Planner',
  featureName: 'Artist Vault',
  category: 'Monetize',
  description: 'See what deeper access to your unreleased catalog would be worth to the fans who pay you most.',
  videoAngle: 'Your unreleased catalog is the clearest reason a committed fan has to pay you more. It is sitting on a hard drive instead.',
  publicRoute: '/tools/vault-revenue-planner',
  artistRoute: '/artist/tools/vault-revenue-planner',
  icon: '🗝️',
  timeToComplete: '3 min',
  dmKeywords: ['vault'],
  hero: {
    // Zero to One positioning pass (2026-08-14). The old hero sold idle files as lost money.
    // The catalog is not the product: deeper ACCESS to it is the clearest reason a committed fan
    // identifies themselves, pays, and climbs a rung. That is a membership beat, not an
    // inventory beat, and it is why the vault lives inside the ladder rather than beside it.
    headline: 'Your most committed fans have nowhere to go.',
    subheadline: 'The unreleased work on your phone is the reason they would pay you more. See what that access is worth.',
    primaryCta: 'Plan my Vault',
    image: '/hero-vault.webp',
    imageAlt: 'Illustration of an artist at a desk facing shelves of tapes and records lit in gold',
  },
  inputs: [
    { key: 'artistName', type: 'text', label: 'Your artist name', required: true, maxLength: 80, step: 'identity', placeholder: 'e.g. M3RCEY' },
    { key: 'genre', type: 'text', label: 'Your genre', maxLength: 40, step: 'identity', placeholder: 'e.g. R&B, drill, indie' },
    { key: 'unreleasedSongs', type: 'number', label: 'Unreleased songs', min: 0, max: 5000, step: 'inventory', placeholder: '30' },
    { key: 'demos', type: 'number', label: 'Demos', min: 0, max: 5000, step: 'inventory', placeholder: '45' },
    { key: 'voiceMemos', type: 'number', label: 'Voice memos', min: 0, max: 5000, step: 'inventory', placeholder: '80' },
    { key: 'studioClips', type: 'number', label: 'Studio clips', min: 0, max: 5000, step: 'inventory', placeholder: '25' },
    { key: 'btsVideos', type: 'number', label: 'Behind-the-scenes videos', min: 0, max: 5000, step: 'inventory', placeholder: '18' },
    { key: 'lyricSheets', type: 'number', label: 'Lyric sheets or notes', min: 0, max: 5000, step: 'inventory', placeholder: '20' },
    { key: 'altVersions', type: 'number', label: 'Alternate versions', min: 0, max: 5000, step: 'inventory', placeholder: '12' },
    { key: 'archivedPhotos', type: 'number', label: 'Archived photos', min: 0, max: 20000, step: 'inventory', placeholder: '150' },
    { key: 'supporterCount', type: 'number', label: 'Current supporters (optional)', help: 'Used as context only, never as a guaranteed conversion.', min: 0, max: 10000000, step: 'audience', placeholder: '75' },
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
  leadCapture: { required: false, consentCopy: 'Email me my Vault plan, plus the follow-up emails on how to launch it. Unsubscribe anytime.' },
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
  dmKeywords: ['proof', 'demand'],
  hero: {
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
    { key: 'fanbaseSize', type: 'number', label: 'Roughly how big is your fanbase? (optional)', help: 'Helps us suggest a realistic threshold.', min: 0, max: 100000000, step: 'target', placeholder: '250,000' },
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
  leadCapture: { required: false, consentCopy: 'Email me my demand test, plus the follow-up emails on how to launch it. Unsubscribe anytime.' },
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
  dmKeywords: ['mission', 'missions'],
  hero: {
    headline: '"Please support me" is why your fans do nothing.',
    subheadline: 'A vague ask gets scrolled past, and the fans who would have shown up for you never do. Turn your goal into one action, one number and one reward they can actually complete.',
    primaryCta: 'Generate my mission',
    image: '/tool-fan-mission.jpg',
    imageAlt: 'An artist on stage reaching out to clasp the hand of a fan in the crowd',
  },
  // `goal` and `proof` were asked here and read by nothing: the generator derives the mission from
  // `fanAction` and derives verification from that same action (a pre-save is automatic, a share
  // needs a link or screenshot), which is more accurate than what the artist would have picked.
  // Two required screens that could only ever contradict the result, so they are gone.
  inputs: [
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
  ],
  wizardSteps: [
    { id: 'action', group: 'Action', title: 'What is the one fan action?', subtitle: 'One action is easier to complete and to count.' },
    { id: 'target', group: 'Target', title: 'What is the number?', subtitle: 'How many fans complete it.' },
    { id: 'reward', group: 'Reward', title: 'What do they get?', subtitle: 'Make the reward worth it.' },
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
  leadCapture: { required: false, consentCopy: 'Email me my mission, plus the follow-up emails on how to launch it. Unsubscribe anytime.' },
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
  dmKeywords: ['clip', 'clips'],
  hero: {
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
    // No `sourceUrl` ask: nothing read it back, and the rights reminder it carried is already in the
    // generated clip rules ("Only clip content you have the rights to use") and the step subtitle.
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
  leadCapture: { required: false, consentCopy: 'Email me my campaign, plus the follow-up emails on how to launch it. Unsubscribe anytime.' },
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

// Shared helpers for the loss-engine tools' registry entries: they all render through the adapter
// (usesLossEngine) and reuse a placeholder hero image until bespoke on-brand photos are made.
// Declared above the first loss tool because the configs below evaluate at module load.
const AUDIENCE_INPUT: LeadMagnetInputDefinition = {
  key: 'social_followers',
  type: 'number',
  label: 'Roughly how many followers do you have across your socials?',
  required: true,
  min: 0,
  max: 100000000,
  step: 'audience',
      placeholder: '250,000',
    };
// The 40% factor, bought with one tap.
//
// CRWN's customer avatar (docs/ICP.md) weights "has already sold something directly to fans" at
// 40%, ahead of audience size at 25%. The loss tools asked for follower count and nothing else,
// so the highest-predictive fact about a lead never entered the funnel at all. Values match the
// `monetization_status` enum in acquisition/fieldRegistry.ts so the two halves of the funnel
// speak the same language. Multi-option, so it is an OptionSelect dropdown per the UX rule.
const DIRECT_SALES_INPUT: LeadMagnetInputDefinition = {
  key: 'monetization_status',
  type: 'option',
  label: 'Have you ever sold anything directly to your fans?',
  help: 'This shapes what we recommend. It does not change the number.',
  required: true,
  step: 'proof',
  options: [
    { value: 'direct_established', label: 'Yes, regularly (memberships, drops, VIP)', icon: '👑' },
    { value: 'direct_some', label: 'Yes, a few times', icon: '💸' },
    { value: 'merch_only', label: 'Merch or tickets only', icon: '👕' },
    { value: 'streaming_only', label: 'No, streaming and socials only', icon: '🎧' },
  ],
};
// TWO screens, and deliberately no `review` screen.
//
// These tools ask a follower count and one dropdown. A third screen that plays back two answers the
// artist typed ten seconds ago bought nothing and cost a tap at the exact moment of peak intent: the
// last thing between them and the number they came for. The correction it existed to enable now
// lives AFTER the result, where a wrong number is actually visible (`PublicToolClient`, "change an
// answer and recalculate"), so deleting the screen loses no ability.
//
// The second screen therefore submits. `LeadMagnetWizard.advance()` validates the whole config
// before completing, which is what keeps `monetization_status` genuinely required now that it sits
// on the last screen.
const AUDIENCE_STEPS: LeadMagnetWizardStep[] = [
  { id: 'audience', group: 'Audience', title: 'How big is your audience?', subtitle: 'A rough number is fine.' },
  { id: 'proof', group: 'Proof', title: 'Have your fans ever paid you directly?', subtitle: 'Streaming is exposure. A sale is proof. This is the last question.' },
];

// Founder Window: reference for the loss-revelation tools. Its result is produced by the shared
// loss engine (usesLossEngine), so the web page and the DM render the identical loss result. Hero
// image is a shared placeholder for now; bespoke on-brand photos are a follow-up.
const FOUNDER_WINDOW: LeadMagnetConfig = {
  slug: 'founder-window-builder',
  name: 'Founder Window Builder',
  featureName: 'Founder Window',
  category: 'Monetize',
  description: 'See how many founding supporters you lose because fans have no reason to join now.',
  videoAngle: 'An always-open offer has no urgency, so the fans who would join keep saying "later" until they forget.',
  publicRoute: '/tools/founder-window-builder',
  artistRoute: '/artist/tools/founder-window-builder',
  icon: '⏳',
  timeToComplete: '1 min',
  dmKeywords: ['founder', 'window'],
  hero: {
    headline: 'Your fans have no reason to join now, so most never do.',
    subheadline:
      'An always-open offer leaks the supporters who fully intend to join. See how many a founder window would pull forward now, and what they are worth every month.',
    primaryCta: 'See what I am losing',
    image: '/tool-founder-window.jpg',
    imageAlt: 'Illustration of an artist holding a phone with gold threads streaming outward across the frame',
  },
  inputs: [AUDIENCE_INPUT, DIRECT_SALES_INPUT],
  wizardSteps: AUDIENCE_STEPS,
  resultGeneratorKey: 'founderWindow',
  usesLossEngine: true,
  resultSections: [],
  publicPreviewSections: [],
  leadCapture: { required: false, consentCopy: 'Email me my founder window plan, plus the follow-up emails on how to launch it. Unsubscribe anytime.' },
  cta: {
    publicPrimary: 'Create your CRWN account and open your window',
    publicSecondary: 'Email my plan',
    artistPrimary: 'Save my plan',
    artistSecondary: 'Open a founder window',
  },
  conversionTarget: { type: 'saved_plan', label: 'Save your plan', route: '/profile' },
  requiresEstimateDisclaimer: true,
  analyticsMetadata: { toolId: 'founder-window-builder', category: 'Monetize', promotedFeature: 'Founder Window' },
};

function lossToolBase(over: Partial<LeadMagnetConfig> & Pick<LeadMagnetConfig, 'slug' | 'name' | 'featureName' | 'category' | 'description' | 'videoAngle' | 'icon' | 'dmKeywords' | 'hero' | 'resultGeneratorKey' | 'analyticsMetadata'>): LeadMagnetConfig {
  return {
    publicRoute: `/tools/${over.slug}`,
    artistRoute: `/artist/tools/${over.slug}`,
    timeToComplete: '1 min',
    inputs: [AUDIENCE_INPUT, DIRECT_SALES_INPUT],
    wizardSteps: AUDIENCE_STEPS,
    usesLossEngine: true,
    resultSections: [],
    publicPreviewSections: [],
    leadCapture: { required: false, consentCopy: 'Email me my result, plus the follow-up emails on how to launch it. Unsubscribe anytime.' },
    cta: {
      publicPrimary: 'Create your CRWN account and fix this',
      publicSecondary: 'Email my result',
      artistPrimary: 'Save my result',
      artistSecondary: 'Build it in CRWN',
    },
    conversionTarget: { type: 'saved_plan', label: 'Save your result', route: '/profile' },
    requiresEstimateDisclaimer: true,
    ...over,
  };
}

const MOVEMENT_PAGE = lossToolBase({
  slug: 'movement-page-blueprint',
  name: 'Movement Page Blueprint',
  featureName: 'Movement Page',
  category: 'Grow',
  description: 'See how much of your traffic leaks off a generic profile or streaming link.',
  videoAngle: 'A streaming link answers none of the questions a new fan has, so most of your traffic bounces.',
  icon: '🧭',
  dmKeywords: ['movement'],
  hero: {
    headline: 'Your link sends fans to a page that says nothing.',
    subheadline: 'A generic profile converts almost none of the traffic a real movement page would. See how many supporters you leak, and what it costs.',
    primaryCta: 'See what I am leaking',
    image: '/tool-movement-page.jpg',
    imageAlt: 'Illustration of an artist holding a phone with gold threads streaming outward across the frame',
  },
  resultGeneratorKey: 'movementPage',
  analyticsMetadata: { toolId: 'movement-page-blueprint', category: 'Grow', promotedFeature: 'Movement Page' },
});

const FAN_JOURNEY = lossToolBase({
  slug: 'fan-journey-builder',
  name: 'Fan Journey Builder',
  featureName: 'Fan Journey',
  category: 'Monetize',
  description: 'See where fans leak out between hearing you and paying you.',
  videoAngle: 'Fans drop off at every step with no path from one to the next, especially first purchase to recurring.',
  icon: '🪜',
  dmKeywords: ['journey'],
  hero: {
    headline: 'Fans leak out at every step before they pay you.',
    subheadline: 'With no path from discovery to recurring support, most of the fans who would pay never make the jump. See where they leak, and what it costs.',
    primaryCta: 'See where they leak',
    image: '/tool-fan-journey.jpg',
    imageAlt: 'Illustration of an artist holding a phone with gold threads streaming outward across the frame',
  },
  resultGeneratorKey: 'fanJourney',
  analyticsMetadata: { toolId: 'fan-journey-builder', category: 'Monetize', promotedFeature: 'Fan Journey' },
});

const TOP_FAN = lossToolBase({
  slug: 'top-fan-leaderboard-builder',
  name: 'Top Fan Leaderboard Builder',
  featureName: 'Top Fan Leaderboard',
  category: 'Grow',
  description: 'See what it costs when your top fans get no recognition and their best actions fade.',
  videoAngle: 'When every supporter looks the same, contribution goes invisible and unrewarded, so it stops.',
  icon: '🏆',
  dmKeywords: ['topfan', 'leaderboard'],
  hero: {
    headline: 'Your top fans look like everyone else, so they act like it.',
    subheadline: 'Your most valuable fans quietly do most of the work. With no status marking them apart, that behavior fades. See what it costs.',
    primaryCta: 'See what it costs',
    image: '/tool-top-fan.jpg',
    imageAlt: 'An artist connecting with a crowd of fans',
  },
  resultGeneratorKey: 'topFanLeaderboard',
  analyticsMetadata: { toolId: 'top-fan-leaderboard-builder', category: 'Grow', promotedFeature: 'Top Fan Leaderboard' },
});

const QUEST_PATH: LeadMagnetConfig = {
  ...lossToolBase({
    slug: 'artist-quest-path',
    name: 'Artist Quest Path Quiz',
    featureName: 'Rise Mode',
    category: 'Grow',
    description: 'See the order most artists build in, and the order that actually compounds.',
    videoAngle: 'Most artists build a store before they have an audience, or chase followers before there is anything to convert them into.',
    icon: '🗺️',
    dmKeywords: ['quest', 'path'],
    hero: {
      headline: 'Most artists build in the wrong order.',
      subheadline: 'Order is the difference between months of progress and months of spinning. This one is the same for every artist: no questions, just the order that compounds.',
      primaryCta: 'See the right order',
      image: '/tool-quest-path.jpg',
      imageAlt: 'Illustration of an artist holding a phone with gold threads streaming outward across the frame',
    },
    resultGeneratorKey: 'questPath',
    analyticsMetadata: { toolId: 'artist-quest-path', category: 'Grow', promotedFeature: 'Rise Mode' },
  }),
  // NO INPUTS, deliberately. This tool used to require a goal and a blocker in free text, and its
  // adapter's execute() took no arguments: every artist typed two answers and received the identical
  // result. CRWN has no canonical mapping from a blocker to an ordered quest path or to lost time
  // (the Constraint Engine needs a real artist's measured world and returns insufficient_evidence
  // without it), so branching the result would have meant inventing a business rule. The honest shape
  // is the one below: no questions, and a result that says plainly it is the same for everyone.
  inputs: [],
  wizardSteps: [
    { id: 'review', group: 'The order', title: 'The order that compounds', subtitle: 'No questions. This is the same for every artist, so there is nothing to fill in.' },
  ],
};

// Both revenue-gated loss tools now project their dollar from audience (social_followers), the
// same honest model as the other loss tools, so a cold lead with no direct revenue still gets a
// real number instead of $0. They inherit AUDIENCE_INPUT/AUDIENCE_STEPS from lossToolBase.
const SUPPORTER_PROMISE: LeadMagnetConfig = {
  ...lossToolBase({
    slug: 'supporter-promise-calendar',
    name: 'Supporter Promise Calendar Builder',
    featureName: 'Promise Calendar',
    category: 'Monetize',
    description: 'See the recurring revenue at risk from perks you promised but never scheduled.',
    videoAngle: 'Every membership perk is a recurring bill with a due date. Miss one and the supporter cancels.',
    icon: '📅',
    dmKeywords: ['promise'],
    hero: {
      headline: 'The perks you promised are a bill you never scheduled.',
      subheadline: 'Benefits with no calendar get missed, and a missed benefit is the most common reason a supporter cancels. See the revenue at risk.',
      primaryCta: 'See my risk',
      image: '/tool-supporter-promise.jpg',
      imageAlt: 'Illustration of an artist holding a phone with gold threads streaming outward across the frame',
    },
    resultGeneratorKey: 'supporterPromise',
    analyticsMetadata: { toolId: 'supporter-promise-calendar', category: 'Monetize', promotedFeature: 'Promise Calendar' },
  }),
};

const TEAM_SPLIT: LeadMagnetConfig = {
  ...lossToolBase({
    slug: 'team-split-deal-builder',
    name: 'Team Split Deal Builder',
    featureName: 'Team Splits',
    category: 'Monetize',
    description: 'See how much an uncapped collaborator split costs you over a capped one.',
    videoAngle: 'A split with no cap and no end date keeps taking from every future dollar, long after the work stopped mattering.',
    icon: '🤝',
    dmKeywords: ['split'],
    hero: {
      headline: 'An uncapped split keeps paying after the work stops.',
      subheadline: 'A cap, a duration, and a gross-versus-net basis change what you actually owe a collaborator. See the difference on your revenue.',
      primaryCta: 'See the difference',
      image: '/tool-team-split.jpg',
      imageAlt: 'Illustration of an artist holding a phone with gold threads streaming outward across the frame',
    },
    resultGeneratorKey: 'teamSplit',
    analyticsMetadata: { toolId: 'team-split-deal-builder', category: 'Monetize', promotedFeature: 'Team Splits' },
  }),
};

const SHARE_TO_EARN = lossToolBase({
  slug: 'share-to-earn-planner',
  name: 'Share-to-Earn Revenue Calculator',
  featureName: 'Fan Referrals',
  category: 'Grow',
  description: 'See what your fans\' advocacy is worth once it is identifiable, attributable and rewarded.',
  videoAngle: 'A few of your fans already do acquisition for you. Nothing tracks which ones, so it never compounds.',
  icon: '🔗',
  dmKeywords: ['share'],
  hero: {
    // Zero To One spine beat 3: not every fan is the same. A few bring other people, and that
    // contribution is economic value nothing in the artist's stack can see. Positioning pass
    // (2026-08-14): this is ACQUISITION into the same fan economy, so the hero says what the
    // mechanism produces (supporters) rather than implying a second income stream.
    headline: 'Some of your fans are already doing your acquisition.',
    subheadline: 'Nothing in your stack tells you which ones, so it never compounds and never gets paid. See what it is worth tracked.',
    primaryCta: 'See what my fans bring in',
    image: '/hero-share-to-earn.webp',
    imageAlt: 'Illustration of an artist holding a phone with gold threads streaming outward across the frame',
  },
  resultGeneratorKey: 'shareToEarn',
  analyticsMetadata: { toolId: 'share-to-earn-planner', category: 'Grow', promotedFeature: 'Fan Referrals' },
});

const OWN_YOUR_FANS = lossToolBase({
  slug: 'own-your-fans-calculator',
  name: 'Own Your Fans Calculator',
  featureName: 'Own Your Fans',
  category: 'Grow',
  description: 'See how much of your fanbase you can reach directly, and what the relationship is worth once you can.',
  videoAngle: 'You cannot own a person. You can own the relationship, the data and the permission to make contact, and today almost none of it is yours.',
  icon: '🏠',
  dmKeywords: ['own'],
  hero: {
    // Positioning pass (2026-08-14). POSITIONING.md section 24 forbids implying ownership of
    // people: the artist owns the RELATIONSHIP, the DATA and the CONTACT PERMISSION. The tool
    // NAME and route stay (campaign links and DM keywords are keyed to them); the customer-facing
    // claim does not. Reach is never dismissed here either, only distinguished from a relationship.
    // The tool NAME, slug, route, featureName and DM keyword all stay "Own Your Fans": campaign
    // links, ManyChat triggers and every historical funnel row are keyed to them. NOTHING A
    // VISITOR READS may claim ownership of people, which is why the headline and subheadline
    // below talk about the relationship, the data and the contact permission instead.
    headline: 'You have reach. You do not have the relationship underneath it.',
    subheadline: 'No names, no permission to make contact, no record of what they bought. See how much of your audience you can actually reach.',
    primaryCta: 'See what I can actually reach',
    image: '/hero-own-your-fans.webp',
    imageAlt: 'Illustration of an artist with a palm pressed to a glass wall, fans reaching from the far side',
  },
  resultGeneratorKey: 'ownYourFans',
  analyticsMetadata: { toolId: 'own-your-fans-calculator', category: 'Grow', promotedFeature: 'Own Your Fans' },
});

// Sibling of EXECUTIVE_PRODUCER, deliberately NOT the same offer. Executive Producer sells one
// seat in the room where the song is made (few fans, high price). This one sells the show itself
// (many fans, low ticket, plus tips during the stream), so the two never read the same in a DM.
const LIVE_EXPERIENCE = lossToolBase({
  slug: 'live-experience-calculator',
  name: 'Live Experience Calculator',
  featureName: 'Live Experiences',
  category: 'Monetize',
  description: 'See what one ticketed live event a month is worth, and what going live only to promote is costing you.',
  videoAngle: 'Most artists only go live to promote a release, so every stream is free, unticketed, and gone the second it ends.',
  icon: '📡',
  dmKeywords: ['live'],
  hero: {
    headline: 'Going live only to promote is why nobody pays to watch.',
    // Re-promoted 2026-08-16: trimmed to the shared above-the-fold budget (28 words, 2
    // sentences); the long argument this replaced lives on the lower page via the doorway.
    subheadline: 'A free promo stream earns nothing and disappears when it ends. See what one real ticketed live a month is worth to your most committed fans.',
    primaryCta: 'See what I am losing',
    image: '/hero-live-experience.webp',
    imageAlt: 'Illustration of an artist singing under a gold stage light to an almost full arc of seats',
  },
  resultGeneratorKey: 'liveExperience',
  analyticsMetadata: { toolId: 'live-experience-calculator', category: 'Monetize', promotedFeature: 'Live Experiences' },
});

const EXECUTIVE_PRODUCER = lossToolBase({
  slug: 'executive-producer-session',
  name: 'Executive Producer Session Calculator',
  featureName: 'Live Experiences',
  category: 'Monetize',
  description: 'See what the highest-value end of your fanbase would pay for a real part in the work.',
  videoAngle: 'A few of your fans want access and a part in the record, not another song. Nothing you run today lets them say so.',
  icon: '🎛️',
  dmKeywords: ['producer'],
  hero: {
    // Positioning pass (2026-08-14): premium PARTICIPATION, not an expensive ticket. This is the
    // beat where the top of the fan economy reveals itself, and the copy says "limited" because
    // the model prices a seat for the artist's audience and never assumes a room without limits.
    headline: 'Your highest-value fans are invisible until you offer them a way in.',
    subheadline: 'A few will pay many times what a listener does for real access. See what a seat in the room is worth.',
    primaryCta: 'See what a seat is worth',
    image: '/hero-executive-producer.webp',
    imageAlt: 'Illustration of an artist at a large studio mixing console',
  },
  resultGeneratorKey: 'execProducerSession',
  analyticsMetadata: { toolId: 'executive-producer-session', category: 'Monetize', promotedFeature: 'Live Experiences' },
});

// The 17th tool, and the first on the "money you already earned" side of CRWN. It does
// NOT use lossToolBase: every other loss tool asks one audience number and derives a
// dollar. This one asks six yes/no/unsure questions and returns a SCORE, because a
// dollar figure for money already owed cannot be honestly derived from self-reported
// answers (the reasoning lives on the adapter in acquisition/toolAdapters.ts).
//
// Its hook therefore teases a SCORE, never a dollar. The house rule that a tool's hero
// must deliver the dollar its hook promised is satisfied by never promising one.
const READINESS_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure', hint: 'Counts as a gap until you confirm it' },
];
const readinessInput = (
  key: string,
  label: string,
  help: string,
  step: string,
  required = false,
): LeadMagnetInputDefinition => ({
  key,
  type: 'option',
  label,
  help,
  required,
  options: READINESS_OPTIONS,
  step,
});

const ROYALTY_READINESS: LeadMagnetConfig = {
  slug: 'royalty-readiness-check',
  name: 'Royalty Readiness Check',
  featureName: 'Royalty Readiness',
  category: 'Monetize',
  description: 'See which royalty streams you have earned from but nobody is collecting.',
  videoAngle:
    'Your distributor pays you for the recording only. The song earns separately through organizations that pay nobody who is not registered with them.',
  icon: '🔎',
  dmKeywords: ['royalty', 'royalties', 'publishing'],
  timeToComplete: '1 min',
  publicRoute: '/tools/royalty-readiness-check',
  artistRoute: '/artist/tools/royalty-readiness-check',
  hero: {
    headline: 'Your distributor is not collecting most of what your songs earn.',
    subheadline:
      'Performance royalties, mechanicals, digital radio and everything outside the US are paid by different organizations, and none of them pay you unless you are registered. Six questions to find the ones with nobody assigned to them.',
    primaryCta: 'See what nobody is collecting',
    image: '/tool-royalty-readiness.jpg',
    imageAlt: 'Illustration of an artist holding a phone with gold threads streaming outward across the frame',
  },
  inputs: [
    readinessInput('writes_music', 'Do you write or co-write the songs you release?', 'Writing the song and owning the recording are two separate things, collected by different people.', 'songs', true),
    readinessInput('pro_registered', 'Are you signed up with a PRO (ASCAP, BMI, SESAC)?', 'The PRO collects performance royalties: radio, TV, venues, and streaming performance.', 'registration', true),
    readinessInput('songs_registered', 'Have you registered each individual song with that PRO?', 'Signing up as a writer collects nothing. The songs have to be registered one by one.', 'registration', true),
    readinessInput('mechanical_collection', 'Is anybody collecting your US mechanical royalties?', 'US streaming mechanicals are a separate pot from your distributor payout, handled by the MLC or an administrator.', 'collection'),
    readinessInput('soundexchange', 'Are you registered with SoundExchange?', 'US digital radio pays the performer and the recording owner, not the writer. It never touches your distributor.', 'collection'),
    readinessInput('unregistered_backlog', 'Have you released music in the last two years you are not sure was ever registered?', 'Back claims are not open forever, so an old backlog is the part that expires.', 'collection'),
  ],
  wizardSteps: [
    { id: 'songs', group: 'Your songs', title: 'Your songs', subtitle: 'One question, so we only ask what applies to you.' },
    { id: 'registration', group: 'Registration', title: 'Registration', subtitle: 'Who is signed up to collect on your behalf.' },
    { id: 'collection', group: 'Collection', title: 'Collection', subtitle: 'The streams artists most often never claim.' },
    { id: 'review', group: 'Review', title: 'Review', subtitle: 'Check your answers, then see the gaps.' },
  ],
  usesLossEngine: true,
  resultSections: [],
  publicPreviewSections: [],
  leadCapture: { required: false, consentCopy: 'Email me my result, plus the follow-up emails on how to launch it. Unsubscribe anytime.' },
  cta: {
    publicPrimary: 'Create your CRWN account and close these gaps',
    publicSecondary: 'Email my result',
    artistPrimary: 'Save my result',
    artistSecondary: 'Open the full check in CRWN',
  },
  conversionTarget: { type: 'saved_plan', label: 'Save your result', route: '/royalty-readiness' },
  requiresEstimateDisclaimer: true,
  resultGeneratorKey: 'royaltyReadiness',
  analyticsMetadata: { toolId: 'royalty-readiness-check', category: 'Monetize', promotedFeature: 'Royalty Readiness' },
};

// The all-in-one calculator. Every other tool models ONE opportunity; this one models the whole
// business at once, which is only defensible because it refuses to add the other tools together
// (see src/lib/opportunity/unifiedModel.ts for the arithmetic and why).
//
// It is the only tool with `entryContexts`: a Vault video, a Share-to-Earn video and a Streaming
// Loss video all point here with ?from=<their slug>, and the wizard leads with the questions their
// video was about instead of a generic questionnaire. The individual tools keep working untouched.
const UNIFIED_OPPORTUNITY: LeadMagnetConfig = {
  slug: 'opportunity-calculator',
  name: 'CRWN Opportunity Calculator',
  featureName: 'Your CRWN business system',
  category: 'Monetize',
  description:
    'One calculator for your whole direct-to-fan business, with the same fan never counted twice.',
  videoAngle:
    'Running five separate calculators gives you five numbers that all describe the same fans, so you plan a business that does not exist.',
  publicRoute: '/tools/opportunity-calculator',
  artistRoute: '/artist/tools/opportunity-calculator',
  icon: '👑',
  // Eight screens, mostly taps. The hero prints this, so it has to match the wizard it introduces.
  timeToComplete: '2 min',
  dmKeywords: ['opportunity', 'system', 'plan', 'free'],
  // The hero speaks to a COLD first-time visitor. It may not mention the other
  // calculators, "five separate numbers", or anything else that assumes the
  // reader has already met CRWN's tool family: on this page and on `/` they are
  // usually seeing us for the first time, and copy that references things they
  // have never seen reads as being about somebody else. Loss-framed per the
  // copy rule: the cost of not knowing comes first, the fix second.
  hero: {
    // Zero To One positioning (docs/POSITIONING.md section 17). The headline names the
    // LOSS and the concentration: the artist already has the audience, and the part of it
    // that carries the money is the part nothing in their stack can see. Reach is never
    // dismissed here, because every number in the model scales with it. The subheadline
    // adds the fragmentation beat: the buyers exist, they are just split across tools
    // that cannot see the same person.
    headline: 'The fans who would pay you most are the ones you cannot see.',
    subheadline:
      'Your buyers, members and contacts sit in tools that cannot see the same person. See what that group is worth.',
    primaryCta: 'See what my fans are worth',
    image: '/hero-opportunity.webp',
    imageAlt: 'Illustration of an artist touching the one point where gold threads from every part of the wall converge',
  },
  inputs: [
    {
      // Identity, not arithmetic. The money model never reads this: it decides which sub-avatar
      // journey the artist belongs to (docs/SUB_AVATARS.md), which shapes the framing, the first
      // offer and the cohort they are compared in. Two of the four avatars are genre-defined, so
      // without this question those two can never be assigned from an answer.
      key: 'genre_family',
      type: 'option',
      label: 'What do you make?',
      help: 'This shapes what we recommend and how we say it. It does not change the number.',
      // NOT required, deliberately. The calculator's standing invariant is that an artist can
      // reach a real result from one number (the audience question is the only mandatory one),
      // and an unanswered genre simply reads as `other` rather than blocking the funnel.
      step: 'audience',
      options: [
        { value: 'hiphop', label: 'Hip-hop or rap', icon: '🎤' },
        { value: 'rnb', label: 'R&B or soul', icon: '🎶' },
        { value: 'other', label: 'Something else', icon: '🎸' },
      ],
    },
    {
      // PLACEHOLDERS ACROSS EVERY CALCULATOR are the docs/ICP.md Tier-1 profile (founder ask,
      // 2026-08-16): 250k followers, 150k monthly listeners, a 2,000-contact list, paying fans
      // on other platforms, a deep archive. Ghost text only, never a value: a placeholder cannot
      // be submitted, so skipping a question still shrinks the result, exactly as the conversion
      // contract requires.
      key: 'social_followers',
      type: 'number',
      label: 'Your social following',
      help: 'The biggest platform is fine. A rough number is fine.',
      required: true,
      min: 0,
      step: 'audience',
      placeholder: '250,000',
    },
    {
      key: 'monthly_listeners',
      type: 'number',
      label: 'Your monthly listeners',
      help: 'Spotify or Apple. We will not add this to your followers, because they are largely the same people.',
      min: 0,
      step: 'audience',
      placeholder: '150,000',
    },
    {
      key: 'owned_contacts',
      type: 'number',
      label: 'Email and SMS contacts you own',
      help: 'People you can reach without an algorithm deciding. Leave it at zero if you have none yet.',
      min: 0,
      step: 'owned',
      placeholder: '2,000',
    },
    {
      // The 40% question. Every loss tool asks it (docs/ICP.md); the unified tool was the one
      // place that skipped it, which blinded lead scoring's biggest dimension for the primary
      // funnel candidate. It does not touch the money model, only qualification.
      key: 'monetization_status',
      type: 'option',
      label: 'Have you sold directly to fans before?',
      step: 'proof',
      options: [
        { value: 'direct_established', label: 'Yes, it is a real income stream', icon: '💰' },
        { value: 'direct_some', label: 'Yes, a few times', icon: '🤝' },
        { value: 'merch_only', label: 'Merch only', icon: '👕' },
        { value: 'streaming_only', label: 'Only streaming so far', icon: '🎧' },
        { value: 'none', label: 'Not yet', icon: '🌱' },
      ],
    },
    {
      key: 'current_supporters',
      type: 'number',
      label: 'Fans already paying you directly',
      help: 'Anywhere: Patreon, a Discord, a membership, VIP. Zero is a perfectly normal answer.',
      min: 0,
      step: 'proof',
      placeholder: '40',
    },
    {
      key: 'direct_fan_revenue_cents',
      type: 'currency',
      label: 'What that earns you a month',
      help: 'We subtract this, so the number you see is what you would ADD, not what you already have.',
      min: 0,
      step: 'proof',
      placeholder: '0',
    },
    {
      key: 'unreleased_count',
      type: 'number',
      label: 'Unreleased songs, demos and voice notes',
      help: 'This decides whether a Vault is worth recommending at all. Below five, we will tell you to wait.',
      min: 0,
      step: 'vault',
      placeholder: '30',
    },
    {
      key: 'fans_promote',
      type: 'option',
      label: 'Would your fans put people onto you?',
      step: 'fans',
      options: [
        { value: 'already', label: 'They already do it for free', hint: 'Untracked and unpaid today', icon: '🔥' },
        { value: 'would', label: 'They would, for a cut', icon: '🤝' },
        { value: 'unlikely', label: 'Not yet, honestly', icon: '🌱' },
      ],
    },
    {
      key: 'video_output',
      type: 'option',
      label: 'How much video or livestream do you put out?',
      help: 'Clips need something to cut from. No footage, no clip program.',
      step: 'fans',
      options: [
        { value: 'lots', label: 'Plenty. I am on camera often', icon: '🎥' },
        { value: 'some', label: 'Some, here and there', icon: '📹' },
        { value: 'none', label: 'Almost none', icon: '🚫' },
      ],
    },
    {
      key: 'promoter_overlap',
      type: 'option',
      label: 'Are your sharers and your clippers the same people?',
      help: 'This is the one thing that decides whether we count a helper once or twice.',
      step: 'fans',
      // Only asked when BOTH systems are live for this artist. Otherwise the answer changes nothing.
      dependsOn: {
        all: [
          { key: 'fans_promote', notOneOf: ['unlikely'] },
          { key: 'video_output', notOneOf: ['none'] },
        ],
      },
      options: [
        { value: 'mostly_same', label: 'Mostly the same handful of superfans', icon: '🎯' },
        { value: 'some_overlap', label: 'Some overlap', icon: '🔗' },
        { value: 'mostly_different', label: 'Mostly different people', icon: '🫂' },
        { value: 'unknown', label: 'I have no idea', icon: '🤷' },
      ],
    },
    {
      key: 'live_willing',
      type: 'option',
      label: 'Would you host a live night for your fans?',
      step: 'live',
      options: [
        { value: 'yes', label: 'Yes, I would run one a month', icon: '🎤' },
        { value: 'maybe', label: 'Maybe, occasionally', icon: '🤔' },
        { value: 'no', label: 'No, that is not for me', icon: '🚪' },
      ],
    },
    {
      key: 'session_structure',
      type: 'option',
      label: 'How should a paid session work?',
      help: 'This decides whether it earns on its own or makes your top tier worth its price.',
      step: 'live',
      dependsOn: { key: 'live_willing', notOneOf: ['no'] },
      options: [
        { value: 'included', label: 'Free for my top tier', hint: 'Sells the tier, not a ticket', icon: '👑' },
        { value: 'ticketed', label: 'Ticketed, anyone can buy a seat', icon: '🎟️' },
        { value: 'hybrid', label: 'Top tier gets in free, extra seats sold', icon: '⚖️' },
        { value: 'none', label: 'Skip sessions for now', icon: '⏭️' },
      ],
    },
    {
      key: 'time_capacity',
      type: 'option',
      label: 'How much can you actually keep up with?',
      help: 'We trim the plan to what you will really do. It never inflates the money.',
      step: 'capacity',
      options: [
        { value: 'low', label: 'Very little. Keep it low maintenance', icon: '🪶' },
        { value: 'medium', label: 'A few hours a week', icon: '⏳' },
        { value: 'high', label: 'This is my main focus', icon: '🚀' },
      ],
    },
  ],
  // EIGHT screens for fourteen questions, down from thirteen. This is the front door: all four
  // sub-avatars enter here (docs/SUB_AVATARS.md), the homepage mounts it, and the `free`/`plan`
  // keywords land on it. Every question that used to own a screen still exists and is still asked;
  // the ones that answer the SAME question for the model now share a screen, because a screen is a
  // decision to continue and thirteen of them stand between a cold visitor and the number the hero
  // promised. Nothing was deleted, so no artist's estimate got smaller.
  //
  // The groupings are cognitive, not arbitrary: the two audience numbers belong together (the
  // subtitle is what stops anyone adding them), the three fan-labor questions are one topic and the
  // overlap question only appears once both of its parents are answered, and a session's structure is
  // meaningless until the artist has said they would go live at all.
  //
  // `review` STAYS here, unlike the two-question loss tools: fourteen answers drive money figures,
  // and a typo caught before the reveal is worth its screen.
  wizardSteps: [
    { id: 'audience', group: 'Audience', title: 'How big is your audience?', subtitle: 'What you make, then your numbers. We use the larger of the two, never the sum.' },
    { id: 'owned', group: 'Audience', title: 'How many fans do you own?', subtitle: 'Contacts no platform can take away from you.' },
    { id: 'proof', group: 'Proof', title: 'What are your fans already paying you?', subtitle: 'Whatever exists today gets subtracted, not added.' },
    { id: 'vault', group: 'Catalog', title: 'What is sitting unreleased?', subtitle: 'A vault with nothing in it is a promise you cannot keep.' },
    { id: 'fans', group: 'Fans', title: 'Would your fans work for you?', subtitle: 'Sharing and clipping bring supporters in. A fan can do both jobs and still be one person.' },
    { id: 'live', group: 'Experiences', title: 'Would you go live?', subtitle: 'Nothing here assumes an event you will not run.' },
    { id: 'capacity', group: 'You', title: 'What can you keep up with?', subtitle: 'The last question, and it shapes the whole plan.' },
    { id: 'review', group: 'Review', title: 'Review', subtitle: 'Check your answers, then see the whole picture.' },
  ],
  entryContexts: {
    // ---- The four sub-avatar front doors (docs/SUB_AVATARS.md) ----
    // Every avatar's acquisition link is this calculator with its own `?from=`. The keys ARE the
    // avatar ids, so a campaign link needs no lookup table, and `entryContextToSubAvatar` can
    // recognize an avatar arrival without a second registry. Reordering only: all four run the
    // identical model off the identical questions, which is the entire reason one calculator
    // serves four segments.
    highest_priority_empire_builder: {
      label: 'Empire Builder',
      note: 'You already sell to your fans, so we start with what you have proven and what it is worth in one place, not with whether fans will pay.',
      priorityStepIds: ['audience', 'proof'],
    },
    established_independent_operator: {
      label: 'Independent Operator',
      note: 'You have been doing this a while and you run it yourself, so we start with the catalog and the buyers you already have rather than with growth advice.',
      priorityStepIds: ['vault', 'proof', 'audience'],
    },
    brand_led_hip_hop_artist: {
      label: 'Brand-Led Artist',
      note: 'Your brand already moves people, so we start with the reach and the content you put out, then work out what owning that audience is worth.',
      priorityStepIds: ['audience', 'fans'],
    },
    rnb_empire_builder: {
      label: 'R&B Empire',
      note: 'Your closest fans want more of you, so we start with the unreleased work and the experiences that give them somewhere to go.',
      priorityStepIds: ['vault', 'live', 'audience'],
    },
    // ---- Single-opportunity tool contexts (a topic, not an identity claim) ----
    'fan-stack-calculator': {
      label: 'Fan Stack',
      note: 'You came here about the tools your fan business is split across, so we start with what you already sell and where.',
      priorityStepIds: ['proof', 'audience'],
    },
    'between-tour-calculator': {
      label: 'Between Tours',
      note: 'You came here about the months between shows, so we start with your audience and the experiences that fill the gap.',
      priorityStepIds: ['audience', 'live'],
    },
    'vault-revenue-planner': {
      label: 'Vault',
      note: 'You came here about your vault, so we will start there. The rest of the questions decide where it sits in your business.',
      priorityStepIds: ['vault', 'audience'],
    },
    'share-to-earn-planner': {
      label: 'Share-to-Earn',
      note: 'You came here about fan sharing, so we will start there. Sharing brings supporters in, so we need to know what they arrive to.',
      priorityStepIds: ['fans', 'audience'],
    },
    'clip-to-earn-campaign-planner': {
      label: 'Clip-to-Earn',
      note: 'You came here about clips, so we will start there. Clips convert the fans you already reach, so your audience is next.',
      priorityStepIds: ['fans', 'audience'],
    },
    worth: {
      label: 'Streaming Loss',
      note: 'You came here about what streaming pays you, so we start with your audience and what you already earn direct.',
      priorityStepIds: ['audience', 'proof'],
    },
    'own-your-fans-calculator': {
      label: 'Own Your Fans',
      note: 'You came here about owning your fans, so we start with the contacts you actually control.',
      priorityStepIds: ['owned', 'audience'],
    },
    'executive-producer-session': {
      label: 'Producer Sessions',
      note: 'You came here about selling a seat in the room, so we start with how you want that session to work.',
      priorityStepIds: ['live', 'audience'],
    },
    'live-experience-calculator': {
      label: 'Live Experience',
      note: 'You came here about live, so we start there. A ticket only counts for fans who are not already members.',
      priorityStepIds: ['live', 'audience'],
    },
  },
  resultGeneratorKey: 'unifiedOpportunity',
  usesLossEngine: true,
  resultSections: [],
  publicPreviewSections: [],
  leadCapture: {
    required: false,
    consentCopy: 'Email me my full business plan, plus the follow-up emails on how to launch it. Unsubscribe anytime.',
  },
  cta: {
    publicPrimary: 'Create your CRWN account and build this',
    publicSecondary: 'Email my plan',
    artistPrimary: 'Save my plan',
    artistSecondary: 'Build it in CRWN',
  },
  conversionTarget: { type: 'prefilled_existing_flow', label: 'Build my CRWN plan', route: '/offers/new' },
  requiresEstimateDisclaimer: true,
  analyticsMetadata: { toolId: 'opportunity-calculator', category: 'Monetize', promotedFeature: 'CRWN business system' },
};

// The 19th tool: the Membership Stack Consolidator avatar's entry calculator (docs/ICP.md: the
// ideal customer is a proven direct-to-fan seller whose stack is FRAGMENTED, and consolidation is
// the pitch). Math: src/lib/avatars/fanStackModel.ts via the fan-stack adapter (fanStack@1).
// Hero image is a thematic placeholder (own-your-fans) until a bespoke on-brand photo is made.
const FAN_STACK: LeadMagnetConfig = {
  slug: 'fan-stack-calculator',
  name: 'Fan Stack Consolidation Calculator',
  featureName: 'Consolidated Membership',
  category: 'Monetize',
  description: 'See what running your fan business across five separate tools is costing you every month.',
  videoAngle: 'Patreon has your members, Shopify has your buyers, Discord has your community, and none of them can see the others. Fragmentation is the tax.',
  publicRoute: '/tools/fan-stack-calculator',
  artistRoute: '/artist/tools/fan-stack-calculator',
  icon: '🧩',
  timeToComplete: '2 min',
  dmKeywords: ['stack', 'consolidate'],
  hero: {
    headline: 'Your fan business is split across tools that never talk.',
    subheadline:
      'Every tool holds one piece: the members, the buyers, the community, the list. A fan who pays in one is a stranger in the rest, so every next offer starts from zero. See what the fragmentation costs, and what the same fans are worth in one place.',
    primaryCta: 'See what the pieces cost me',
    image: '/hero-own-your-fans.webp',
    imageAlt: 'Illustration of an artist with a palm pressed to a glass wall, fans reaching from the far side',
  },
  inputs: [
    {
      key: 'platforms_used',
      type: 'checkboxGroup',
      label: 'Where does your fan business run today?',
      required: true,
      step: 'stack',
      options: [
        { value: 'Patreon', label: 'Patreon', icon: '🎗️' },
        { value: 'Discord', label: 'Discord', icon: '💬' },
        { value: 'Shopify', label: 'Shopify or a web store', icon: '🛒' },
        { value: 'Gumroad', label: 'Gumroad', icon: '📦' },
        { value: 'YouTube Memberships', label: 'YouTube Memberships', icon: '▶️' },
        { value: 'Bandcamp', label: 'Bandcamp', icon: '🎵' },
        { value: 'Email tool', label: 'An email tool', icon: '✉️' },
        { value: 'Ticketing', label: 'Ticketing (Eventbrite etc.)', icon: '🎟️' },
        { value: 'Linktree', label: 'Linktree or a link page', icon: '🔗' },
      ],
    },
    {
      key: 'monthly_software_cost_cents',
      type: 'currency',
      label: 'What do those tools cost you per month?',
      help: 'Subscriptions only. Rough is fine. Shown separately, never mixed into the revenue figure.',
      min: 0,
      max: 5000,
      step: 'stack',
      placeholder: '60',
    },
    {
      key: 'paid_members_elsewhere',
      type: 'number',
      label: 'Paying members across those platforms today',
      help: 'Patreon patrons, YouTube members, Discord subscribers. Zero is a normal answer.',
      min: 0,
      max: 1000000,
      step: 'members',
      placeholder: '60',
    },
    {
      key: 'avg_fan_revenue_cents',
      type: 'currency',
      label: 'Average monthly revenue per paying fan',
      help: 'Across everything they buy from you in a month. We only count uplift ABOVE this.',
      min: 0,
      max: 1000,
      step: 'members',
      placeholder: '8',
    },
    {
      key: 'other_direct_monthly_cents',
      type: 'currency',
      label: 'Monthly merch, product or experience revenue',
      help: 'Context only. Existing revenue is never claimed as new.',
      min: 0,
      max: 1000000,
      step: 'revenue',
      placeholder: '0',
    },
    AUDIENCE_INPUT,
    DIRECT_SALES_INPUT,
  ],
  wizardSteps: [
    { id: 'stack', group: 'Your stack', title: 'What is the stack today?', subtitle: 'The tools currently holding pieces of your fan business.' },
    { id: 'members', group: 'Members', title: 'Who already pays you?', subtitle: 'Your existing members are the proof, and the starting point.' },
    { id: 'revenue', group: 'Revenue', title: 'What else do fans buy?', subtitle: 'Context only. Nothing you already earn gets counted as new.' },
    { id: 'audience', group: 'Audience', title: 'How big is your audience?', subtitle: 'A rough number is fine.' },
    { id: 'proof', group: 'Proof', title: 'Have your fans ever paid you directly?', subtitle: 'Streaming is exposure. A sale is proof.' },
    { id: 'review', group: 'Review', title: 'Review', subtitle: 'Check your answers, then see what the fragmentation costs.' },
  ],
  resultGeneratorKey: 'fanStack',
  usesLossEngine: true,
  resultSections: [],
  publicPreviewSections: [],
  leadCapture: { required: false, consentCopy: 'Email me my consolidation plan, plus the follow-up emails on how to launch it. Unsubscribe anytime.' },
  cta: {
    publicPrimary: 'Create your CRWN account and consolidate',
    publicSecondary: 'Email my plan',
    artistPrimary: 'Save my plan',
    artistSecondary: 'Build my consolidated membership',
  },
  conversionTarget: { type: 'prefilled_existing_flow', label: 'Build my consolidated membership', route: '/offers/new' },
  requiresEstimateDisclaimer: true,
  analyticsMetadata: { toolId: 'fan-stack-calculator', category: 'Monetize', promotedFeature: 'Consolidated Membership' },
};

// The 20th tool: the Touring Access Seller avatar's entry calculator. Math:
// src/lib/avatars/betweenTourModel.ts via the between-tour adapter (betweenTour@1).
// Hero image is a thematic placeholder (live-experience) until a bespoke on-brand photo is made.
const BETWEEN_TOUR: LeadMagnetConfig = {
  slug: 'between-tour-calculator',
  name: 'Between-Tour Revenue Calculator',
  featureName: 'VIP Membership',
  category: 'Monetize',
  description: 'See what the months between your shows are worth when VIP buyers become year-round members.',
  videoAngle: 'The VIP buyer who paid a premium on Friday walks out unowned. Tour revenue is a spike with a cliff, and the cliff is optional.',
  publicRoute: '/tools/between-tour-calculator',
  artistRoute: '/artist/tools/between-tour-calculator',
  icon: '🚌',
  timeToComplete: '2 min',
  dmKeywords: ['tour', 'touring'],
  hero: {
    headline: 'Your income stops the night the tour does.',
    subheadline:
      'The fans who prove they pay on show nights, especially your VIP buyers, are offered nothing for the rest of the year. See what a recurring VIP membership earns in the months between runs, from fans you already converted once.',
    primaryCta: 'See what the off-months are worth',
    image: '/tool-live-experience.jpg',
    imageAlt: 'An artist performing a stripped-down set under warm gold light',
  },
  inputs: [
    { key: 'shows_per_year', type: 'number', label: 'Shows or tour dates per year', required: true, min: 0, max: 365, step: 'shows', placeholder: '20' },
    { key: 'avg_attendance', type: 'number', label: 'Average attendance per show', required: true, min: 0, max: 1000000, step: 'shows', placeholder: '400' },
    {
      key: 'vip_buyers_per_show',
      type: 'number',
      label: 'VIP or meet-and-greet buyers per show',
      help: 'Fans who paid extra for access. Zero is a normal answer.',
      min: 0,
      max: 10000,
      step: 'vip',
      placeholder: '10',
    },
    {
      key: 'avg_vip_price_cents',
      type: 'currency',
      label: 'Average VIP spend',
      help: 'What a VIP buyer pays for one night. Context and proof, never multiplied into the recurring figure.',
      min: 0,
      max: 5000,
      step: 'vip',
      placeholder: '75',
    },
    {
      key: 'off_months',
      type: 'number',
      label: 'Months per year with no touring income',
      help: 'The months the calculator is about. Most touring artists have 6 to 10.',
      min: 0,
      max: 12,
      step: 'offseason',
      placeholder: '8',
    },
    AUDIENCE_INPUT,
    DIRECT_SALES_INPUT,
  ],
  wizardSteps: [
    { id: 'shows', group: 'Shows', title: 'What does a year of shows look like?', subtitle: 'Dates and rooms. Rough numbers are fine.' },
    { id: 'vip', group: 'VIP', title: 'Who pays for access?', subtitle: 'VIP buyers are proven spenders, and the core of the model.' },
    { id: 'offseason', group: 'Off-season', title: 'How long is the quiet part?', subtitle: 'The months this calculator exists for.' },
    { id: 'audience', group: 'Audience', title: 'How big is your audience?', subtitle: 'A rough number is fine.' },
    { id: 'proof', group: 'Proof', title: 'Have your fans ever paid you directly?', subtitle: 'Streaming is exposure. A sale is proof.' },
    { id: 'review', group: 'Review', title: 'Review', subtitle: 'Check your answers, then see what the off-months are worth.' },
  ],
  resultGeneratorKey: 'betweenTour',
  usesLossEngine: true,
  resultSections: [],
  publicPreviewSections: [],
  leadCapture: { required: false, consentCopy: 'Email me my between-tour plan, plus the follow-up emails on how to launch it. Unsubscribe anytime.' },
  cta: {
    publicPrimary: 'Create your CRWN account and open the membership',
    publicSecondary: 'Email my plan',
    artistPrimary: 'Save my plan',
    artistSecondary: 'Build my VIP membership',
  },
  conversionTarget: { type: 'prefilled_existing_flow', label: 'Build my VIP membership', route: '/offers/new' },
  requiresEstimateDisclaimer: true,
  analyticsMetadata: { toolId: 'between-tour-calculator', category: 'Monetize', promotedFeature: 'VIP Membership' },
};

export const LEAD_MAGNETS: LeadMagnetConfig[] = [
  VAULT_REVENUE_PLANNER,
  PROOF_OF_DEMAND,
  FAN_MISSION,
  CLIP_TO_EARN,
  FOUNDER_WINDOW,
  MOVEMENT_PAGE,
  FAN_JOURNEY,
  TOP_FAN,
  QUEST_PATH,
  SUPPORTER_PROMISE,
  TEAM_SPLIT,
  SHARE_TO_EARN,
  EXECUTIVE_PRODUCER,
  OWN_YOUR_FANS,
  LIVE_EXPERIENCE,
  ROYALTY_READINESS,
  UNIFIED_OPPORTUNITY,
  FAN_STACK,
  BETWEEN_TOUR,
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
    name: 'Streaming Loss Calculator',
    // The SLUG and NAME stay (campaign links, DM keywords and every historical funnel row are
    // keyed to them). The claim does not: streaming is the discovery job this product depends on,
    // so the description names the gap it cannot close rather than what it pays.
    description: 'See the direct fan economy inside the audience streaming and social already built for you.',
    category: 'Monetize',
    timeToComplete: '1 min',
    featureName: 'Worth Calculator',
    href: '/worth',
    image: '/hero-worth.webp',
    imageAlt: 'Illustration of an artist alone on a stool in a dark studio looking at a glowing phone',
  },
];
