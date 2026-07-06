import { DriveStep } from 'driver.js';

/**
 * Tour for /offers, the artist's list of everything fans can buy. All anchors
 * are always-present (header, Build button, helper links), so the steps are a
 * static array. Self-contained: ends on the replay button.
 */
export const offersTourSteps: DriveStep[] = [
  {
    element: '[data-tour="offers-header"]',
    popover: {
      title: 'Package what fans buy',
      description:
        'Every offer you sell in one list: monthly memberships and one-time drops. An offer is just a tier or a product, nothing new to manage.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="offers-build"]',
    popover: {
      title: 'Build an Offer',
      description:
        'This is the main move. It walks you through packaging a membership tier or a one-time offer in about a minute.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="offers-links"]',
    popover: {
      title: 'Not sure yet?',
      description:
        'Test demand first to prove fans want the idea before you build it, or rally fans behind a goal with a mission.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="tour-replay"]',
    popover: {
      title: 'Replay anytime',
      description: 'That is My Offers. Replay this tour anytime here.',
      side: 'bottom',
      align: 'end',
    },
  },
];
