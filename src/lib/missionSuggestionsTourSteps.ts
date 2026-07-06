import { DriveStep } from 'driver.js';

/**
 * Tour for /missions/suggestions, the artist's review queue for fan-proposed
 * missions. Approve/Reject buttons live on pending cards (which may be absent),
 * so that step is element-less. Self-contained: ends on the replay button.
 */
export const missionSuggestionsTourSteps: DriveStep[] = [
  {
    element: '[data-tour="mission-suggestions-header"]',
    popover: {
      title: 'Review fan-proposed missions',
      description:
        'Mission ideas your fans pitch from your page land here. Nothing goes live until you approve it.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="mission-suggestions-toggle"]',
    popover: {
      title: 'Pending vs Reviewed',
      description:
        'Pending is your inbox of ideas waiting on a decision. Reviewed keeps the audit trail of everything you approved or rejected.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    // Element-less on purpose: Approve/Reject buttons only exist on pending cards.
    popover: {
      title: 'You make the call',
      description:
        'Approve turns an idea into a real mission with a reward YOU set (the fan’s suggestion is never binding). Reject records a reason. Either way the fan is notified.',
    },
  },
  {
    element: '[data-tour="tour-replay"]',
    popover: {
      title: 'Replay anytime',
      description: 'That is Fan suggestions. Replay this tour anytime here.',
      side: 'bottom',
      align: 'end',
    },
  },
];
