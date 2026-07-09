import { DriveStep } from 'driver.js';

// Tour for /playbooks.
export const playbooksTourSteps: DriveStep[] = [
  {
    element: '[data-tour="playbooks-header"]',
    popover: {
      title: 'Proven campaigns, generated for you',
      description:
        'A playbook packages a growth campaign (squad, mission, bounty, city unlock, messages) into a guided plan built from your own data.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="playbooks-catalog"]',
    popover: {
      title: 'Run one: you approve every step',
      description:
        'Pick a playbook and it drafts the assets. Nothing is created or sent until you approve each step. Build steps create the real thing; messages stay drafts you send.',
      side: 'top',
      align: 'start',
    },
  },
];
