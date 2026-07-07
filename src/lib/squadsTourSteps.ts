import { DriveStep } from 'driver.js';

// Tour for /squads. Anchors are always present (header + New button).
export const squadsTourSteps: DriveStep[] = [
  {
    element: '[data-tour="squads-header"]',
    popover: {
      title: 'Organize your fans into teams',
      description:
        'A squad is a role-based group of fans — Top Clippers, Street Team, City Captains, First 100. Give them a goal, missions, and a badge.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="squads-new"]',
    popover: {
      title: 'Build a squad',
      description:
        'Pick a squad type, choose who can join, then invite your best fans. Members earn a badge automatically. Keep it to 1–3 active squads.',
      side: 'bottom',
      align: 'end',
    },
  },
];
