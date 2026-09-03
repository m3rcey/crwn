import {
  User, CreditCard, Crown, Music, Store, Target, Mail, Share2,
  BarChart3, MessageCircle, Map, Calendar,
} from 'lucide-react';

export interface GuideStep {
  title: string;
  content: string;
  tip?: string;
}

export interface GuideData {
  slug: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  category: string;
  estimatedTime: string;
  steps: GuideStep[];
  proTips: string[];
  nextGuide: { slug: string; title: string } | null;
  prevGuide: { slug: string; title: string } | null;
}

export const guides: GuideData[] = [
  // ─── 1. Profile & Branding ───
  {
    slug: 'profile-setup',
    icon: User,
    title: 'Profile & Branding',
    subtitle: 'Set up your artist identity and make a killer first impression',
    category: 'Getting Set Up',
    estimatedTime: '10 min',
    steps: [
      {
        title: 'Choose your artist name',
        content: 'Open the menu (top left), choose Your artist page under Your business, and edit your display name there. This is the name fans see everywhere: on your page, in search results, and in their library. Keep it consistent with your brand across other platforms. Your URL will be thecrwn.app/yourname based on the slug auto-generated from your display name.',
        tip: 'Your slug (URL name) is set when you first create your account. If you need to change it, update it in your artist profile settings before sharing links.',
      },
      {
        title: 'Upload a profile photo',
        content: 'Tap your avatar to upload a profile photo. Use a high-quality image (at least 400x400 pixels). This appears as a circle everywhere on the platform: in search results, subscriber lists, and community posts. A professional, recognizable photo builds trust and increases subscription rates.',
        tip: 'Use the same profile photo across CRWN, Instagram, Spotify, and Twitter so fans instantly recognize you.',
      },
      {
        title: 'Add a banner image',
        content: 'Your banner is the large image at the top of your artist page. It should be at least 1200x400 pixels. This is prime real estate: use it to showcase your latest release, upcoming event, or brand aesthetic. You can update it any time from Your artist page in the menu.',
        tip: 'Change your banner seasonally or when you drop new music. It signals to returning fans that you are active and there is something new.',
      },
      {
        title: 'Write your bio',
        content: 'Your bio appears on your public artist page. Keep it concise but compelling: 2-3 sentences max. Lead with what makes you unique, mention your genre, and include a call to action. Think of it as your elevator pitch to a potential fan who has never heard your music.',
        tip: 'End your bio with something actionable: "Subscribe for unreleased tracks every week" or "Join Gold for the full vault."',
      },
      {
        title: 'Set your location and genres',
        content: 'Add your city and state and select your genres. These appear on your public page, so a visitor who arrives from a link can place you immediately. Treat them as profile facts rather than a discovery engine: CRWN does not push your page to fans who have never heard of you, which is exactly why every guide here is about converting the audience you already have.',
        tip: 'Select 2-3 genres max. Being specific (e.g., "Neo-Soul" vs "R&B") tells a new visitor what they are about to hear before they press play.',
      },
      {
        title: 'Preview your public page',
        content: 'Before sharing your page anywhere, visit thecrwn.app/yourslug to see exactly what fans see. Check that your photo, banner, bio, and tiers all look right. This is the page you will share on social media, in your email signature, and everywhere else.',
      },
    ],
    proTips: [
      'Complete 100% of your profile before promoting your page: incomplete profiles convert 60% fewer visitors.',
      'Use consistent branding colors and imagery across your banner, profile photo, and social media.',
      'Update your bio whenever you release new music or hit a milestone.',
      'Your artist page is your storefront. Treat it like a landing page, not a social media bio.',
    ],
    nextGuide: { slug: 'stripe-payments', title: 'Stripe & Payments' },
    prevGuide: null,
  },

  // ─── 2. Stripe & Payments ───
  {
    slug: 'stripe-payments',
    icon: CreditCard,
    title: 'Stripe & Payments',
    subtitle: 'Connect your payment system and start earning from day one',
    category: 'Getting Set Up',
    estimatedTime: '5 min',
    steps: [
      {
        title: 'Connect your Stripe account',
        content: 'Open the menu (top left) and choose Payouts and tax under Your business, then tap "Connect Stripe." You will be redirected to Stripe to create or link an account. This takes about 5 minutes. You will need your bank details and basic identity info. Stripe handles all payment processing, fraud protection, and compliance.',
        tip: 'You can use an existing Stripe account if you have one. CRWN creates a "connected account" relationship, not a new account.',
      },
      {
        title: 'Understand platform fees',
        content: 'CRWN charges a platform fee on every transaction. The fee depends on your plan: Launch (free) is 12%, Pro ($49/mo) is 8%, Scale ($199/mo) is 5%. Stripe also charges their standard processing fee (~2.9% + $0.30) on top.',
        tip: 'Pro cuts the fee by 4 points, so it pays for itself at about $1,225/month in sales. Earn more than that on Launch and the difference is money you are handing back every month.',
      },
      {
        title: 'Set up your payout schedule',
        content: 'Stripe sends payouts to your bank account automatically and for free, on a rolling schedule (roughly daily, after a short holding period on each payment). There is no fixed payout day to wait for. You can also use instant cashout any time for a flat $2 fee. Payouts include all subscription revenue, shop sales, and tips that have finished clearing.',
      },
      {
        title: 'Monitor your earnings',
        content: 'Open the menu (top left) and choose Analytics. It shows total earnings, MRR (monthly recurring revenue), average revenue per subscriber, and transaction history. Stripe also has its own dashboard at dashboard.stripe.com for detailed financial reports.',
        tip: 'Check Analytics weekly. Understanding which tiers and products drive the most revenue lets you double down on what works.',
      },
      {
        title: 'Handle refunds and disputes',
        content: 'If a fan requests a refund, Stripe handles the process. You will see any disputes in your Stripe dashboard. Respond promptly with evidence to avoid chargebacks. CRWN automatically cancels the subscription if a refund is issued.',
      },
    ],
    proTips: [
      'Enable Stripe notifications so you get an alert every time you earn money, it is motivating.',
      'Save a percentage of every payout for taxes. As a creator, you are responsible for self-employment tax.',
      'If you plan to offer products in multiple currencies, Stripe handles conversion automatically.',
      'Upgrading to Pro drops your platform fee from 12% to 8%. Above about $1,225/month in sales, Pro costs you less than staying on Launch: on $3,000/month the 4-point cut is $120 back against the $49 plan.',
    ],
    nextGuide: { slug: 'subscription-tiers', title: 'Subscription Tiers' },
    prevGuide: { slug: 'profile-setup', title: 'Profile & Branding' },
  },

  // ─── 3. Subscription Tiers ───
  {
    slug: 'subscription-tiers',
    icon: Crown,
    title: 'Subscription Tiers',
    subtitle: 'Design tier structure that converts listeners into paying fans',
    category: 'Getting Set Up',
    estimatedTime: '15 min',
    steps: [
      {
        title: 'Plan your tier structure',
        content: 'CRWN recommends a four-rung ladder, and every plan can build all of it: Bronze (free, the front door), Silver ($10/mo), Gold ($25/mo) and Platinum ($100/mo). Each rung should feel like a clear step up. The free rung is not a giveaway, it is how a fan lands on a list you own before you ever ask them for money.',
        tip: 'You can rename any rung and change any price. The recommended numbers are a starting point most artists ship as-is, not a rule.',
      },
      {
        title: 'Create your tiers',
        content: 'Open the menu (top left) and choose Fan tiers and pricing under Your business. Tap "Create Tier," give each one a name fans instantly rank, and set a monthly price. Annual pricing defaults to 25% off the monthly rate; you can change that discount per tier or switch annual off entirely. Add a clear description of what fans get.',
      },
      {
        title: 'Assign benefits to each tier',
        content: 'Benefits come from the benefit catalog. Common benefits include: exclusive tracks, early releases, behind-the-scenes content, private community access, 1-on-1 sessions, merchandise discounts, and shoutouts. Assign benefits that escalate in value with each tier.',
        tip: 'Your mid-tier should have the best value-to-price ratio. This is where most of your revenue will come from.',
      },
      {
        title: 'Gate your content by tier',
        content: 'When you upload a track you pick one of three content classes: Free forever, Members first (public later), or Members only. Keep 2-3 tracks Free forever: those are the hooks that convince a listener to subscribe. Put your best new work on Members first so paying fans genuinely hear it before everyone else.',
      },
      {
        title: 'Set up annual pricing',
        content: 'Annual subscriptions default to 25% off the monthly rate, and you can set that discount anywhere from 0 to 50 per tier or turn annual off for a tier. A fan who subscribes annually cannot churn mid-year, so the retention is structural rather than earned. Promote annual plans in your messaging to increase lifetime value.',
        tip: 'Highlight the savings prominently: "Save $30/year with annual" converts much better than just showing the annual price.',
      },
      {
        title: 'Review and optimize',
        content: 'After your first month, open Analytics from the menu. Which tier has the most subscribers? What is your average revenue per subscriber? If most fans cluster at your cheapest tier, consider adding a benefit to mid-tier that creates more urgency to upgrade.',
      },
    ],
    proTips: [
      'The most common mistake is pricing too low. Your superfans will pay more than you think. Do not leave money on the table.',
      'Update your tier benefits quarterly. Adding fresh perks keeps retention high and gives you an excuse to email fans.',
      'Create a "tier upgrade" post once a month showcasing what higher-tier fans are getting.',
      'Use limited-time tier benefits (e.g., "first 10 subscribers to Silver get a signed vinyl") to drive urgency.',
    ],
    nextGuide: { slug: 'uploading-music', title: 'Uploading Music' },
    prevGuide: { slug: 'stripe-payments', title: 'Stripe & Payments' },
  },

  // ─── 4. Uploading Music ───
  {
    slug: 'uploading-music',
    icon: Music,
    title: 'Uploading Music',
    subtitle: 'Add your catalog, organize by albums, and gate content for subscribers',
    category: 'Getting Set Up',
    estimatedTime: '10 min',
    steps: [
      {
        title: 'Upload your first track',
        content: 'Go to Studio > Music and tap "Upload Track." Select an audio file (MP3 or WAV, up to 100MB). Add the track title, and optionally set a cover image. The upload processes in the background. You will see a progress indicator.',
        tip: 'WAV files sound better but are larger. For streaming, 320kbps MP3 is indistinguishable from WAV for most listeners.',
      },
      {
        title: 'Pick a content class',
        content: 'Every track gets exactly one of three classes, and that single choice sets everything else. Free forever: anyone can play it, your front door. Members first, public later: members hear it now and it opens to everyone when the window ends, your release-week advantage. Members only: it stays in the archive for paying members and never opens up, which is the reason to stay subscribed. You can also set a one-time purchase price for fans who do not want to subscribe.',
        tip: 'Keep 2-3 of your best tracks Free forever. Those are the songs that convert listeners into subscribers, so do not lock all of them.',
      },
      {
        title: 'Create albums',
        content: 'Albums group tracks together. Go to Studio > Albums and create a new album. Add a cover image, title, and description, then add tracks and drag them into the order you want. Each track keeps its own content class.',
      },
      {
        title: 'Organize your catalog',
        content: 'As your catalog grows, keep it organized. Use albums for official releases and individual tracks for loosies, freestyles, and one-offs. Consider creating a "Greatest Hits" or "Start Here" album that showcases your best work for new visitors.',
        tip: 'Pin your best content to the top of your page. First impressions matter, so make sure new visitors hear your strongest tracks first.',
      },
      {
        title: 'Update release strategy',
        content: 'Consistency beats volume. Dropping one track per week keeps fans engaged without overwhelming them. Use the Members first class to give paying fans a real head start, and CRWN opens the track to everyone automatically when the window ends. There is nothing to remember to flip.',
      },
    ],
    proTips: [
      'Release exclusive tracks on the same day each week. Fans will look forward to "New Music Fridays" or whatever day you pick.',
      'Use your free tracks as a funnel: end each free track with a spoken tag like "Subscribe for the full tape."',
      'Subscriber-exclusive tracks do not need to be polished albums. Demos, freestyles, and behind-the-scenes recordings feel more intimate and valuable.',
      'Upload cover art for every track. Tracks without art look incomplete and get fewer plays.',
    ],
    nextGuide: { slug: 'shop-products', title: 'Shop & Products' },
    prevGuide: { slug: 'subscription-tiers', title: 'Subscription Tiers' },
  },

  // ─── 5. Shop & Products ───
  {
    slug: 'shop-products',
    icon: Store,
    title: 'Shop & Products',
    subtitle: 'Sell digital downloads, beat packs, physical items, and experiences',
    category: 'Growing Your Business',
    estimatedTime: '15 min',
    steps: [
      {
        title: 'Understand product types',
        content: 'Your shop sells four product types: digital downloads (beat packs, sample kits, stems, presets), physical items you ship yourself, experiences (listening parties, meet-and-greets, sessions), and bundles that group several of the above. Each type has different setup options.',
      },
      {
        title: 'Create your first product',
        content: 'Go to Studio > Shop and tap "Add Product." Set a name, description, price (in dollars, it converts to cents), and upload a cover image. For digital downloads, upload the file that buyers will receive. Set access: free for all, or exclusive to specific tiers.',
        tip: 'Price digital products at $5-25 for broad appeal. Premium experiences ($50-200) work best for established artists with engaged fanbases.',
      },
      {
        title: 'Use scarcity and urgency',
        content: 'Set quantity limits and expiration dates to create urgency. "Only 10 available" or "Available until Friday" drives faster purchasing decisions. Limited edition drops consistently outperform unlimited products in conversion rate.',
      },
      {
        title: 'Sell your time as an experience',
        content: 'An experience product is how you sell access to you: a production review, a songwriting session, a listening party, a video call. Fans purchase it and you coordinate the session directly. Common price points: 30-minute production review ($75), 1-hour songwriting session ($150), 15-minute video call ($25). Use the description to set expectations, because you are selling a promise rather than a file.',
        tip: 'Start with 2-3 slots per month. Scarcity makes each one feel more valuable, and it protects the time you need for music.',
      },
      {
        title: 'Promote your shop',
        content: 'Post about new products on your artist page. Create tier-exclusive discounts (e.g., "Silver members get 20% off all beat packs"). Share product links directly: every product has its own URL, so it works in a bio, a story, or an email.',
      },
      {
        title: 'Analyze product performance',
        content: 'Open Analytics from the menu to see which products sell best. Double down on what works. If beat packs outsell sample kits 5:1, make more beat packs. If 1-on-1 sessions have a waiting list, raise the price.',
      },
    ],
    proTips: [
      'Bundle products for higher perceived value: "The Producer Pack" (5 beats + stems + sample kit) at a bundle discount.',
      'Offer a free product as a lead magnet: a free beat or sample pack in exchange for subscribing to your free tier.',
      'Update your shop monthly with fresh inventory. A stale shop with old products signals inactivity.',
      'Cross-promote: mention your shop products in your posts, and mention member-only content on product pages.',
      'Price in round numbers ($10, $25, $50) for cleaner purchase decisions.',
    ],
    nextGuide: { slug: 'fan-funnel', title: 'Fan Funnel & Acquisition' },
    prevGuide: { slug: 'uploading-music', title: 'Uploading Music' },
  },

  // ─── 6. Fan Funnel & Acquisition ───
  {
    slug: 'fan-funnel',
    icon: Target,
    title: 'Fan Funnel & Acquisition',
    subtitle: 'Understand the journey from first click to paying subscriber',
    category: 'Growing Your Business',
    estimatedTime: '20 min',
    steps: [
      {
        title: 'Understand the funnel stages',
        content: 'Every fan goes through stages: Discovery (they find your page) > First Listen (they play a free track) > Sign Up (they create an account) > Subscribe (they pay for a tier) > Retain (they stay month after month) > Refer (they share your page). Your job is to optimize each transition.',
      },
      {
        title: 'Source attribution',
        content: 'CRWN tracks where your fans come from: direct visits, fan referral links, and any link you tag yourself. Add campaign tags to the links you post on each platform and CRWN keeps them attached to that visitor all the way through signup, so you can tell which post actually produced a paying member rather than guessing from view counts.',
        tip: 'Tag the links you share on different platforms so Instagram traffic is distinguishable from everything else. An untagged link still works, it just cannot tell you anything afterwards.',
      },
      {
        title: 'Optimize discovery-to-listen',
        content: 'A visitor lands on your page and has 3 seconds to decide if they will stay. Your banner, profile photo, and bio do the heavy lifting. A free track that auto-plays or is prominently displayed increases listen rates dramatically. Make sure your best music is impossible to miss.',
      },
      {
        title: 'Optimize listen-to-signup',
        content: 'After someone listens and likes what they hear, they need a reason to create an account. Free-tier benefits (saving songs, creating playlists, community access) are the hook. Make it clear what they gain by signing up, even before they pay.',
        tip: 'Add a call-to-action after every free track: "Want to hear the full album? Sign up for free."',
      },
      {
        title: 'Optimize signup-to-subscribe',
        content: 'This is the money step. New signups should immediately see your ladder with clear value at each rung. Discount codes let you run a time-limited offer without repricing a tier. Your Silver rung should feel like an obvious yes, because it is the rung most first payments land on.',
      },
      {
        title: 'Track milestones',
        content: 'CRWN records the milestones in each fan\'s journey: account created, first listen, first like, first subscription, first purchase. Use them to find the stage where people stop, and fix that stage before touching anything downstream of it.',
      },
      {
        title: 'Reduce churn',
        content: 'Retention is where the money is. A member who stays 12 months is worth 12x a one-month member. Post consistently, drop member-only content regularly, and answer people. The promise you made when they subscribed is the thing to protect: the Promise Calendar (in the menu) tracks every benefit you owe and when it is due, and an overdue promise to a paying member outranks everything else CRWN could suggest.',
        tip: 'Send a personal message to fans who have been subscribed for 3+ months. A "thank you for your support" goes a long way.',
      },
    ],
    proTips: [
      'Your funnel is only as strong as its weakest link. If you get lots of visits but few listens, fix your page. If you get lots of signups but few members, fix what the paid rungs actually give. Rise Mode names the single weakest link for you rather than making you rank them yourself.',
      'Run funnel analysis monthly. Small improvements at each stage compound dramatically over time.',
      'Partner with other CRWN artists to cross-promote. A recommendation from another artist converts at 3x the rate of cold traffic.',
      'Use Analytics (in the menu) to compare week-over-week conversion at each stage.',
    ],
    nextGuide: { slug: 'email-campaigns', title: 'Email Campaigns' },
    prevGuide: { slug: 'shop-products', title: 'Shop & Products' },
  },

  // ─── 7. Email Campaigns ───
  {
    slug: 'email-campaigns',
    icon: Mail,
    title: 'Email Campaigns',
    subtitle: 'Reach your fans in an inbox you own, not a feed someone else ranks',
    category: 'Growing Your Business',
    estimatedTime: '15 min',
    steps: [
      {
        title: 'Understand your audience segments',
        content: 'Not all fans are the same. CRWN lets you send to your members, to a specific tier, or to contacts you imported yourself. Sending the right message to the right segment lifts open rates and conversions, and it stops free-tier fans getting mail that only makes sense to someone already paying.',
      },
      {
        title: 'Craft your first campaign',
        content: 'Open the menu (top left) and choose Fan CRM, then switch to Campaigns. Write your email, pick the audience, and send to a small test group before the full list. Email blasts are metered by plan: Launch includes 1 a month, Pro 20, Scale 100. A draft costs nothing, only a send spends the quota.',
        tip: 'Write subject lines like you are messaging a friend, not writing a press release. "dropped something special for you" outperforms "New Release Announcement" every time.',
      },
      {
        title: 'Build a campaign calendar',
        content: 'Plan your outreach in advance: new music drops, member-only previews, limited-time offers, milestone celebrations, and personal updates. Most of that cadence belongs in posts and notifications, which are unmetered. Save the email blasts for the moments that are genuinely worth an inbox.',
      },
      {
        title: 'Segment by tier for maximum impact',
        content: 'Send different messages to different rungs. Bronze fans get "here is what you are missing" teasers. Silver and Gold get member-only previews. Platinum gets a personal message. Personalization drives higher engagement at every level, and it is the whole argument for a ladder instead of one price.',
      },
      {
        title: 'A/B test your messaging',
        content: 'Try different approaches: urgency ("only 24 hours left"), exclusivity ("just for Silver"), personal ("I made this track thinking about..."), and value ("3 new tracks this week"). Send to the test group first so a subject line you are unsure about does not cost you a monthly send.',
        tip: 'The single highest-converting email type is "I just uploaded something that is not available anywhere else." Exclusivity wins.',
      },
      {
        title: 'Re-engage inactive fans',
        content: 'Fans who have not engaged in 30+ days are at risk of churning. Send them a personal update, a free track, or a reminder of what they are missing. Fan CRM is where you find them: it holds the fan list you own, and unlike a follower count it does not disappear when a platform changes its mind.',
      },
    ],
    proTips: [
      'Never send more than one notification per day. CRWN rate-limits broadcasts for exactly this reason: a muted fan is a lost fan.',
      'Use posts for updates and conversations, notifications for drops, and a metered email blast only when it is worth one of your monthly sends.',
      'Personalize when possible. "Hey Jordan, just dropped something I think you will love" converts 4x better than generic blasts.',
      'Watch your click-through rates. If they are dropping, the problem is the offer, not the send time.',
      'CRWN does not send SMS. Everything here is email, in-app notifications, and posts on your own page.',
    ],
    nextGuide: { slug: 'referral-program', title: 'Fan Referral Program' },
    prevGuide: { slug: 'fan-funnel', title: 'Fan Funnel & Acquisition' },
  },

  // ─── 8. Fan Referral Program ───
  {
    slug: 'referral-program',
    icon: Share2,
    title: 'Fan Referral Program',
    subtitle: 'Turn your biggest fans into your most effective marketing team',
    category: 'Growing Your Business',
    estimatedTime: '10 min',
    steps: [
      {
        title: 'Understand how referrals work',
        content: 'Every subscribed fan can generate a referral link from any page: your artist page, a track, or the shop. When someone subscribes through that link the referrer earns a recurring commission on every payment for as long as that member stays. Your commission rate starts at 0, which means the program does nothing until you set it. That is the single most common reason an artist thinks referrals are not working.',
      },
      {
        title: 'Set your commission rate',
        content: 'Open the menu (top left) and choose Referrals and clippers under Your business, then set your commission percentage. It is 0 until you change it. Higher rates motivate more sharing but reduce your revenue per member. Start at 15%: high enough to motivate fans without cutting too deeply into your earnings.',
        tip: 'A 15% commission on a $25/month Gold membership means the referrer earns $3.75 a month for as long as that member stays. That compounds, which is what makes it worth sharing more than once.',
      },
      {
        title: 'Promote the referral program',
        content: 'Most fans do not know they can earn commissions. Post about it, mention it in your bio, and remind people regularly. Let them know any link works, not just your page. Write one "How to Earn" post that explains exactly how to share and what they get, then link back to it.',
      },
      {
        title: 'Identify and reward top referrers',
        content: 'Referrals and clippers shows which fans bring in the most new members. Your top referrers are your most valuable fans. Give them extra attention, member-only content, or public recognition. A shoutout goes a long way.',
        tip: 'Consider creating a private group or special benefits for fans who refer 5+ subscribers. Gamify it.',
      },
      {
        title: 'Track referral performance',
        content: 'Referrals and clippers shows total referrals, conversion from click to subscription, revenue generated, and who your top referrers are. Use it to find what is working before you change anything.',
      },
    ],
    proTips: [
      'The best referrers are fans who genuinely love your music. Focus on creating incredible content and the referrals follow naturally.',
      'Give fans something to share: an exclusive snippet, a compelling story, a behind-the-scenes video. People share content, not links.',
      'Referral commissions are paid from your revenue. Think of it as a marketing cost that only triggers when it actually works.',
      'Fans can cash out once they reach $25. Make sure they know this, it makes the program feel real.',
    ],
    nextGuide: { slug: 'analytics-insights', title: 'Analytics & Insights' },
    prevGuide: { slug: 'email-campaigns', title: 'Email Campaigns' },
  },

  // ─── 9. Analytics & Insights ───
  {
    slug: 'analytics-insights',
    icon: BarChart3,
    title: 'Analytics & Insights',
    subtitle: 'Your command center for understanding fans, revenue, and growth',
    category: 'Mastering the Platform',
    estimatedTime: '15 min',
    steps: [
      {
        title: 'Navigate your analytics dashboard',
        content: 'Open the menu (top left) and choose Analytics. It is organized into sections: Revenue (MRR, total earnings, ARPS), Subscribers (total, new, churned, net growth), Content (plays, likes, top tracks), and Fans (top supporters, engagement). Every number there is a real count from your own account, never a projection.',
      },
      {
        title: 'Understand MRR (Monthly Recurring Revenue)',
        content: 'MRR is the total monthly revenue from active subscriptions. It is your most important metric: it tells you exactly how much you are earning each month from subscriptions alone. Track MRR week over week to see if you are growing, flat, or declining.',
        tip: 'If your MRR is growing but slowing down, it usually means churn is catching up. Focus on retention before acquisition.',
      },
      {
        title: 'Track subscriber growth',
        content: 'Net subscriber growth = new subscribers minus churned subscribers. If net growth is positive, you are building momentum. If it is negative, you are losing fans faster than you are gaining them. Dig into why fans are leaving. Is it pricing, content quality, or engagement?',
      },
      {
        title: 'Analyze content performance',
        content: 'See which tracks get the most plays, which posts get the most engagement, and which products sell best. Use it to inform what you make next. If acoustic tracks outperform produced beats 3:1, make more acoustic content.',
      },
      {
        title: 'Identify your top fans',
        content: 'Analytics and Fan CRM together surface your highest-value fans: longest members, most plays, highest spend, most referrals. These are your core. Engage with them personally, ask for feedback, and give them a real head start on new releases.',
        tip: 'Your top 10% of fans likely generate 40-50% of your revenue. Know who they are and treat them accordingly.',
      },
      {
        title: 'Monitor churn and retention',
        content: 'Churn rate is the percentage of subscribers who cancel each month. Healthy churn is under 5%. If yours is higher, investigate: Are fans canceling after a specific number of months? After a price increase? During content dry spells? The pattern reveals the fix.',
      },
      {
        title: 'Use insights to take action',
        content: 'Analytics are only useful if they change your behavior. Set a weekly ritual: open Analytics, identify one thing to improve, and act on it. If you would rather not rank the options yourself, Rise Mode already names the single move that matters most right now.',
      },
    ],
    proTips: [
      'Rise Mode resolves your numbers into one next move, so you do not have to interpret a dashboard to know what to do.',
      'Compare month-over-month, not day-over-day. Daily fluctuations are noise: monthly trends are signal.',
      'The most actionable metric is ARPS (average revenue per subscriber). If ARPS is rising, your tier structure and upselling are working.',
      'Keep your own record of MRR, members and churn over time. Owning the history is the point of owning the audience.',
    ],
    nextGuide: { slug: 'community-posts', title: 'Community & Posts' },
    prevGuide: { slug: 'referral-program', title: 'Fan Referral Program' },
  },

  // ─── 10. Community & Posts ───
  {
    slug: 'community-posts',
    icon: MessageCircle,
    title: 'Community & Posts',
    subtitle: 'Build a real fan community with engaging content and tier-gated drops',
    category: 'Mastering the Platform',
    estimatedTime: '10 min',
    steps: [
      {
        title: 'Understand the community feed',
        content: 'Your artist page carries a feed for your fans. Post updates, photos, videos and behind-the-scenes content. Fans can like, comment and reply. Unlike social media, you own this audience: no algorithm decides who sees your posts, and nobody can take the list away from you.',
      },
      {
        title: 'Create your first post',
        content: 'Open your own artist page (thecrwn.app/yourslug) and use the composer at the top of the feed. Write your message, attach media if you want, and select which tiers can see it. Public posts are visible to everyone; tier-gated posts are exclusive to members at that rung or higher.',
        tip: 'Your first post should introduce yourself and set expectations: "Welcome! Here is what to expect from this community."',
      },
      {
        title: 'Develop a posting cadence',
        content: 'Post 3-5 times per week. Mix content types: music updates (2x), behind-the-scenes (1x), personal updates (1x), and engagement posts like polls or questions (1x). Consistency matters more than perfection.',
      },
      {
        title: 'Gate content strategically',
        content: 'Not everything should be gated. Public posts attract new fans. Bronze posts reward a signup. Paid-rung posts justify the payment. Use the pyramid: 40% public, 30% Bronze, 30% paid rungs, with the most exclusive content on your highest rung.',
        tip: 'Post a blurred preview of exclusive content publicly with "Subscribe to see the full video." This teases the value without giving it away.',
      },
      {
        title: 'Engage with your fans',
        content: 'Reply to comments, like fan messages, and ask questions. Fans who feel personally connected to you stay subscribed longer. Even a simple heart reaction on a comment shows fans you are present and engaged.',
      },
      {
        title: 'Share photos and videos',
        content: 'Visual content gets 3x more engagement than text-only posts. Share studio photos, snippets of works in progress, reaction videos, and day-in-the-life content. Keep videos under 60 seconds for maximum watch-through rates.',
      },
    ],
    proTips: [
      'The #1 reason fans unsubscribe is feeling like they are not getting enough value. Regular posts fix that.',
      'Behind-the-scenes content performs surprisingly well. Fans want to feel like insiders, not just consumers.',
      'Ask fans what they want to see. A simple "What should I post more of?" poll gives you a content roadmap.',
      'Keep your most important announcement at the top of your feed by posting it when your fans are most likely to look.',
      'Cross-post your best public content to Instagram, Twitter or TikTok with a tagged link back to your CRWN page, so you can tell afterwards which platform actually sent you members.',
    ],
    nextGuide: { slug: 'growth-roadmap', title: 'Growth Roadmap' },
    prevGuide: { slug: 'analytics-insights', title: 'Analytics & Insights' },
  },

  // ─── 11. Growth Roadmap ───
  {
    slug: 'growth-roadmap',
    icon: Map,
    title: 'Growth Roadmap',
    subtitle: 'A month-by-month plan from 0 to 1,000 subscribers',
    category: 'Scaling & Strategy',
    estimatedTime: '20 min',
    steps: [
      {
        title: 'Month 1: Foundation (0-10 subscribers)',
        content: 'Complete your profile. Connect Stripe. Upload at least 5 tracks (3 Free forever, 2 Members only). Build the ladder: Bronze free, then Silver, Gold and Platinum. Write your first 5 posts. Share your CRWN page with the audience you already have. Your goal is 10 members from people who already know your music.',
        tip: 'Do not try to go viral in month 1. Convert your existing audience first. They are the easiest subscribers to get.',
      },
      {
        title: 'Month 2: Consistency (10-30 subscribers)',
        content: 'Post 4-5 times per week. Upload 1 new track weekly. Share behind-the-scenes content. Set your referral commission to 15% (it starts at 0 and does nothing until you do). Ask your first 10 members to share your page. Check Analytics weekly. Goal: triple your member count through consistency and word of mouth.',
      },
      {
        title: 'Month 3: Activation (30-75 subscribers)',
        content: 'Launch your first shop product (beat pack or digital download). Run a limited-time discount code for new members. Post a milestone celebrating 50 fans. Personally thank your top 5 referrers. Goal: 75 members.',
        tip: 'This is the phase where most artists quit. Push through. The compound effect is about to kick in.',
      },
      {
        title: 'Month 4-6: Momentum (75-250 subscribers)',
        content: 'Fix the funnel stage Rise Mode is naming. Create a monthly member-only drop cadence. Run a campaign for inactive fans. Test different content types and double down on what works. Above roughly $1,225 a month in sales, Pro costs you less than Launch, so check the maths. Goal: 250 members.',
      },
      {
        title: 'Month 7-9: Scale (250-500 subscribers)',
        content: 'Your referral network should be producing growth on its own. Focus on retention: keep the promises on your calendar, keep content fresh, and act on churn. Launch a premium product or experience. Goal: 500 members.',
      },
      {
        title: 'Month 10-12: Authority (500-1,000 subscribers)',
        content: 'At this stage you have a real fan business. Tune your ladder for ARPS rather than headcount. Platinum is where your superfans already are, so price it like it. Goal: 1,000 members generating $5,000-10,000 a month in MRR.',
        tip: 'At 1,000 subscribers, you are earning more than 99% of independent artists. This is a sustainable career.',
      },
      {
        title: 'Beyond 1,000: Scale and diversify',
        content: 'With a strong member base, explore: live experiences for your fans, ticketed sessions, deeper vault drops, and collaboration projects. The platform grows with you.',
      },
    ],
    proTips: [
      'This roadmap assumes consistent effort. Skipping weeks of posting or uploading resets your momentum.',
      'Every artist grows at a different pace. These numbers are targets, not requirements. Focus on the activities, not just the subscriber count.',
      'The hardest stretch is 0-50 members. After 50, referrals and word of mouth start compounding.',
      'Review this roadmap monthly and adjust based on your actual data. Your path will look different from anyone else\'s.',
      'The artists who succeed are not the most talented: they are the most consistent.',
    ],
    nextGuide: { slug: 'content-calendar', title: 'Content Calendar' },
    prevGuide: { slug: 'community-posts', title: 'Community & Posts' },
  },

  // ─── 12. Content Calendar ───
  {
    slug: 'content-calendar',
    icon: Calendar,
    title: 'Content Calendar',
    subtitle: 'Plan your releases, posts, and campaigns for maximum impact',
    category: 'Scaling & Strategy',
    estimatedTime: '15 min',
    steps: [
      {
        title: 'Why you need a content calendar',
        content: 'Random posting leads to inconsistency, and inconsistency kills retention. A content calendar keeps you posting regularly, mixing content types, and never staring at a blank screen. Note the difference between this and the Promise Calendar in the menu: this one is your plan, that one is what you already owe paying members.',
      },
      {
        title: 'Set your weekly cadence',
        content: 'Plan your week: Monday (music update or new track), Wednesday (behind-the-scenes or personal update), Friday (member-only content), and the weekend (an engagement post: a question or a fan shoutout). Start with 3-4 posts per week and scale up once it is a habit.',
        tip: 'Batch your content creation. Spend 2-3 hours on Sunday creating all your posts for the week. This is far more efficient than creating daily.',
      },
      {
        title: 'Plan your monthly releases',
        content: 'Map out your month: Week 1 (new track release plus announcement), Week 2 (behind-the-scenes of the process), Week 3 (member-only drop), Week 4 (engagement plus a preview of next month). If a rung promises something monthly, that Week 3 drop IS the promise, so put it on the Promise Calendar too.',
      },
      {
        title: 'Align campaigns with releases',
        content: 'When you drop new music, coordinate: tease it 3 days before, announce it on the day, share behind-the-scenes the day after, and notify fans 2 days later. Multi-touch beats a single announcement every time.',
      },
      {
        title: 'Seasonal and event planning',
        content: 'Plan content around seasons, holidays, and your personal milestones. A year-end "Best Of" playlist, a birthday exclusive drop, or a summer EP gives you natural content hooks. Mark these dates on your calendar months in advance.',
      },
      {
        title: 'Track what works and iterate',
        content: 'After each month, open Analytics: which posts got the most engagement, which tracks got the most plays, which campaigns drove the most memberships? Adjust the calendar on the data, not on how a week felt.',
        tip: 'Keep a simple spreadsheet: date, content type, engagement metrics. After 3 months, clear patterns will emerge.',
      },
    ],
    proTips: [
      'Consistency beats quality for building a fan base. A good post every day beats a perfect post once a month.',
      'Repurpose content: a studio session video becomes a community post, an Instagram reel, a TikTok, and a story.',
      'Leave room for spontaneous posts. Your calendar is a guide, not a prison. If something exciting happens, share it.',
      'The best content feels authentic, not manufactured. Let your calendar structure your creativity, not constrain it.',
      'Share your content calendar with your fans: "New music every Friday, behind-the-scenes every Wednesday." Setting expectations increases engagement.',
    ],
    nextGuide: null,
    prevGuide: { slug: 'growth-roadmap', title: 'Growth Roadmap' },
  },
];

export function getGuideBySlug(slug: string): GuideData | undefined {
  return guides.find(g => g.slug === slug);
}

export function getAllGuideSlugs(): string[] {
  return guides.map(g => g.slug);
}
