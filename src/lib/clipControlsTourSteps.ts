import { DriveStep } from 'driver.js';

/**
 * Tour for /clip-controls, where the artist marks VOD moments and turns them
 * into clip missions. The sessions area anchor wraps BOTH the empty state and
 * the recordings list, so it always exists. Self-contained: ends on the
 * replay button.
 */
export const clipControlsTourSteps: DriveStep[] = [
  {
    element: '[data-tour="clip-controls-header"]',
    popover: {
      title: 'Turn VOD moments into clip missions',
      description:
        'Mark the moments worth clipping on your recorded sessions, then point clippers straight at them. Clippers cut the video themselves.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="clip-controls-commission"]',
    popover: {
      title: 'What clippers earn',
      description:
        'Your current artist-wide clip commission. Every clip mission pays at this rate on the subs the clip brings in.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="clip-controls-sessions"]',
    popover: {
      title: 'Your recordings',
      description:
        'Each ready recording shows up here. Add a moment (a timestamp plus a label), then hit Create clip mission to send clippers after it.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="tour-replay"]',
    popover: {
      title: 'Replay anytime',
      description: 'That is Live Clip Controls. Replay this tour anytime here.',
      side: 'bottom',
      align: 'end',
    },
  },
];
