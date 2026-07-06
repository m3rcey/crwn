import { DriveStep } from 'driver.js';

interface CommandTourOptions {
  /** "Your missions" card renders only when the fan has joined missions. */
  hasMissions?: boolean;
  /** The money-snapshot grid renders only when the fan isn't brand new. */
  hasWeek?: boolean;
  /** "Earning opportunities" renders only when there's something to share. */
  hasOpportunities?: boolean;
}

/**
 * Tour for /command — the fan Command Center. Sections render conditionally
 * (brand-new fans only see Today's move), so only include steps whose anchors
 * actually exist. Self-contained: ends on the replay button.
 */
export function getCommandTourSteps({
  hasMissions = false,
  hasWeek = false,
  hasOpportunities = false,
}: CommandTourOptions = {}): DriveStep[] {
  return [
    {
      element: '[data-tour="command-today"]',
      popover: {
        title: "Today's move",
        description: 'One action, picked for you every day. Do this and you are helping the artists you back.',
        side: 'bottom',
        align: 'start',
      },
    },
    ...(hasMissions
      ? [
          {
            element: '[data-tour="command-missions"]',
            popover: {
              title: 'Your missions',
              description: 'Every mission you have joined, with live progress. Tap one to keep it moving.',
              side: 'bottom' as const,
              align: 'start' as const,
            },
          },
        ]
      : []),
    ...(hasWeek
      ? [
          {
            element: '[data-tour="command-week"]',
            popover: {
              title: 'Your money',
              description: 'What you can cash out and the revenue you have driven for artists. Tap either card for the full picture.',
              side: 'top' as const,
              align: 'start' as const,
            },
          },
        ]
      : []),
    ...(hasOpportunities
      ? [
          {
            element: '[data-tour="command-opportunities"]',
            popover: {
              title: 'Earning opportunities',
              description: 'Artists you back that pay you a commission. Copy your link and share it anywhere.',
              side: 'top' as const,
              align: 'start' as const,
            },
          },
        ]
      : []),
    {
      element: '[data-tour="tour-replay"]',
      popover: {
        title: 'Replay anytime',
        description: 'That is your Command Center. Replay this tour anytime here.',
        side: 'bottom',
        align: 'end',
      },
    },
  ];
}
