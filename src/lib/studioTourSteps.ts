import { DriveStep } from 'driver.js';

// Tour for /studio — the artist workspace hub. All cards render for every
// artist (the hub is pure navigation), so the steps are a static list.
// Self-contained: no cross-page promises; ends on the replay button.
export const studioTourSteps: DriveStep[] = [
  {
    element: '[data-tour="studio-welcome"]',
    popover: {
      title: 'Welcome to your Studio',
      description: 'This is your workspace. Every tool you use to grow lives on this page.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="studio-offers"]',
    popover: {
      title: 'Build offers',
      description: 'Package your music, merch, and access into offers fans can only get from you.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="studio-campaign-hub"]',
    popover: {
      title: 'Run campaigns',
      description: 'Plan a release and point all your fans at it from one place.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="studio-missions"]',
    popover: {
      title: 'Fan missions',
      description: 'Give fans missions like sharing your page or streaming a track. They move, you grow. Fan Suggestions next to it shows what they want from you.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="studio-clips"]',
    popover: {
      title: 'Live clips',
      description: 'Control which moments from your livestreams fans can clip and share.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="studio-action-plan"]',
    popover: {
      title: 'Your action plan',
      description: 'Not sure what to do next? Your prioritized next moves live here.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="studio-demand"]',
    popover: {
      title: 'Proof of demand',
      description: 'Test an idea before you build it. Fans tell you what they would pay for.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="tour-replay"]',
    popover: {
      title: 'Replay anytime',
      description: 'That is your Studio. Replay this tour anytime here.',
      side: 'bottom',
      align: 'end',
    },
  },
];
