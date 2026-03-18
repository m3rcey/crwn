import { DriveStep } from 'driver.js';

export const fanHomeTourSteps: DriveStep[] = [
  {
    popover: {
      title: 'Welcome to CRWN!',
      description: 'This is the home for independent music. Every dollar you spend goes directly to the artists you support.',
    },
  },
  {
    element: '[data-tour="home-quick-actions"]',
    popover: {
      title: 'Start here',
      description: 'Tap Explore Artists to browse and discover new music. New releases and recommendations will show up here too.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="nav-explore"]',
    popover: {
      title: 'Discover artists',
      description: 'Search for artists or browse the full catalog. When you find someone you like, tap their page to listen.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="nav-library"]',
    popover: {
      title: 'Your library',
      description: 'Your liked songs, playlists, purchases, and subscriptions all live here. Come back to this as you build your collection.',
      side: 'top',
      align: 'center',
    },
  },
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
      title: 'You are all set!',
      description: 'Head to Explore to discover your first artist. When you find someone you love, subscribe to unlock their exclusive content and join their community.',
    },
  },
];
