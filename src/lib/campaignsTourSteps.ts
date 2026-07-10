import { DriveStep } from 'driver.js';

// Tour for /campaigns (Road To).
export const campaignsTourSteps: DriveStep[] = [
  {
    element: '[data-tour="campaigns-header"]',
    popover: {
      title: 'Your "Road to ___"',
      description:
        'A campaign is the big rollout goal fans rally behind: Road to First Music Video, Road to 100 Supporters. It becomes the hero card on your page.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="campaigns-new"]',
    popover: {
      title: 'Start a campaign',
      description:
        'Pick what the goal tracks (money raised, supporters, RSVPs, votes), set the target, and it goes live as your Current Mission. Missions, bounties, and city unlocks rally behind it.',
      side: 'bottom',
      align: 'end',
    },
  },
];
