import { DriveStep } from 'driver.js';

export const exploreTourSteps: DriveStep[] = [
  {
    element: '[data-tour="explore-search"]',
    popover: {
      title: 'Search for artists',
      description: 'Type an artist name to find them instantly. Results update as you type.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="explore-artists"]',
    popover: {
      title: 'Browse artists',
      description: 'Every artist on CRWN is independent. Tap any card to visit their page, listen to their music, and subscribe to support them.',
      side: 'top',
      align: 'start',
    },
  },
];
