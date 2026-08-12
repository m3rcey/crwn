import { DriveStep } from 'driver.js';

// Tour for /studio/manager (F-13). The copy states the Z4/Z5 boundary exactly: Manager is the
// VOICE of the canonical priority, never a second owner of it. The Constraint Engine decides
// what matters; Manager explains it and does bounded, approved work against it.
export const managerTourSteps: DriveStep[] = [
  {
    element: '[data-tour="manager-root"]',
    popover: {
      title: 'Your manager works the priority, not a second opinion',
      description:
        'CRWN diagnoses ONE constraint on your business from real evidence. Your manager explains that priority and helps you work it. It never invents a different plan, so you are never told two contradictory "most important things".',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    popover: {
      title: 'Actions are drafts until you approve them',
      description:
        'When your manager proposes an action (an email, a post, a plan step), nothing is created or sent until you approve it. You stay the only one who speaks to your fans.',
      side: 'top',
      align: 'center',
    },
  },
  {
    popover: {
      title: 'When evidence is thin, it says so',
      description:
        'With too little data to diagnose anything, your manager will not fake confidence. Do the next setup step, get your first fans in, and the reads get sharper.',
      side: 'top',
      align: 'center',
    },
  },
];
