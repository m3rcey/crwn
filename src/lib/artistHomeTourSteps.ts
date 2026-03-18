import { DriveStep } from 'driver.js';

export const artistHomeTourSteps: DriveStep[] = [
  {
    popover: {
      title: 'Welcome to CRWN!',
      description: 'You are one of our first 500 Founding Artists, which means you get free Pro tier access. Before we set up your artist page, here is a quick look at the app your fans will use.',
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
    element: '[data-tour="nav-library"]',
    popover: {
      title: 'Fan library',
      description: 'Fans save their liked songs, playlists, and purchases here. When someone subscribes to you, it shows up in their library.',
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
      description: 'Ready to build your page? Tap here to open your artist dashboard. That is where we will set everything up.',
      side: 'bottom',
      align: 'start',
    },
  },
];
