// Prince Dre: the SECOND reference configuration, built from the founder-assisted launch
// blueprint (Prince_Dre_CRWN_Launch_Blueprint.pdf, 2026-09-28). Same shape and same truth
// discipline as gb.ts: content, not code. scripts/configure-prince-dre.mjs writes these
// objects to production after validating each through the read path's normalizer.
//
// What the blueprint proposed and this file deliberately does NOT carry:
//   - "Early merch access" (Gold). CRWN sells no physical goods and has no fulfillment
//     screen; a merch promise here would be one nothing delivers. Merch lives on his own
//     store via merch_store_url, a link OUT.
//   - "Limited group listening sessions" (Platinum). The ladder never promises a limit it
//     has not set; the only real cap is the Founder Window, which is opt-in per tier.
//   - "Priority experiences" (Platinum). Nothing enforces a priority.
//   - Any free unreleased record on Bronze. That is the lead magnet, which is not uploaded
//     yet; it joins the Bronze lines when the magnet track exists.
//
// Truth: nothing is uploaded yet, so every preview is truth: 'example' except Platinum
// status (recognition is a real CRWN treatment). No cadence is promised anywhere, and no
// VSL exists (null renders nothing fan-facing).

import type { TierOfferExperience } from '../types';

export const DRE_SLUG = 'princedre';
export const DRE_DISPLAY_NAME = 'Prince Dre';

export const DRE_TIER_PROMISES: Record<string, string> = {
  Bronze: 'Stay tapped in.',
  Silver: 'Hear it before everybody else.',
  Gold: 'Hear the music the public never got.',
  Platinum: 'Be in the room before the project is finished.',
};

export const DRE_TIER_PRICES_CENTS: Record<string, number> = {
  Bronze: 0,
  Silver: 1000,
  Gold: 2500,
  Platinum: 10000,
};

export const DRE_APPROVED_BENEFITS: Record<string, string[]> = {
  Bronze: [
    'First word on every new release',
    'City announcements when Dre is coming through',
    'Previews and updates from Dre',
  ],
  Silver: [
    'Everything in Bronze',
    'New music before it goes public',
    'Selected archive material from every era',
    'Behind the scenes',
    'Rollout updates as the mixtape comes together',
  ],
  Gold: [
    'Everything in Silver',
    'The Vault, unreleased music as Dre adds it',
    'Songs cut from the projects and alternate versions',
    'Unreleased videos and studio footage',
    'The Vault organized by era, from O\'Block to the next project',
  ],
  Platinum: [
    'Everything in Gold',
    'Group listening sessions when Dre opens one',
    'Hear projects before they are finished',
    'Vote on what Dre drops next',
    'Private group Q and A when Dre opens one',
    'Platinum recognition',
  ],
};

/** Structured identity per approved line: one registry key per DISTINCT capability, on the
 *  lowest rung that promises it (higher rungs inherit). Same method as GB's
 *  configure-gb-tier-benefits.mjs. No `frequency` anywhere: none was approved. */
export const DRE_BENEFIT_IDENTITIES: Record<string, { key: string; line: string }[]> = {
  Bronze: [
    { key: 'drop_alerts', line: 'First word on every new release' },
    { key: 'exclusive_posts', line: 'Previews and updates from Dre' },
  ],
  Silver: [
    { key: 'early_access', line: 'New music before it goes public' },
    { key: 'exclusive_tracks', line: 'Selected archive material from every era' },
  ],
  Gold: [
    { key: 'vault_collection', line: 'The Vault, unreleased music as Dre adds it' },
  ],
  Platinum: [
    { key: 'group_live_qa', line: 'Group listening sessions when Dre opens one' },
    { key: 'creative_voting', line: 'Vote on what Dre drops next' },
    { key: 'member_recognition', line: 'Platinum recognition' },
  ],
};

/** The drop page's standout item for the PRIMARY offer (Gold). */
export const DRE_FUNNEL_PRIMARY_ITEM = {
  title: 'The Vault: the music the public never got',
  description:
    'Songs cut from the projects, alternate versions and unreleased videos, organized by era. The mixtape drops everywhere. This does not.',
};

export const DRE_PLATINUM_OFFER: TierOfferExperience = {
  promise: 'Be in the room before the project is finished.',
  description:
    'Most fans hear the project the day it drops. Platinum hears it while Dre is still making it, votes on what comes next, and gets in the room when he opens one.',
  cta: 'Get Me in the Room',
  secondaryCue: 'See what you get',
  vsl: { url: null },
  previews: [
    {
      kind: 'session',
      truth: 'example',
      title: 'Group listening sessions',
      description:
        'When Dre opens a listening room for a project, Platinum is in it. No fixed schedule is promised; when it happens, you are there.',
    },
    {
      kind: 'decision',
      truth: 'example',
      title: 'Choose the next record',
      description: 'Dre puts unreleased records in front of Platinum. You listen, you pick, the votes count.',
      options: [
        { label: 'Record A', sublabel: 'The one fans keep asking for' },
        { label: 'Record B', sublabel: 'Cut from the mixtape' },
        { label: 'Record C', sublabel: 'Something new' },
      ],
      actionLabel: 'Cast your vote',
    },
    {
      kind: 'timeline',
      truth: 'example',
      title: 'Where Platinum sits in a project',
      description: 'The gold steps are where Platinum hears it before anyone else.',
      steps: [
        { label: 'Studio', participates: true },
        { label: 'Rough mix', participates: true },
        { label: 'Final pick', participates: true },
        { label: 'Release' },
      ],
    },
    {
      kind: 'session',
      truth: 'example',
      title: 'Private group Q and A',
      description: 'When Dre opens a group Q and A, it is Platinum only.',
    },
    {
      kind: 'status',
      truth: 'real',
      title: 'Platinum status',
      description: 'Your rung and your member-since date, on your card.',
      badge: 'PLATINUM',
    },
  ],
  inherited: {
    heading: 'Everything in Gold is included',
    items: [
      'The Vault, unreleased music as Dre adds it',
      'Songs cut from the projects and alternate versions',
      'Unreleased videos and studio footage',
      'New music before it goes public',
      'Everything in Silver and Bronze too',
    ],
  },
  faqs: [
    {
      q: 'What is the difference between Gold and Platinum?',
      a: 'Gold gets the Vault: the unreleased music, cuts and footage. Platinum gets all of that plus the room: listening sessions, votes on what drops next, and group Q and A when Dre opens them.',
    },
    {
      q: 'How often are listening sessions?',
      a: 'There is no fixed schedule. When Dre opens one, Platinum members are in it.',
    },
    {
      q: 'Can I cancel?',
      a: 'Any time. Your access runs to the end of the billing period you already paid for.',
    },
  ],
};

export const DRE_GOLD_OFFER: TierOfferExperience = {
  promise: 'Hear the music the public never got.',
  description:
    'The records cut from the projects, the alternate versions, and the unreleased videos, organized by era. The mixtape drops everywhere. The Vault does not.',
  cta: 'Unlock the Vault',
  secondaryCue: 'See what you get',
  vsl: { url: null },
  previews: [
    {
      kind: 'collection',
      truth: 'example',
      title: 'The Vault, by era',
      description: 'Not one giant folder. Every era gets its own Vault as Dre adds to it.',
      items: [
        { title: "O'Block Vault", subtitle: 'The early era', locked: true },
        { title: 'Prince of Drill Vault', subtitle: 'Cuts and OG versions', locked: true },
        { title: 'Mixtape Vault', subtitle: 'What did not make it', locked: true },
      ],
    },
    {
      kind: 'audio',
      truth: 'example',
      title: 'Cut from the mixtape',
      description: 'The records that did not make the final list. The public never hears these.',
      items: [
        { title: 'Mixtape cut', subtitle: 'Did not make the tracklist', locked: true },
        { title: 'Alternate version', subtitle: 'Different verse, different beat', locked: true },
      ],
      actionLabel: 'Unlock the music',
    },
    {
      kind: 'video',
      truth: 'example',
      title: 'Unreleased videos and studio footage',
      description: 'The visuals and sessions that never went public, posted for members.',
    },
  ],
  inherited: {
    heading: 'Everything in Silver and Bronze included',
    items: [
      'New music before it goes public',
      'Selected archive material from every era',
      'Behind the scenes',
      'First word on every release and city stop',
    ],
  },
  faqs: [
    {
      q: 'Is this the mixtape?',
      a: 'No. The mixtape drops everywhere. The Vault is what the public never gets: the cuts, the alternate versions and the unreleased videos.',
    },
    {
      q: 'What is the difference between Gold and Platinum?',
      a: 'Gold gets the Vault. Platinum gets the Vault plus the room: listening sessions, votes on what drops next, and group Q and A when Dre opens them.',
    },
    {
      q: 'Can I cancel?',
      a: 'Any time. Your access runs to the end of the billing period you already paid for.',
    },
    {
      q: 'What happens if I stay on the free tier?',
      a: 'You stay on Dre’s list and hear about every release and city stop first. The paid rungs are open whenever you want more.',
    },
  ],
};

/** Silver is the funnel's downsell under Gold. */
export const DRE_SILVER_OFFER: TierOfferExperience = {
  promise: 'Hear it before everybody else.',
  description:
    'New music before it goes public, selected archive material from every era, and the behind the scenes of the rollout.',
  cta: 'Let Me Hear It First',
  secondaryCue: 'See what you get',
  vsl: { url: null },
  previews: [
    {
      kind: 'collection',
      truth: 'example',
      title: 'Before everybody else',
      description: 'What Silver opens: the music early, the archive, and the making of it.',
      items: [
        { title: 'Early listen', subtitle: 'Before the public', locked: true },
        { title: 'From the archive', subtitle: 'Every era', locked: true },
        { title: 'Behind the scenes', subtitle: 'The rollout', locked: true },
      ],
    },
  ],
  inherited: {
    heading: 'Everything in Bronze included',
    items: ['First word on every new release', 'City announcements when Dre is coming through'],
  },
};
