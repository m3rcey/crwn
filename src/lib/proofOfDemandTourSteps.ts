import { DriveStep } from 'driver.js';

/**
 * Tour for /proof-of-demand, the artist's demand tests. The tests-area anchor
 * wraps BOTH the empty state and the list, so it always exists.
 * Self-contained: ends on the replay button.
 */
export const proofOfDemandTourSteps: DriveStep[] = [
  {
    element: '[data-tour="proof-of-demand-header"]',
    popover: {
      title: 'Test an idea before you build it',
      description:
        'Got an idea for a drop, a show, or merch? Prove fans want it first. No money moves until you say so.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="proof-of-demand-new"]',
    popover: {
      title: 'New Test',
      description:
        'Set up an RSVP, vote, or waitlist in about a minute. Fans respond right on your page.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="proof-of-demand-tests"]',
    popover: {
      title: 'Watch the signal',
      description:
        'Every test tracks responses against your goal with a live progress bar. Hit the goal and you have proof, so build it as an offer.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="tour-replay"]',
    popover: {
      title: 'Replay anytime',
      description: 'That is Demand Tests. Replay this tour anytime here.',
      side: 'bottom',
      align: 'end',
    },
  },
];
