import { DriveStep } from 'driver.js';

// Tour for /fan-campaigns (F-13). Boundaries this copy must hold: a drive is a bounded
// campaign DIMENSION over the canonical referral rails (never its own source of truth about
// who earned what), one active drive per artist, V1 rewards are non-cash, and numbers CRWN
// cannot measure are reported missing, never zero.
export const fanDrivesTourSteps: DriveStep[] = [
  {
    element: '[data-tour="fan-drives-root"]',
    popover: {
      title: 'A drive points your fans at ONE goal',
      description:
        'A Fan Drive is a time-boxed push where your fans recruit for you: new listeners in the door or first paid members. One drive runs at a time, so every share your fans make counts toward the same scoreboard.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    popover: {
      title: 'Results come from real joins, not claims',
      description:
        'Outcomes are counted from CRWN’s own referral records inside the drive window. A view count someone types in cannot rank or win anything, and a number CRWN cannot verify shows as missing rather than pretending to be zero.',
      side: 'top',
      align: 'center',
    },
  },
  {
    popover: {
      title: 'Rewards are recognition, not cash',
      description:
        'Drive rewards are things you already control: shoutouts, unreleased tracks, guest-list spots. Fan referral commissions, if you run them, stay a separate program with its own rules, so a drive can never quietly become a payroll.',
      side: 'top',
      align: 'center',
    },
  },
];
