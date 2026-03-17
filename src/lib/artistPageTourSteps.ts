import { DriveStep } from 'driver.js';

export const artistPageTourSteps: DriveStep[] = [
  {
    element: '[data-tour="artist-page-header"]',
    popover: {
      title: 'Your public page',
      description: 'This is what fans see when they visit your CRWN page. Your name, avatar, banner, and bio are front and center.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="artist-page-music"]',
    popover: {
      title: 'Your music',
      description: 'Fans can stream your free tracks right here. Exclusive tracks show a lock icon and prompt fans to subscribe.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="artist-page-tiers"]',
    popover: {
      title: 'Subscription tiers',
      description: 'Fans choose a tier and subscribe with one click. Each tier shows its benefits clearly so fans know what they get.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="founding-badge"]',
    popover: {
      title: 'Founding Artist badge',
      description: 'This badge shows fans you were one of the first artists on CRWN. It is visible on your public page and builds trust with new fans.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="share-earn"]',
    popover: {
      title: 'Share and Earn',
      description: 'When fans subscribe to you, they see this button. If they share your page and someone new subscribes through their link, that fan earns the commission you set.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="artist-page-community"]',
    popover: {
      title: 'Community',
      description: 'Post updates, behind the scenes content, photos, and videos here. You can gate posts to specific tiers for exclusive content. This is your direct line to fans.',
      side: 'top',
      align: 'start',
    },
  },
  {
    popover: {
      title: 'You are ready!',
      description: 'Share thecrwn.app/yourname with your fans and start building your community. Your page is live and ready to go.',
    },
  },
];
