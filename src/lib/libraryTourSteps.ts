import { DriveStep } from 'driver.js';

export const libraryTourSteps: DriveStep[] = [
  {
    element: '[data-tour="library-tab-purchases"]',
    popover: {
      title: 'Your purchases',
      description: 'Digital products and experiences you have bought from artists show up here. Download them anytime.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="library-tab-liked"]',
    popover: {
      title: 'Liked songs',
      description: 'Tap the heart on any track to save it here. Build your personal collection as you discover new music.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="library-tab-playlists"]',
    popover: {
      title: 'Your playlists',
      description: 'Create playlists to organize your favorite tracks. Add songs from any artist on the platform.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="library-tab-referrals"]',
    popover: {
      title: 'Earn by sharing',
      description: 'Share any link — an artist page, a track, the shop — and if someone subscribes through it, you earn a recurring commission. Your earnings accumulate here.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="library-tab-referrals"]',
    popover: {
      title: 'Get paid',
      description: 'Once your balance reaches $25, connect your Stripe account and cash out your referral earnings. No fees.',
      side: 'bottom',
      align: 'start',
    },
  },
];
