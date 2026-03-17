import { DriveStep } from 'driver.js';

export const artistTourSteps: DriveStep[] = [
  {
    popover: {
      title: 'Welcome to CRWN! 👑',
      description: 'Let\'s walk you through your artist dashboard. This is where you manage everything — your music, fans, earnings, and more. It\'ll take less than a minute.',
    },
  },
  {
    element: '[data-tour="tab-profile"]',
    popover: {
      title: 'Set Up Your Profile',
      description: 'Start here — add your artist name, bio, avatar, and banner image. Don\'t forget to set your city, state, and genres so we can match you with sync licensing opportunities near you.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="tab-tiers"]',
    popover: {
      title: 'Create Subscription Tiers',
      description: 'Connect your Stripe account, then create 2-3 fan tiers. A good starting template:\n\n• Tier 1 ($5-10/mo): Exclusive tracks + community access\n• Tier 2 ($25-50/mo): Everything above + early access + behind-the-scenes\n• Tier 3 ($100-200/mo): Everything above + 1-on-1 sessions + merch discounts',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="tab-tracks"]',
    popover: {
      title: 'Upload Your Music',
      description: 'Upload tracks and set them as free (anyone can listen) or exclusive to specific tiers. Tip: Keep at least 2-3 tracks free so new fans can discover your sound before subscribing.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="tab-shop"]',
    popover: {
      title: 'Open Your Shop',
      description: 'Sell digital products (beat packs, sample kits, presets), experiences (1-on-1 video calls, song critiques), and bundles. For 1-on-1 sessions, set up a free Cal.com account first — fans will book through your calendar link.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="tab-community"]',
    popover: {
      title: 'Build Your Community',
      description: 'Post updates, behind-the-scenes content, photos, and videos. You can gate posts to specific tiers to give subscribers exclusive content. This is your direct line to your fans — no algorithm in the way.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="view-as-fan"]',
    popover: {
      title: 'Preview Your Page',
      description: 'See exactly what fans see when they visit your page. Use this to make sure everything looks right before sharing your link.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="tab-analytics"]',
    popover: {
      title: 'Track Your Growth',
      description: 'Revenue, subscribers, song plays, top fans, and more — all in real time. Toggle between daily, weekly, and monthly views. This is your command center.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    popover: {
      title: 'You\'re All Set! 🎉',
      description: 'Start by setting up your profile, then connect Stripe and create your tiers. Once your page is live, share thecrwn.app/yourname with your fans. Let\'s build something special.',
    },
  },
];
