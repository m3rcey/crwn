import { DriveStep } from 'driver.js';

// The dashboard tour.
//
// This file used to hold a 27-step walk that clicked its way across the artist
// dashboard's tab strip: [data-tour="tab-profile"], "tab-tiers", "tab-payouts"
// and so on. Those tabs are gone. Each one is a route now, reached from the
// hamburger (manage the business) or Studio (do the work), so a tour built on
// tab selectors would point driver.js at elements that no longer exist.
//
// What replaced it is deliberately short. An artist reaching this point has just
// finished the setup wizard, which already walked them through profile, tiers,
// music and shop. What they do NOT know is the new shape of the app: that the
// hamburger holds their money and their account, that Studio holds the tools, and
// that Rise Mode tells them what to do next. Four landmarks, not twenty-seven.
//
// Every selector below is rendered by Navigation or the Rise Mode page, both of
// which are on screen when this tour runs. Keep it that way: a step whose element
// is missing leaves driver.js showing an unanchored popover.

/**
 * The tour an artist gets AFTER finishing the setup wizard. Orientation only:
 * where things live now, and which screen answers "what do I do next".
 */
export function getPostSetupTourSteps(platformTier: string = 'starter'): DriveStep[] {
  const isStarter = platformTier === 'starter';

  return [
    {
      popover: {
        title: 'Welcome to your dashboard',
        description:
          'Your page is set up and live. Here is where everything lives, in about thirty seconds.',
      },
    },
    {
      element: '[data-tour="nav-rise"]',
      popover: {
        title: 'Rise Mode is your next move',
        description:
          'Open this when you do not know what to work on. It reads your numbers and names the one thing costing you the most right now.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '[data-tour="nav-studio"]',
      popover: {
        title: 'Studio is your toolbox',
        description:
          'Music, shop, live sessions, analytics, fan missions, splits. Every tool you use to make and sell something is behind this tab.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '[data-tour="account-hub"]',
      popover: {
        title: 'Your money and your account',
        description: isStarter
          ? 'Payouts, tiers and pricing, your plan, and your artist page settings are all in this menu. Your plan is the free one, so CRWN takes 12%. Pro drops that to 8%.'
          : 'Payouts, tiers and pricing, your plan, and your artist page settings are all in this menu.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="view-as-fan"]',
      popover: {
        title: 'Check your own front door',
        description:
          'Tap here anytime to see exactly what a fan sees when they land on your page. Most artists never look, and never find out what is broken.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="tour-replay"]',
      popover: {
        title: 'That is the whole map',
        description: 'Replay this anytime by tapping here.',
        side: 'bottom',
        align: 'end',
      },
    },
  ];
}
