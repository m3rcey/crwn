import { DriveStep } from 'driver.js';

interface CampaignHubTourOptions {
  /** The stat tiles only render on the Overview tab (the default). */
  onOverview?: boolean;
}

/**
 * Tour for /campaign-hub, the artist's promotion engine at a glance. The stat
 * grid lives on the Overview tab, so its step only appears when that tab is
 * active (first visit always starts there; replays respect the current tab).
 * Self-contained: ends on the replay button.
 */
export function getCampaignHubTourSteps({
  onOverview = true,
}: CampaignHubTourOptions = {}): DriveStep[] {
  return [
    {
      element: '[data-tour="campaign-hub-header"]',
      popover: {
        title: 'Your promotion engine at a glance',
        description:
          'Everything your fans are earning you in one read-only view: revenue driven, commissions owed, top promoters, and mission performance.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="campaign-hub-tabs"]',
      popover: {
        title: 'Three views',
        description:
          'Overview for the money totals, Promotion Engine for the Share vs Clip split and your top promoters, Missions for how each mission is tracking.',
        side: 'bottom',
        align: 'start',
      },
    },
    ...(onOverview
      ? [
          {
            element: '[data-tour="campaign-hub-stats"]',
            popover: {
              title: 'The numbers that matter',
              description:
                'Gross revenue your promoters drove, what you owe them in commissions, your net, and how many residuals are still paying out.',
              side: 'bottom' as const,
              align: 'start' as const,
            },
          },
        ]
      : []),
    {
      element: '[data-tour="tour-replay"]',
      popover: {
        title: 'Replay anytime',
        description: 'That is the Campaign Hub. Replay this tour anytime here.',
        side: 'bottom',
        align: 'end',
      },
    },
  ];
}
