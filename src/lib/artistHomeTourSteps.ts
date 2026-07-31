import { DriveStep } from 'driver.js';

export const artistHomeTourSteps: DriveStep[] = [
  {
    popover: {
      title: 'Welcome to CRWN!',
      description: 'Here is a quick look at the app your fans use, and where your own tools live.',
    },
  },
  {
    element: '[data-tour="home-quick-actions"]',
    popover: {
      title: 'Fan home screen',
      description: 'This is what your fans see when they open the app. They will find new music, artist updates, and quick actions to start exploring.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="nav-explore"]',
    popover: {
      title: 'Discover artists',
      description: 'Fans discover new artists here. Once your page is set up, you will show up in the browse and search results.',
      side: 'top',
      align: 'center',
    },
  },
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
    element: '[data-tour="home-artist-dashboard"]',
    popover: {
      title: 'Your artist dashboard',
      description: 'Tap here anytime to manage your page: music, tiers, shop, payouts, and analytics.',
      side: 'bottom',
      align: 'start',
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
