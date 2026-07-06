import { DriveStep } from 'driver.js';

interface ActionPlanTourOptions {
  /** The top-move card renders only when there is at least one recommendation. */
  hasTopMove?: boolean;
}

/**
 * Tour for /action-plan, the artist's ranked next best moves. The top-move
 * card is conditional (all-caught-up state has none), so its step only appears
 * when a recommendation exists. Self-contained: ends on the replay button.
 */
export function getActionPlanTourSteps({
  hasTopMove = false,
}: ActionPlanTourOptions = {}): DriveStep[] {
  return [
    {
      element: '[data-tour="action-plan-header"]',
      popover: {
        title: 'Your next best moves, ranked',
        description:
          'CRWN looks at what is happening across your page and ranks what to do next, so you never have to guess.',
        side: 'bottom',
        align: 'start',
      },
    },
    ...(hasTopMove
      ? [
          {
            element: '[data-tour="action-plan-top-move"]',
            popover: {
              title: 'Start here',
              description:
                'The single highest-priority move right now, with the why and a button that takes you straight to where you do it.',
              side: 'bottom' as const,
              align: 'start' as const,
            },
          },
        ]
      : []),
    {
      element: '[data-tour="action-plan-advisory"]',
      popover: {
        title: 'Suggestions only',
        description:
          'Nothing here runs automatically and nothing touches your money or prices. Every card just points you to the manual control.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '[data-tour="tour-replay"]',
      popover: {
        title: 'Replay anytime',
        description: 'That is your Action Plan. Replay this tour anytime here.',
        side: 'bottom',
        align: 'end',
      },
    },
  ];
}
