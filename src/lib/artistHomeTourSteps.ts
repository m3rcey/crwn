import { DriveStep } from 'driver.js';

export const artistHomeTourSteps: DriveStep[] = [
  {
    popover: {
      title: 'Welcome to CRWN!',
      description: 'Here is a quick look at the app your fans use, and where your own tools live.',
    },
  },
  {
    // Anchored on the Featured row, which is the part of /home a fan actually meets.
    // The old anchor was [data-tour="home-quick-actions"], deleted on 2026-08-19 with the
    // Quick Actions section: every tile in it was a second door to a bottom-nav slot.
    element: '[data-tour="home-feed"]',
    popover: {
      title: 'Fan home screen',
      description: 'This is what your fans see when they open the app: artists to discover, and their own library one tap away.',
      side: 'bottom',
      align: 'start',
    },
  },
  // The Explore step was removed with the Explore nav slot (2026-08-13 pre-PMF surface
  // reduction). A tour step whose element never renders makes driver.js skip silently, but it
  // also leaves a lie in the script: it told fans to browse a catalogue of nine artists.
  {
    element: '[data-tour="home-help"]',
    popover: {
      title: 'Need help?',
      description: 'Tap this anytime for a step by step guide on setting up your page. It is always here if you need a refresher.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    // Replaces the deleted "Your artist dashboard" step, which pointed at a /home tile AND
    // described a screen that no longer exists: /profile/artist stopped being a 16-tab
    // dashboard on 2026-08-13 and is Rise Mode, which names ONE next move. The Rise tab is
    // the real, permanent way in, and it is where artists now land when they log in.
    element: '[data-tour="nav-rise"]',
    popover: {
      title: 'Rise Mode is your screen',
      description: 'This is where CRWN tells you the one thing to do next, and why it matters. It is where you land when you log in.',
      side: 'top',
      align: 'center',
    },
  },
  {
    // Anchored on the help button that actually exists on /home. The old anchor
    // ([data-tour="tour-replay"]) is a Rise Mode element, so this final step
    // floated over nothing here.
    element: '[data-tour="home-help"]',
    popover: {
      title: 'Replay anytime',
      description: 'That is the tour. Tap this help button anytime to see it again or get the setup guide.',
      side: 'bottom',
      align: 'end',
    },
  },
];
