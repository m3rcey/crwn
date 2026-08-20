import { DriveStep } from 'driver.js';

export const fanHomeTourSteps: DriveStep[] = [
  {
    popover: {
      title: 'Welcome to CRWN!',
      description: 'This is the home for independent music. Every dollar you spend goes directly to the artists you support.',
    },
  },
  {
    // Anchored on the Featured row. The old anchor was [data-tour="home-quick-actions"],
    // deleted on 2026-08-19: every tile in it was a second door to a bottom-nav slot, and
    // its copy told fans to "Explore Artists" from a section that no longer exists.
    element: '[data-tour="home-feed"]',
    popover: {
      title: 'Start here',
      description: 'Tap any artist to open their page. This is where you subscribe, listen, and see what only members get.',
      side: 'bottom',
      align: 'start',
    },
  },
  // The Explore step was removed with the Explore nav slot (2026-08-13 pre-PMF surface
  // reduction). A tour step whose element never renders makes driver.js skip silently, but it
  // also leaves a lie in the script: it told fans to browse a catalogue of nine artists.
  // The Missions step went with the fan missions nav slot. The fan's money is on /library now
  // (ReferralDashboard), which the Library step below already covers.
  {
    popover: {
      title: 'Music never stops',
      description: 'Tap any track to start listening. Your music keeps playing as you browse the app, even when you switch pages.',
    },
  },
  {
    element: '[data-tour="home-help"]',
    popover: {
      title: 'Need help?',
      description: 'Tap this anytime for a guide on getting the most out of CRWN. It is always here if you need it.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    popover: {
      title: 'Share & Earn',
      description: 'Once you subscribe to an artist, share any link (their page, a track, the shop) and earn a recurring commission when someone subscribes through it.',
    },
  },
  {
    element: '[data-tour="tour-replay"]',
    popover: {
      title: 'You are all set!',
      description: 'Head to Explore to discover your first artist. And you can replay this tour anytime by tapping this button.',
      side: 'bottom',
      align: 'end',
    },
  },
];
