import { DriveStep } from 'driver.js';

/**
 * Tour for /missions, the artist's list of fan missions. All anchors are
 * always-present (header, New Mission button, Fan suggestions link), so the
 * steps are a static array. Self-contained: ends on the replay button.
 */
export const missionsTourSteps: DriveStep[] = [
  {
    element: '[data-tour="missions-header"]',
    popover: {
      title: 'Turn supporters into a growth team',
      description:
        'A mission gives your fans one clear action (share, clip, RSVP, vote) and a goal to hit together. Progress tracks itself.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="missions-new"]',
    popover: {
      title: 'Launch a mission',
      description:
        'Pick the action, set the goal and the reward, and it goes live on your page for fans to join.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="missions-suggestions"]',
    popover: {
      title: 'Fans pitch ideas too',
      description:
        'Fan-proposed missions land in Fan suggestions for your approval, and the Action Plan ranks your recommended next moves.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="tour-replay"]',
    popover: {
      title: 'Replay anytime',
      description: 'That is Missions. Replay this tour anytime here.',
      side: 'bottom',
      align: 'end',
    },
  },
];
