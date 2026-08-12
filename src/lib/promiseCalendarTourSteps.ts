import { DriveStep } from 'driver.js';

// Tour for /studio/promise (F-13). The boundary this copy must hold: the Promise Calendar
// owns obligations promised to PAYING FANS (tier benefits with a cadence), not general
// to-dos and not Revenue Ramp growth steps. Missing one costs real trust with real payers.
export const promiseCalendarTourSteps: DriveStep[] = [
  {
    element: '[data-tour="promise-root"]',
    popover: {
      title: 'Only promises to paying fans live here',
      description:
        'Every entry comes from a benefit you sold: the monthly vault unlock, the quarterly listening event, a VIP welcome. This is not a to-do list. It is the work your members are already paying you for.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    popover: {
      title: 'One promise, even when three tiers include it',
      description:
        'The same benefit on several tiers is ONE obligation, and a higher tier inherits what lower tiers are owed. You fulfill it once and everyone entitled to it is covered and notified.',
      side: 'top',
      align: 'center',
    },
  },
  {
    popover: {
      title: 'A missed promise is a canceling fan',
      description:
        'Fans rarely complain first, they just leave. Deliver from here and CRWN records the fulfillment, reminds you before due dates, and keeps your word visible to the members who paid for it.',
      side: 'top',
      align: 'center',
    },
  },
];
