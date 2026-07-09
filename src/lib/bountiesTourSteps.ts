import { DriveStep } from 'driver.js';

// Tour for /bounties.
export const bountiesTourSteps: DriveStep[] = [
  {
    element: '[data-tour="bounties-header"]',
    popover: {
      title: 'Bonus challenges for your clippers',
      description:
        'A bounty adds a targeted reward on top of Clip-to-Earn: best clip tonight, first to convert 5 subs, top 3 split. v1 rewards are non-cash (badges, access, boosts).',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="bounties-new"]',
    popover: {
      title: 'Launch a bounty',
      description:
        'Tie it to a VOD or live, set the challenge and reward, and your clippers compete. Review clips and pick the winner.',
      side: 'bottom',
      align: 'end',
    },
  },
];
