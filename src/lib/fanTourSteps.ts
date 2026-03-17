import { DriveStep } from 'driver.js';

export const fanTourSteps: DriveStep[] = [
  {
    popover: {
      title: 'Welcome to CRWN! 👑',
      description: 'The home for independent music. Discover artists, stream exclusive tracks, and support the musicians you love. Here\'s a quick look around.',
    },
  },
  {
    element: '[data-tour="nav-explore"]',
    popover: {
      title: 'Discover New Music',
      description: 'Browse artists, listen to new releases, and find your next favorite. Every artist on CRWN is independent — your support goes directly to them.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="nav-library"]',
    popover: {
      title: 'Your Library',
      description: 'Your liked songs, playlists, purchases, and subscriptions all live here. Build your collection as you discover new music.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="nav-home"]',
    popover: {
      title: 'Background Playback',
      description: 'Music keeps playing as you browse the app. Just tap a track and keep exploring — your music won\'t stop.',
      side: 'top',
      align: 'center',
    },
  },
  {
    popover: {
      title: 'You\'re Ready! 🎶',
      description: 'Head to Explore to discover artists and start listening. When you find someone you love, subscribe to unlock their exclusive content and join their community.',
    },
  },
];
