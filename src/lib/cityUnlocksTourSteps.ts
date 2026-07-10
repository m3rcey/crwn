import { DriveStep } from 'driver.js';

// Tour for /city-unlocks.
export const cityUnlocksTourSteps: DriveStep[] = [
  {
    element: '[data-tour="city-header"]',
    popover: {
      title: 'Grow city by city',
      description:
        'Pick a city, set a goal (supporters, RSVPs, shares), and local fans unlock a show, drop, or exclusive. Run these where you already have demand.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="city-new"]',
    popover: {
      title: 'Create a city unlock',
      description:
        'Choose what unlocks and the goal, then share the city link. Fans rep their city and the bar fills. Privacy-safe, aggregates only.',
      side: 'bottom',
      align: 'end',
    },
  },
];
