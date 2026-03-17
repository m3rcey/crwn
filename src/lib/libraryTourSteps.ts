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
      title: 'Referral earnings',
      description: 'When you share an artist page and someone subscribes through your link, you earn a commission. Track your earnings here.',
      side: 'bottom',
      align: 'start',
    },
  },
];
