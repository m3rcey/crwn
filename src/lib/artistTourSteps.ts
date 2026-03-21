import { DriveStep } from 'driver.js';

export function getArtistTourSteps(isFoundingArtist: boolean, artistSlug: string = 'yourname', platformTier: string = 'starter'): DriveStep[] {
  const isStarter = platformTier === 'starter';
  const foundingNote = isFoundingArtist
    ? ' As a Founding Artist, you have free Pro access and a reduced 5% platform fee for your first year.'
    : '';

  return [
    // 1. Welcome
    {
      popover: {
        title: 'Your artist dashboard',
        description: `This is where you manage everything. Let us walk through each step to get your page live and ready for fans.${foundingNote}`,
      },
    },

    // --- PROFILE TAB ---
    // 2. Switch to Profile tab
    {
      element: '[data-tour="tab-profile"]',
      popover: {
        title: 'Profile setup',
        description: 'Let us start with your profile. This is the foundation of your artist page.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 3. Profile: Name/Bio
    {
      element: '[data-tour="profile-basics"]',
      popover: {
        title: 'Set your name and bio',
        description: 'First, set your artist name and write a short bio. This is the first thing fans read when they find you.',
        side: 'top',
        align: 'start',
      },
    },

    // 4. Profile: Avatar/Banner
    {
      element: '[data-tour="profile-media"]',
      popover: {
        title: 'Upload your photos',
        description: 'Upload a profile photo and banner image. High quality visuals make a big difference in first impressions.',
        side: 'top',
        align: 'start',
      },
    },

    // 5. Profile: Location/Genres
    {
      element: '[data-tour="profile-location"]',
      popover: {
        title: 'Location and genres',
        description: 'Add your city, state, and genres. Once you have done that, we can match you with sync licensing opportunities near you.',
        side: 'top',
        align: 'start',
      },
    },

    // --- TIERS TAB ---
    // 6. Switch to Tiers tab
    {
      element: '[data-tour="tab-tiers"]',
      popover: {
        title: 'Subscription tiers',
        description: 'Next, set up how fans can support you. This is where you connect payments and create your subscription options.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 7. Tiers: Connect Stripe
    {
      element: '[data-tour="tiers-stripe"]',
      popover: {
        title: 'Connect Stripe',
        description: 'Connect your Stripe account here. This takes about 2 minutes and is required before fans can pay you.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 8. Tiers: Create Tiers
    {
      element: '[data-tour="tiers-list"]',
      popover: {
        title: 'Create your tiers',
        description: 'With Stripe connected, create 2 to 3 subscription tiers. A good range is $5 to $200 per month. Fans also get an annual option at 25% off automatically.',
        side: 'bottom',
        align: 'start',
      },
    },

    // --- SYNC TAB ---
    // 9. Switch to Sync tab
    {
      element: '[data-tour="tab-sync"]',
      popover: {
        title: 'Sync licensing',
        description: 'CRWN connects you with real sync licensing opportunities. Let us take a look.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 10. Sync: Opportunities
    {
      element: '[data-tour="sync-opportunities"]',
      popover: {
        title: 'Sync opportunities',
        description: `These are real sync licensing events and briefs updated regularly.${isFoundingArtist ? ' Your Pro access gives you the full list with personalized recommendations.' : ' Upgrade to Pro to unlock all opportunities.'}`,
        side: 'bottom',
        align: 'start',
      },
    },

    // --- PAYOUTS TAB ---
    // 11. Switch to Payouts tab
    {
      element: '[data-tour="tab-payouts"]',
      popover: {
        title: 'Payouts',
        description: 'Here is where you track your earnings and get paid.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 12. Payouts: Balance
    {
      element: '[data-tour="payout-balance"]',
      popover: {
        title: 'Your earnings',
        description: 'Once fans start subscribing and purchasing, your earnings show up here.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 13. Payouts: Cashout
    {
      element: '[data-tour="payout-cashout"]',
      popover: {
        title: 'Get paid',
        description: 'You get free automatic payouts every Monday. If you need cash sooner, instant cashout is available for a flat $2 fee.',
        side: 'bottom',
        align: 'start',
      },
    },

    // --- REFERRALS TAB ---
    // 14. Switch to Referrals tab
    {
      element: '[data-tour="tab-referrals"]',
      popover: {
        title: 'Fan referrals',
        description: 'Your fans can earn money by referring new subscribers to you. Here is where you manage that.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 15. Referrals: Commission Rate
    {
      element: '[data-tour="referral-commission"]',
      popover: {
        title: 'Commission rate',
        description: 'Set the commission rate your fans earn when they refer new subscribers to you. Higher rates motivate more sharing.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 16. Referrals: Referral List
    {
      element: '[data-tour="referral-list"]',
      popover: {
        title: 'Referral tracking',
        description: 'As fans share your page and bring in new subscribers, their referrals and earnings show up here.',
        side: 'bottom',
        align: 'start',
      },
    },

    // --- ANALYTICS TAB ---
    // 17. Switch to Analytics tab
    {
      element: '[data-tour="tab-analytics"]',
      popover: {
        title: 'Analytics',
        description: 'Your command center. Revenue, subscribers, plays, and fan data all in one place.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 18. Analytics: Revenue
    {
      element: '[data-tour="analytics-revenue"]',
      popover: {
        title: 'Revenue overview',
        description: 'Your MRR, monthly revenue, all-time earnings, and revenue split between subscriptions and purchases. All updated in real time.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 19. Analytics: Subscribers
    {
      element: '[data-tour="analytics-subscribers"]',
      popover: {
        title: 'Subscriber metrics',
        description: 'Active subscriber count, average revenue per fan, churn rate, and lifetime value. These numbers tell you how healthy your fan base is.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 20. Analytics: Plays
    {
      element: '[data-tour="analytics-plays"]',
      popover: {
        title: 'Play stats',
        description: 'Total plays with daily, weekly, and monthly trends. See which tracks are getting the most attention.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 21. Analytics: Top Fans
    {
      element: '[data-tour="analytics-top-fans"]',
      popover: {
        title: 'Top fans',
        description: 'Your biggest supporters ranked by spending and engagement. These are the fans to pay attention to.',
        side: 'bottom',
        align: 'start',
      },
    },

    // --- MUSIC TAB ---
    // 22. Switch to Music tab
    {
      element: '[data-tour="tab-tracks"]',
      popover: {
        title: 'Your music',
        description: 'Time to add your music. This is what fans come to hear.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 23. Music: Upload
    {
      element: '[data-tour="music-upload"]',
      popover: {
        title: 'Upload your music',
        description: 'Upload tracks here. Each track starts as free. Uncheck the free toggle to select which subscription tiers can access it. Keep at least 2 to 3 tracks free so new fans can discover your sound.',
        side: 'bottom',
        align: 'start',
      },
    },

    // --- SHOP TAB ---
    // 24. Switch to Shop tab
    {
      element: '[data-tour="tab-shop"]',
      popover: {
        title: 'Your shop',
        description: 'Sell digital products and experiences directly to your fans.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 25. Shop: Create Product
    {
      element: '[data-tour="shop-create"]',
      popover: {
        title: 'Create products',
        description: isStarter ? 'Sell digital and physical products to your fans. Upgrade to Pro for bundles, experiences, and 1-on-1 bookings.' : 'Sell digital products, physical merch, experiences, and 1-on-1 bookings. Set quantity limits and expiration dates to create urgency.',
        side: 'bottom',
        align: 'start',
      },
    },

    // --- VIEW AS FAN ---
    // 26. View as Fan
    {
      element: '[data-tour="view-as-fan"]',
      popover: {
        title: 'Preview your page',
        description: 'Your page is taking shape. Tap here to see exactly what fans see when they visit.',
        side: 'bottom',
        align: 'start',
      },
    },

    // 27. Closing
    {
      popover: {
        title: 'Almost there!',
        description: `Click "View as Fan" to see your page from a fan perspective. We will show you a few more things there.${isFoundingArtist ? ' As a Founding Artist, all your Pro features are active now. Make the most of them.' : ''}`,
      },
    },
  ];
}
