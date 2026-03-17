import { DriveStep } from 'driver.js';

export function getArtistTourSteps(isFoundingArtist: boolean): DriveStep[] {
  const foundingNote = isFoundingArtist
    ? ' As a Founding Artist, you have free Pro access, so all features are unlocked for you.'
    : '';

  return [
    // 1. Welcome
    {
      popover: {
        title: 'Your artist dashboard',
        description: `This is where you manage everything. Let's walk through each step to get your page live and ready for fans.${foundingNote}`,
      },
    },

    // 2. Profile: Name/Bio
    {
      element: '[data-tour="profile-basics"]',
      popover: {
        title: 'Set your name and bio',
        description: 'First, set your artist name and write a short bio. This is the first thing fans read when they find you.',
        side: 'right',
        align: 'start',
      },
    },

    // 3. Profile: Avatar/Banner
    {
      element: '[data-tour="profile-media"]',
      popover: {
        title: 'Upload your photos',
        description: 'Upload a profile photo and banner image. High quality visuals make a big difference in first impressions.',
        side: 'right',
        align: 'start',
      },
    },

    // 4. Profile: Location/Genres
    {
      element: '[data-tour="profile-location"]',
      popover: {
        title: 'Location and genres',
        description: 'Add your city, state, and genres. Once you have done that, we can match you with sync licensing opportunities near you.',
        side: 'right',
        align: 'start',
      },
    },

    // 5. Tiers: Connect Stripe
    {
      element: '[data-tour="tiers-stripe"]',
      popover: {
        title: 'Connect Stripe',
        description: "Now let's get you paid. Connect your Stripe account here. This takes about 2 minutes and is required before fans can pay you.",
        side: 'bottom',
        align: 'start',
      },
    },

    // 6. Tiers: Create Tiers
    {
      element: '[data-tour="tiers-list"]',
      popover: {
        title: 'Create subscription tiers',
        description: 'With Stripe connected, create 2 to 3 subscription tiers. A good range is $5 to $200 per month depending on what you offer.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 7. Sync: Opportunities
    {
      element: '[data-tour="sync-opportunities"]',
      popover: {
        title: 'Sync opportunities',
        description: `These are real sync licensing events and briefs updated regularly.${isFoundingArtist ? ' Your Pro access gives you the full list with personalized recommendations.' : ' Upgrade to Pro to unlock all opportunities.'}`,
        side: 'bottom',
        align: 'start',
      },
    },

    // 8. Payouts: Balance
    {
      element: '[data-tour="payout-balance"]',
      popover: {
        title: 'Your earnings',
        description: 'Once fans start subscribing and purchasing, your earnings show up here.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 9. Payouts: Cashout
    {
      element: '[data-tour="payout-cashout"]',
      popover: {
        title: 'Get paid',
        description: 'You get free automatic payouts every Monday. If you need cash sooner, instant cashout is available for a flat $2 fee.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 10. Referrals: Commission Rate
    {
      element: '[data-tour="referral-commission"]',
      popover: {
        title: 'Fan referral program',
        description: 'Set the commission rate your fans earn when they refer new subscribers to you. Higher rates motivate more sharing.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 11. Referrals: Referral List
    {
      element: '[data-tour="referral-list"]',
      popover: {
        title: 'Referral tracking',
        description: 'As fans share your page and bring in new subscribers, their referrals and earnings show up here.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 12. Analytics: Revenue
    {
      element: '[data-tour="analytics-revenue"]',
      popover: {
        title: 'Revenue overview',
        description: 'Your MRR, monthly revenue, all-time earnings, and revenue split between subscriptions and purchases. All updated in real time.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 13. Analytics: Subscribers
    {
      element: '[data-tour="analytics-subscribers"]',
      popover: {
        title: 'Subscriber metrics',
        description: 'Active subscriber count, average revenue per fan, churn rate, and lifetime value. These numbers tell you how healthy your fan base is.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 14. Analytics: Plays
    {
      element: '[data-tour="analytics-plays"]',
      popover: {
        title: 'Play stats',
        description: 'Total plays with daily, weekly, and monthly trends. See which tracks are getting the most attention.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 15. Analytics: Top Fans
    {
      element: '[data-tour="analytics-top-fans"]',
      popover: {
        title: 'Top fans',
        description: 'Your biggest supporters ranked by spending and engagement. These are the fans to pay attention to.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 16. Music: Upload
    {
      element: '[data-tour="music-upload"]',
      popover: {
        title: 'Upload your music',
        description: "Now let's add your music. Upload tracks and set each one as free for everyone or exclusive to specific tiers. Keep at least 2 to 3 tracks free so new fans can discover your sound.",
        side: 'bottom',
        align: 'start',
      },
    },

    // 17. Music: Track List
    {
      element: '[data-tour="music-tracklist"]',
      popover: {
        title: 'Your track list',
        description: 'Your uploaded tracks appear here. You can edit, reorder, or change access settings anytime.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 18. Shop: Create Product
    {
      element: '[data-tour="shop-create"]',
      popover: {
        title: 'Your shop',
        description: 'Sell digital products like beat packs or experiences like 1-on-1 video calls. For booking sessions, connect a free Cal.com calendar.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 19. View as Fan
    {
      element: '[data-tour="view-as-fan"]',
      popover: {
        title: 'Preview your page',
        description: 'Your page is taking shape. Tap here to see exactly what fans see when they visit.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 20. Closing
    {
      popover: {
        title: 'Almost there!',
        description: `Click "View as Fan" to see your page from a fan's perspective. We will show you a few more things there.${isFoundingArtist ? ' As a Founding Artist, all your Pro features are active now. Make the most of them.' : ''}`,
      },
    },
  ];
}
