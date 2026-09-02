// GB The G1ft: the FIRST REFERENCE CONFIGURATION of the Tier Offer Experience.
//
// This module is content, not code. Nothing renders from it directly: the universal
// renderer reads rows from tier_offer_experiences, and scripts/configure-gb-offer.mjs
// writes THESE objects into GB's rows (idempotently, after validating each through the
// same normalizer the read path uses). Keeping the content here rather than inline in a
// script makes it reviewable, testable and diffable, which is what "auditable" means; it
// is exactly the shape the future Offer Builder will write for every artist.
//
// Truth discipline, applied line by line:
//   - Every preview that demonstrates an experience GB has not actually run is
//     truth: 'example', and the renderer discloses that from the field.
//   - Nothing promises a cadence (no monthly anything), a response, feedback, use of a
//     submission, credit, rights, or royalties. Submissions are "for consideration".
//   - Go Bad is referenced as itself (REAL), with no unreleased/exclusive claim.
//   - The VSL slot ships with url: null. Null renders NOTHING fan-facing, per the
//     ratified catalog rule; GB's video becomes one config field when he records it.

import type { TierOfferExperience } from '../types';

export const GB_PLATINUM_OFFER: TierOfferExperience = {
  promise: 'Put your own ideas in the room while GB is creating.',
  description:
    'Do not just vote on what GB creates. Get opportunities to submit your own ideas and material for consideration while selected projects are being built.',
  cta: 'Put My Ideas in the Room',
  secondaryCue: 'See what you get',
  vsl: { url: null },
  previews: [
    {
      kind: 'submission',
      truth: 'example',
      title: 'Send a beat',
      description: 'When GB opens a window, Platinum members can put their own work on the table.',
      fields: [
        { label: 'Your beat', placeholder: 'trap-soul-idea-v2.wav' },
        { label: 'Note to GB', placeholder: 'Made this thinking about the tone of the last drop...' },
      ],
      actionLabel: 'Submit for consideration',
    },
    {
      kind: 'submission',
      truth: 'example',
      title: 'Send a hook or a vocal',
      description: 'A voice memo is enough. Ideas count in whatever form they arrive.',
      fields: [
        { label: 'Your recording', placeholder: 'hook-idea.m4a' },
        { label: 'What it is', placeholder: 'A hook for something slower. Second half is the part.' },
      ],
      actionLabel: 'Submit for consideration',
    },
    {
      kind: 'window',
      truth: 'example',
      title: 'Executive Producer submission opportunities',
      description:
        'For selected projects, GB opens a window where Platinum submissions are considered. This is what one looks like.',
      actionLabel: 'Beat submissions for the next project',
      windowState: 'upcoming',
    },
    {
      kind: 'decision',
      truth: 'example',
      title: 'Final-round decisions',
      description: 'Some calls come down to the wire. Platinum gets a say when GB opens the final round.',
      options: [
        { label: 'Version A', sublabel: 'Harder drums, shorter intro' },
        { label: 'Version B', sublabel: 'The stripped-back cut' },
      ],
      actionLabel: 'Cast your vote',
    },
    {
      kind: 'timeline',
      truth: 'example',
      title: 'Where Platinum sits in a project',
      description: 'From first beat to release, the gold steps are where Platinum members participate.',
      steps: [
        { label: 'Beat', participates: true },
        { label: 'Hook', participates: true },
        { label: 'Verse' },
        { label: 'Cover', participates: true },
        { label: 'Release' },
      ],
    },
    {
      kind: 'status',
      truth: 'real',
      title: 'Platinum status',
      description: 'Your name carries it wherever you show up in GB’s world.',
      badge: 'PLATINUM',
    },
    {
      kind: 'session',
      truth: 'example',
      title: 'Group sessions with GB',
      description:
        'When GB opens a group Q and A or a listening room, Platinum is in it. No fixed schedule is promised; when it happens, you are there.',
    },
  ],
  inherited: {
    heading: 'Everything in Gold is included',
    items: [
      'A&R voting on songs before anyone hears them',
      'The Vault as GB adds to it',
      'Watch Executive Producer Sessions',
      'A say in selected creative decisions',
      'Early and members-only music',
      'Everything in Silver and Bronze too',
    ],
  },
  faqs: [
    {
      q: 'What is the difference between Gold and Platinum?',
      a: 'Gold helps shape the music: voting and selected creative decisions. Platinum can also put its own ideas and material in for consideration, and takes part at the highest level when GB opens final-round decisions and submission windows.',
    },
    {
      q: 'If I submit something, will GB use it?',
      a: 'No guarantee. Submitting puts your work in front of GB for consideration, and that is the whole promise.',
    },
    {
      q: 'Does submitting give me songwriting or producer credit?',
      a: 'No. Submitting alone does not create credits or rights. If something you sent were ever actually used, that would be handled separately with you.',
    },
    {
      q: 'Do I need to be a producer or musician to join?',
      a: 'No. Ideas, references and votes count. Beats and vocals are one way in, not the only one.',
    },
    {
      q: 'Can I cancel?',
      a: 'Any time. Your access runs to the end of the billing period you already paid for.',
    },
  ],
};

export const GB_GOLD_OFFER: TierOfferExperience = {
  promise: 'Help shape GB’s music before the public hears it.',
  description:
    'Hear what GB is working on, get inside selected parts of the creative process, and vote on real decisions before everyone else gets the finished version.',
  cta: 'Help Shape What Comes Next',
  secondaryCue: 'See what you get',
  vsl: { url: null },
  previews: [
    {
      kind: 'decision',
      truth: 'example',
      title: 'A&R voting',
      description: 'GB puts the options in front of Gold. You listen, you pick, the votes count.',
      options: [
        { label: 'Option A', sublabel: 'The one with the sample flip' },
        { label: 'Option B', sublabel: 'Live drums version' },
        { label: 'Option C', sublabel: 'The late-night take' },
      ],
      actionLabel: 'Vote',
    },
    {
      kind: 'collection',
      truth: 'example',
      title: 'The Vault',
      description: 'Where the music that is not public lives. Gold hears it as GB adds to it.',
      items: [
        { title: 'Session bounce', subtitle: 'Rough mix', locked: true },
        { title: 'Alternate take', subtitle: 'Different second verse', locked: true },
        { title: 'Idea sketch', subtitle: 'Voice memo to beat', locked: true },
      ],
    },
    {
      kind: 'decision',
      truth: 'example',
      title: 'Selected creative decisions',
      description: 'Covers, titles, arrangements. When GB opens a call, Gold weighs in.',
      options: [
        { label: 'Cover A', sublabel: 'The portrait' },
        { label: 'Cover B', sublabel: 'The night shot' },
      ],
      actionLabel: 'Pick one',
    },
    {
      kind: 'session',
      truth: 'example',
      title: 'Watch Executive Producer Sessions',
      description: 'When GB runs a session, Gold watches it happen: the room, the takes, the calls.',
    },
    {
      kind: 'timeline',
      truth: 'example',
      title: 'Where Gold sits in a project',
      description: 'The gold steps are where Gold members influence what ships.',
      steps: [
        { label: 'Beat' },
        { label: 'Hook', participates: true },
        { label: 'Verse' },
        { label: 'Cover', participates: true },
        { label: 'Release' },
      ],
    },
    {
      kind: 'audio',
      truth: 'real',
      title: 'Members-only music',
      description: 'Go Bad already lives behind the member gate. Gold hears what comes next before the public does.',
    },
  ],
  inherited: {
    heading: 'Everything in Silver and Bronze included',
    items: [
      'Finished songs before they go public',
      'Private behind the scenes',
      'Alternate versions and members-only music',
      'Stems',
      'Go Bad and first word on every drop',
      'Day One recognition',
    ],
  },
  faqs: [
    {
      q: 'What is the difference between Gold and Platinum?',
      a: 'Gold helps shape the music: voting and selected creative decisions. Platinum can also submit its own ideas and material for consideration and joins final-round decisions when GB opens them.',
    },
    {
      q: 'Can I cancel?',
      a: 'Any time. Your access runs to the end of the billing period you already paid for.',
    },
    {
      q: 'What happens if I stay on the free tier?',
      a: 'You keep Go Bad, you stay on GB’s members list, and you hear about drops first. The paid rungs are open whenever you want more.',
    },
  ],
};

/** Silver is not part of the current acquisition funnel, but its offer identity is
 *  configured so the same renderer can present it wherever Silver is sold. */
export const GB_SILVER_OFFER: TierOfferExperience = {
  promise: 'Go backstage.',
  description:
    'The finished songs before they go public, the private behind the scenes, the alternate versions, and the stems.',
  cta: 'Take Me Backstage',
  secondaryCue: 'See what you get',
  vsl: { url: null },
  previews: [
    {
      kind: 'collection',
      truth: 'example',
      title: 'Backstage',
      description: 'What Silver opens: the music and the making of it.',
      items: [
        { title: 'Early listen', subtitle: 'Before the public', locked: true },
        { title: 'BTS', subtitle: 'In the room', locked: true },
        { title: 'Stems', subtitle: 'The parts themselves', locked: true },
      ],
    },
  ],
  inherited: {
    heading: 'Everything in Bronze included',
    items: ['Go Bad', 'First word on every drop', 'Day One recognition'],
  },
};
