import {
  User, CreditCard, Crown, Music, Store, Target, Mail, Share2,
  BarChart3, MessageCircle, Bot, Radio, Map, Calendar,
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
        content: 'Go to your Profile tab and tap your display name to edit it. This is the name fans see everywhere — on your page, in search results, and in their library. Keep it consistent with your brand across other platforms. Your URL will be thecrwn.app/yourname based on the slug auto-generated from your display name.',
        tip: 'Your slug (URL name) is set when you first create your account. If you need to change it, update it in your artist profile settings before sharing links.',
      },
      {
        title: 'Upload a profile photo',
        content: 'Tap your avatar to upload a profile photo. Use a high-quality image (at least 400x400 pixels). This appears as a circle everywhere on the platform — in search results, subscriber lists, and community posts. A professional, recognizable photo builds trust and increases subscription rates.',
        tip: 'Use the same profile photo across CRWN, Instagram, Spotify, and Twitter so fans instantly recognize you.',
      },
      {
        title: 'Add a banner image',
        content: 'Your banner is the large image at the top of your artist page. It should be at least 1200x400 pixels. This is prime real estate — use it to showcase your latest release, upcoming event, or brand aesthetic. You can update it any time from your Profile tab.',
        tip: 'Change your banner seasonally or when you drop new music. It signals to returning fans that you are active and there is something new.',
      },
      {
        title: 'Write your bio',
        content: 'Your bio appears on your public artist page. Keep it concise but compelling — 2-3 sentences max. Lead with what makes you unique, mention your genre, and include a call to action. Think of it as your elevator pitch to a potential fan who has never heard your music.',
        tip: 'End your bio with something actionable: "Subscribe for unreleased tracks every week" or "Join Inner Circle for 1-on-1 sessions."',
      },
      {
        title: 'Set your location and genres',
        content: 'Add your city and state and select your genres from the dropdown. Location helps us match you with local sync licensing opportunities and lets fans discover artists near them. Genres determine which categories you appear in on the Explore page.',
        tip: 'Select 2-3 genres max. Being specific (e.g., "Neo-Soul" vs "R&B") helps you stand out in less crowded categories.',
      },
      {
        title: 'Preview your public page',
        content: 'Before sharing your page anywhere, visit thecrwn.app/yourslug to see exactly what fans see. Check that your photo, banner, bio, and tiers all look right. This is the page you will share on social media, in your email signature, and everywhere else.',
      },
    ],
    proTips: [
      'Complete 100% of your profile before promoting your page — incomplete profiles convert 60% fewer visitors.',
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
        content: 'Go to Profile > Settings and tap "Connect Stripe." You will be redirected to Stripe to create or link an account. This takes about 2 minutes. You will need your bank details and basic identity info. Stripe handles all payment processing, fraud protection, and compliance.',
        tip: 'You can use an existing Stripe account if you have one. CRWN creates a "connected account" relationship, not a new account.',
      },
      {
        title: 'Understand platform fees',
        content: 'CRWN charges a platform fee on every transaction. The fee depends on your platform tier: Starter (free) is 8%, Pro ($69/mo) is 6%, Label ($175/mo) is 5%, Empire ($350/mo) is 3%. Stripe also charges their standard processing fee (~2.9% + $0.30) on top. Choose the tier that makes sense for your revenue level.',
        tip: 'If you earn more than $1,150/month, upgrading to Pro pays for itself in saved fees. Do the math for your situation.',
      },
      {
        title: 'Set up your payout schedule',
        content: 'By default, Stripe sends payouts to your bank account every Monday for free. You can also use instant cashout any time for a flat $2 fee. Payouts include all subscription revenue, shop sales, and tips accumulated since your last payout.',
      },
      {
        title: 'Monitor your earnings',
        content: 'Your Analytics tab shows real-time revenue data: total earnings, MRR (monthly recurring revenue), average revenue per subscriber, and transaction history. Stripe also has its own dashboard at dashboard.stripe.com for detailed financial reports.',
        tip: 'Check your analytics weekly. Understanding which tiers and products drive the most revenue lets you double down on what works.',
      },
      {
        title: 'Handle refunds and disputes',
        content: 'If a fan requests a refund, Stripe handles the process. You will see any disputes in your Stripe dashboard. Respond promptly with evidence to avoid chargebacks. CRWN automatically cancels the subscription if a refund is issued.',
      },
    ],
    proTips: [
      'Enable Stripe notifications so you get an alert every time you earn money — it is motivating.',
      'Save a percentage of every payout for taxes. As a creator, you are responsible for self-employment tax.',
      'If you plan to offer products in multiple currencies, Stripe handles conversion automatically.',
      'The Founding Artist program gives you 5% fees for your first year — claim your spot early.',
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
        content: 'Most successful artists use 2-3 tiers: a free entry tier to get fans in the door, a mid-tier with the best value ($15/mo), and a premium tier for superfans ($30/mo). Each tier should feel like a clear step up in value. Do not create more than 3 — too many choices causes decision paralysis.',
        tip: 'Price your entry tier low enough that it feels like a no-brainer. The goal is to get fans in the door, then upgrade them over time.',
      },
      {
        title: 'Create your tiers',
        content: 'Go to Profile > Tiers and tap "Create Tier." Give each tier a compelling name (not just "Tier 1"). Good names evoke exclusivity: "The Wave," "Inner Circle," "Throne." Set a monthly price — annual pricing is automatically calculated at 25% off. Add a clear description of what fans get.',
      },
      {
        title: 'Assign benefits to each tier',
        content: 'Benefits come from the benefit catalog. Common benefits include: exclusive tracks, early releases, behind-the-scenes content, private community access, 1-on-1 sessions, merchandise discounts, and shoutouts. Assign benefits that escalate in value with each tier.',
        tip: 'Your mid-tier should have the best value-to-price ratio. This is where most of your revenue will come from.',
      },
      {
        title: 'Gate your content by tier',
        content: 'When you upload a track or create a post, you can set which tiers can access it. Use the "Allowed Tier IDs" setting to restrict content. Keep 2-3 tracks free for discovery — these are the hooks that convince listeners to subscribe. Gate your best content behind your mid-tier.',
      },
      {
        title: 'Set up annual pricing',
        content: 'Annual subscriptions are automatically priced at 25% off the monthly rate. Fans who subscribe annually have dramatically higher retention rates (they cannot churn for a year). Promote annual plans in your messaging to increase lifetime value.',
        tip: 'Highlight the savings prominently: "Save $30/year with annual" converts much better than just showing the annual price.',
      },
      {
        title: 'Review and optimize',
        content: 'After your first month, check your analytics. Which tier has the most subscribers? What is your average revenue per subscriber? If most fans cluster at your cheapest tier, consider adding a benefit to mid-tier that creates more urgency to upgrade.',
      },
    ],
    proTips: [
      'The most common mistake is pricing too low. Your superfans will pay more than you think — do not leave money on the table.',
      'Update your tier benefits quarterly. Adding fresh perks keeps retention high and gives you an excuse to email fans.',
      'Create a "tier upgrade" post once a month showcasing what higher-tier fans are getting.',
      'Use limited-time tier benefits (e.g., "first 10 subscribers to Inner Circle get a signed vinyl") to drive urgency.',
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
        content: 'Go to Profile > Music and tap "Upload Track." Select an audio file (MP3 or WAV, max 50MB). Add the track title, and optionally set a cover image. The upload processes in the background — you will see a progress indicator.',
        tip: 'WAV files sound better but are larger. For streaming, 320kbps MP3 is indistinguishable from WAV for most listeners.',
      },
      {
        title: 'Set access levels',
        content: 'For each track, decide: is it free, or exclusive to specific tiers? Free tracks are your discovery hooks — anyone can listen. Tier-gated tracks are the reason fans subscribe. Set the "Allowed Tier IDs" to restrict access. You can also set a one-time purchase price for fans who do not want to subscribe.',
        tip: 'Keep 2-3 of your best tracks free. These are the songs that convert listeners into subscribers.',
      },
      {
        title: 'Create albums',
        content: 'Albums group tracks together. Go to Profile > Music > Albums and create a new album. Add a cover image, title, and description. Then add tracks to the album and set the track order using the track_number field. Albums can be free or gated to specific tiers.',
      },
      {
        title: 'Organize your catalog',
        content: 'As your catalog grows, keep it organized. Use albums for official releases and individual tracks for loosies, freestyles, and one-offs. Consider creating a "Greatest Hits" or "Start Here" album that showcases your best work for new visitors.',
        tip: 'Pin your best content to the top of your page. First impressions matter — make sure new visitors hear your strongest tracks first.',
      },
      {
        title: 'Update release strategy',
        content: 'Consistency beats volume. Dropping one track per week keeps fans engaged without overwhelming them. Announce releases in your community first, then share publicly after 24-48 hours of exclusivity for subscribers.',
      },
    ],
    proTips: [
      'Release exclusive tracks on the same day each week. Fans will look forward to "New Music Fridays" or whatever day you pick.',
      'Use your free tracks as a funnel — end each free track with a spoken tag like "Subscribe for the full tape."',
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
    subtitle: 'Sell digital products, beat packs, experiences, and 1-on-1 bookings',
    category: 'Growing Your Business',
    estimatedTime: '15 min',
    steps: [
      {
        title: 'Understand product types',
        content: 'Your shop can sell digital downloads (beat packs, sample kits, stems, presets), experiences (virtual meet-and-greets, listening parties), and 1-on-1 bookings (production sessions, songwriting sessions, mentoring calls). Each product type has different setup options.',
      },
      {
        title: 'Create your first product',
        content: 'Go to Profile > Shop and tap "Add Product." Set a name, description, price (in dollars — it converts to cents), and upload a cover image. For digital downloads, upload the file that buyers will receive. Set access: free for all, or exclusive to specific tiers.',
        tip: 'Price digital products at $5-25 for broad appeal. Premium experiences ($50-200) work best for established artists with engaged fanbases.',
      },
      {
        title: 'Use scarcity and urgency',
        content: 'Set quantity limits and expiration dates to create urgency. "Only 10 available" or "Available until Friday" drives faster purchasing decisions. Limited edition drops consistently outperform unlimited products in conversion rate.',
      },
      {
        title: 'Set up 1-on-1 bookings',
        content: 'Create a booking product with your available time slots. Fans purchase the booking, and you coordinate the session. Popular options: 30-minute production review ($75), 1-hour songwriting session ($150), 15-minute video call ($25). Use the description to set clear expectations.',
        tip: 'Start with just 2-3 booking slots per month. Scarcity makes each slot feel more valuable.',
      },
      {
        title: 'Promote your shop',
        content: 'Post about new products in your community. Create tier-exclusive discounts (e.g., "Inner Circle members get 20% off all beat packs"). Pin your best-selling product to the top of your shop. Share product links on social media.',
      },
      {
        title: 'Analyze product performance',
        content: 'Check your analytics to see which products sell best. Double down on what works. If beat packs outsell sample kits 5:1, make more beat packs. If 1-on-1 sessions have a waiting list, raise the price.',
      },
    ],
    proTips: [
      'Bundle products for higher perceived value: "The Producer Pack" (5 beats + stems + sample kit) at a bundle discount.',
      'Offer a free product as a lead magnet — a free beat or sample pack in exchange for subscribing to your free tier.',
      'Update your shop monthly with fresh inventory. A stale shop with old products signals inactivity.',
      'Cross-promote: mention your shop products in community posts, and mention community exclusives on product pages.',
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
        content: 'CRWN tracks where your fans come from: organic (direct visits), recruiter referrals, partner referrals, and social media links. Check your admin analytics to see which sources drive the most conversions. Double down on your highest-converting channels.',
        tip: 'Add UTM parameters to links you share on different platforms to distinguish Instagram traffic from Twitter traffic.',
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
        content: 'This is the money step. New signups should immediately see your tier offerings with clear value propositions. Time-limited offers ("First month 50% off for new fans") create urgency. Your cheapest tier should feel like a steal.',
      },
      {
        title: 'Track milestones',
        content: 'CRWN tracks key milestones in each fan\'s journey: account created, first listen, first like, first subscription, first purchase. Use these milestones to identify where fans are dropping off and focus your optimization efforts there.',
      },
      {
        title: 'Reduce churn',
        content: 'Retention is where the money is. A subscriber who stays for 12 months is worth 12x a one-month subscriber. Post consistently, drop exclusive content regularly, and engage with your community. Your AI manager will flag at-risk subscribers so you can act before they cancel.',
        tip: 'Send a personal message to fans who have been subscribed for 3+ months. A "thank you for your support" goes a long way.',
      },
    ],
    proTips: [
      'Your funnel is only as strong as its weakest link. If you get lots of visits but few listens, fix your page design. If you get lots of signups but few subscribers, fix your tier value proposition.',
      'Run funnel analysis monthly. Small improvements at each stage compound dramatically over time.',
      'Partner with other CRWN artists to cross-promote. A recommendation from another artist converts at 3x the rate of cold traffic.',
      'Use your analytics dashboard to compare week-over-week conversion rates at each stage.',
    ],
    nextGuide: { slug: 'email-campaigns', title: 'Email & Text Campaigns' },
    prevGuide: { slug: 'shop-products', title: 'Shop & Products' },
  },

  // ─── 7. Email & Text Campaigns ───
  {
    slug: 'email-campaigns',
    icon: Mail,
    title: 'Email & Text Campaigns',
    subtitle: 'Reach your fans directly with targeted messages that drive action',
    category: 'Growing Your Business',
    estimatedTime: '15 min',
    steps: [
      {
        title: 'Understand your audience segments',
        content: 'Not all fans are the same. CRWN lets you segment by tier (free, paid, specific tier), engagement level (active, inactive, at-risk), and subscription duration. Sending the right message to the right segment dramatically increases open rates and conversions.',
      },
      {
        title: 'Craft your first campaign',
        content: 'Go to your community and create a post announcing new content, a sale, or an event. For broader reach, use the notification system to push updates to all subscribers. Every notification generates an email to fans who have notifications enabled.',
        tip: 'Write subject lines like you are texting a friend, not writing a press release. "dropped something special for you" outperforms "New Release Announcement" every time.',
      },
      {
        title: 'Build a campaign calendar',
        content: 'Plan your outreach in advance: new music drops, exclusive content previews, limited-time offers, milestone celebrations, and personal updates. Aim for 2-3 touchpoints per week across posts and notifications. Consistency keeps you top of mind.',
      },
      {
        title: 'Segment by tier for maximum impact',
        content: 'Send different messages to different tiers. Free-tier fans get "here is what you are missing" teasers. Mid-tier fans get exclusive previews. Top-tier fans get personal messages and early access. Personalization drives higher engagement at every level.',
      },
      {
        title: 'A/B test your messaging',
        content: 'Try different approaches: urgency ("only 24 hours left"), exclusivity ("just for Inner Circle"), personal ("I made this track thinking about..."), and value ("3 new tracks this week"). Track which approach drives the most clicks and subscriptions.',
        tip: 'The single highest-converting email type is "I just uploaded something that is not available anywhere else." Exclusivity wins.',
      },
      {
        title: 'Re-engage inactive fans',
        content: 'Fans who have not engaged in 30+ days are at risk of churning. Send them a personal update, a free exclusive track, or a reminder of what they are missing. Your AI manager identifies at-risk subscribers automatically.',
      },
    ],
    proTips: [
      'Never send more than one notification per day. Respect your fans\' inboxes.',
      'Use community posts for updates and conversations. Use notifications for important announcements and drops.',
      'Personalize when possible. "Hey Jordan, just dropped something I think you will love" converts 4x better than generic blasts.',
      'Track your notification click-through rates. If they are dropping, your content is not compelling enough.',
      'The best time to send is when your fans are online — check your analytics for peak engagement hours.',
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
        content: 'Every subscribed fan gets a unique referral link they can generate from any page — your artist profile, a track, the shop, or community. When someone subscribes through that link, the referrer earns a recurring commission on every payment for as long as the new subscriber stays. You set the commission rate — typically 10-20%. CRWN tracks everything automatically.',
      },
      {
        title: 'Set your commission rate',
        content: 'Go to Profile > Settings > Referrals and set your commission percentage. Higher rates motivate more sharing but reduce your revenue per subscriber. Start at 15% — it is high enough to motivate fans without cutting too deeply into your earnings.',
        tip: 'A 15% commission on a $15/month subscription means the referrer earns $2.25/month per referral — forever. That adds up fast and motivates consistent sharing.',
      },
      {
        title: 'Promote the referral program',
        content: 'Most fans do not know they can earn commissions. Post about it in your community, mention it in your bio, and remind fans regularly. Let them know they can share any link — not just your profile — and still earn. Create a dedicated "How to Earn" post explaining exactly how to share and what they can earn.',
      },
      {
        title: 'Identify and reward top referrers',
        content: 'Check your analytics to see which fans bring in the most new subscribers. Your top referrers are your most valuable fans — give them extra attention, exclusive content, or public recognition. A shoutout goes a long way.',
        tip: 'Consider creating a private group or special benefits for fans who refer 5+ subscribers. Gamify it.',
      },
      {
        title: 'Track referral performance',
        content: 'Your analytics show: total referrals, conversion rate (clicks to subscriptions), revenue generated by referrals, and top referrers. Use this data to identify what is working and optimize your approach.',
      },
    ],
    proTips: [
      'The best referrers are fans who genuinely love your music. Focus on creating incredible content and the referrals follow naturally.',
      'Give fans something to share: an exclusive snippet, a compelling story, a behind-the-scenes video. People share content, not links.',
      'Referral commissions are paid from your revenue. Think of it as a marketing cost that only triggers when it actually works.',
      'Fans can cash out once they reach $25. Make sure they know this — it makes the program feel real.',
    ],
    nextGuide: { slug: 'analytics-insights', title: 'Analytics & Insights' },
    prevGuide: { slug: 'email-campaigns', title: 'Email & Text Campaigns' },
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
        content: 'Your Analytics tab is organized into sections: Revenue (MRR, total earnings, ARPS), Subscribers (total, new, churned, net growth), Content (plays, likes, top tracks), and Fans (top supporters, engagement scores). Each section updates in real time.',
      },
      {
        title: 'Understand MRR (Monthly Recurring Revenue)',
        content: 'MRR is the total monthly revenue from active subscriptions. It is your most important metric — it tells you exactly how much you are earning each month from subscriptions alone. Track MRR week over week to see if you are growing, flat, or declining.',
        tip: 'If your MRR is growing but slowing down, it usually means churn is catching up. Focus on retention before acquisition.',
      },
      {
        title: 'Track subscriber growth',
        content: 'Net subscriber growth = new subscribers minus churned subscribers. If net growth is positive, you are building momentum. If it is negative, you are losing fans faster than you are gaining them. Dig into why fans are leaving — is it pricing, content quality, or engagement?',
      },
      {
        title: 'Analyze content performance',
        content: 'See which tracks get the most plays, which posts get the most engagement, and which products sell best. Use this data to inform your content strategy. If acoustic tracks outperform produced beats 3:1, make more acoustic content.',
      },
      {
        title: 'Identify your top fans',
        content: 'Your analytics surface your highest-value fans: longest subscribers, most plays, highest spend, most referrals. These fans are your core community. Engage with them personally, ask for feedback, and give them early access to new releases.',
        tip: 'Your top 10% of fans likely generate 40-50% of your revenue. Know who they are and treat them accordingly.',
      },
      {
        title: 'Monitor churn and retention',
        content: 'Churn rate is the percentage of subscribers who cancel each month. Healthy churn is under 5%. If yours is higher, investigate: Are fans canceling after a specific number of months? After a price increase? During content dry spells? The pattern reveals the fix.',
      },
      {
        title: 'Use insights to take action',
        content: 'Analytics are only useful if they change your behavior. Set a weekly ritual: every Monday, check your analytics, identify one thing to improve, and take action. Over time, these small optimizations compound into significant growth.',
      },
    ],
    proTips: [
      'Your AI manager generates a weekly report that summarizes key metrics and recommends actions. Read it every week.',
      'Compare month-over-month, not day-over-day. Daily fluctuations are noise — monthly trends are signal.',
      'The most actionable metric is ARPS (average revenue per subscriber). If ARPS is rising, your tier structure and upselling are working.',
      'Export your data periodically for your own records. Build a spreadsheet that tracks MRR, subscribers, and churn over time.',
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
        content: 'Your community feed is like a private social media page for your fans. Post updates, photos, videos, polls, and behind-the-scenes content. Fans can like, comment, and engage. Unlike social media, you own this audience — no algorithm deciding who sees your posts.',
      },
      {
        title: 'Create your first post',
        content: 'Go to your Community tab and tap "New Post." Write your message, attach media if you want, and select which tiers can see it. Public posts are visible to everyone, tier-gated posts are exclusive to subscribers at that level or higher.',
        tip: 'Your first post should introduce yourself and set expectations: "Welcome! Here is what to expect from this community."',
      },
      {
        title: 'Develop a posting cadence',
        content: 'Post 3-5 times per week. Mix content types: music updates (2x), behind-the-scenes (1x), personal updates (1x), and engagement posts like polls or questions (1x). Consistency matters more than perfection.',
      },
      {
        title: 'Gate content strategically',
        content: 'Not everything should be gated. Public posts attract new fans. Free-tier posts reward signups. Paid-tier posts justify subscriptions. Use the pyramid: 40% public, 30% free tier, 30% paid tiers. The most exclusive content goes to your highest tier.',
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
      'Pin your best post or most important announcement to the top of your community.',
      'Cross-post your best public content to Instagram/Twitter/TikTok with a link back to your CRWN page.',
    ],
    nextGuide: { slug: 'ai-manager', title: 'AI Artist Manager' },
    prevGuide: { slug: 'analytics-insights', title: 'Analytics & Insights' },
  },

  // ─── 11. AI Artist Manager ───
  {
    slug: 'ai-manager',
    icon: Bot,
    title: 'AI Artist Manager',
    subtitle: 'Your built-in AI that analyzes engagement and suggests growth strategies',
    category: 'Mastering the Platform',
    estimatedTime: '10 min',
    steps: [
      {
        title: 'What the AI manager does',
        content: 'Every CRWN artist gets a built-in AI manager that analyzes your data and provides actionable recommendations. It reviews subscriber behavior, content performance, revenue trends, and fan engagement to generate weekly reports with specific action items.',
      },
      {
        title: 'Read your weekly report',
        content: 'Each week, your AI manager generates a report covering: new subscribers and who they are, at-risk subscribers and why, top performing content, revenue trends, and recommended actions. Find this in your Analytics tab under "AI Report."',
        tip: 'The AI report is generated using real data from your account. The recommendations are specific to your situation, not generic advice.',
      },
      {
        title: 'Act on at-risk subscriber alerts',
        content: 'The AI identifies subscribers who show signs of churning: decreased engagement, skipped content, or approaching a common cancel point. When flagged, reach out personally with exclusive content or a thank-you message. Early intervention prevents cancellations.',
      },
      {
        title: 'Use content recommendations',
        content: 'Based on what your fans engage with most, the AI suggests what type of content to post next. If your acoustic snippets get 4x more engagement than produced tracks, it will recommend more acoustic content. Follow the data.',
      },
      {
        title: 'Review upgrade opportunities',
        content: 'The AI identifies fans who are likely candidates for tier upgrades based on their engagement patterns. Fans who consistently like, comment, and listen are prime candidates. The AI tells you who they are and suggests how to approach the upgrade conversation.',
      },
      {
        title: 'Track AI-driven improvements',
        content: 'Over time, following AI recommendations should correlate with improved metrics. Compare your MRR growth, churn rate, and ARPS before and after acting on recommendations. The AI learns from your specific audience, so its suggestions get more accurate over time.',
      },
    ],
    proTips: [
      'Treat the AI manager like a real manager — check in weekly, act on the recommendations, and track results.',
      'The AI is a tool, not a replacement for genuine fan interaction. Use its insights to inform your personal engagement strategy.',
      'If a recommendation does not feel right for your brand, skip it. You know your audience better than any algorithm.',
      'The AI report also identifies your funnel bottlenecks — where fans are dropping off in their journey from visitor to subscriber.',
    ],
    nextGuide: { slug: 'sync-licensing', title: 'Sync Licensing' },
    prevGuide: { slug: 'community-posts', title: 'Community & Posts' },
  },

  // ─── 12. Sync Licensing ───
  {
    slug: 'sync-licensing',
    icon: Radio,
    title: 'Sync Licensing',
    subtitle: 'Get your music placed in TV, film, ads, and games',
    category: 'Mastering the Platform',
    estimatedTime: '10 min',
    steps: [
      {
        title: 'What is sync licensing?',
        content: 'Sync (synchronization) licensing is when your music is used in visual media: TV shows, films, commercials, video games, YouTube videos, and podcasts. It is one of the most lucrative income streams for independent artists. A single sync placement can earn $500 to $50,000+.',
      },
      {
        title: 'Browse sync opportunities',
        content: 'CRWN curates real sync licensing briefs from music supervisors and brands. Browse available opportunities in the Sync tab. Each brief describes what they are looking for: genre, mood, tempo, and deadline. Submit tracks that match the brief.',
        tip: 'Pro tier and above gets access to the full sync catalog. Free and Starter tiers see a limited selection.',
      },
      {
        title: 'Prepare your music for sync',
        content: 'Sync-ready music needs: clean masters, no uncleared samples, full ownership or co-writing splits documented, and instrumental versions available. Having stems (individual instrument tracks) ready gives you a competitive advantage.',
      },
      {
        title: 'Submit to briefs',
        content: 'When you find a matching brief, submit your track. Include a short pitch explaining why it fits. Music supervisors review hundreds of submissions — make yours stand out with a concise, specific pitch that matches their brief description.',
        tip: 'Tailor each submission. Do not blast the same track to every brief. Quality, targeted submissions win over quantity.',
      },
      {
        title: 'Set your location and genres correctly',
        content: 'Many sync opportunities are location-specific (e.g., "Looking for Chicago hip-hop artists"). Make sure your city, state, and genre tags are accurate in your profile so you show up for relevant opportunities.',
      },
    ],
    proTips: [
      'Create instrumental versions of all your best tracks. Many sync placements need instrumentals, not vocal versions.',
      'Write music with sync in mind: clear themes, buildable dynamics, and strong hooks work best.',
      'Keep your metadata clean — track title, artist name, genre, BPM, mood tags. This helps music supervisors find your music.',
      'Sync income is separate from subscription revenue. It is a bonus income stream that can be significant.',
    ],
    nextGuide: { slug: 'growth-roadmap', title: 'Growth Roadmap' },
    prevGuide: { slug: 'ai-manager', title: 'AI Artist Manager' },
  },

  // ─── 13. Growth Roadmap ───
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
        content: 'Complete your profile 100%. Connect Stripe. Upload at least 5 tracks (3 free, 2 exclusive). Create 2-3 subscription tiers. Write your first 5 community posts. Share your CRWN page with your existing audience on Instagram, Twitter, and any other platforms. Your goal is 10 subscribers from people who already know your music.',
        tip: 'Do not try to go viral in month 1. Convert your existing audience first — they are the easiest subscribers to get.',
      },
      {
        title: 'Month 2: Consistency (10-30 subscribers)',
        content: 'Post in your community 4-5 times per week. Upload 1 new track weekly. Share behind-the-scenes content. Set up your referral program at 15%. Ask your first 10 subscribers to share your page. Start tracking your analytics weekly. Goal: triple your subscriber count through consistency and word of mouth.',
      },
      {
        title: 'Month 3: Activation (30-75 subscribers)',
        content: 'Launch your first shop product (beat pack or digital download). Run a limited-time offer for new subscribers. Create a "subscriber milestone" post celebrating 50 fans. Identify and personally thank your top 5 referrers. Start cross-promoting with other CRWN artists. Goal: 75 subscribers.',
        tip: 'This is the phase where most artists quit. Push through — the compound effect is about to kick in.',
      },
      {
        title: 'Month 4-6: Momentum (75-250 subscribers)',
        content: 'Optimize your funnel based on analytics. Create a monthly "exclusive drop" cadence. Launch an email/notification campaign for inactive fans. Test different content types and double down on what works. Consider upgrading to Pro tier if fees justify it. Goal: 250 subscribers.',
      },
      {
        title: 'Month 7-9: Scale (250-500 subscribers)',
        content: 'Your referral network should be generating organic growth. Focus on retention — engage your community, keep content fresh, and address churn. Launch a premium product or experience. Partner with 3-5 other CRWN artists for cross-promotion. Goal: 500 subscribers.',
      },
      {
        title: 'Month 10-12: Authority (500-1,000 subscribers)',
        content: 'At this stage, you have a real fan business. Optimize your tier structure for maximum ARPS. Consider adding a high-ticket tier for superfans. Use your AI manager data to predict trends and act proactively. Your goal: 1,000 subscribers generating $5,000-10,000/month in MRR.',
        tip: 'At 1,000 subscribers, you are earning more than 99% of independent artists. This is a sustainable career.',
      },
      {
        title: 'Beyond 1,000: Scale and diversify',
        content: 'With a strong subscriber base, explore: live events for your fan community, physical merchandise fulfillment, sync licensing income, collaboration projects with other artists, and potentially mentoring other artists on CRWN. The platform grows with you.',
      },
    ],
    proTips: [
      'This roadmap assumes consistent effort. Skipping weeks of posting or uploading resets your momentum.',
      'Every artist grows at a different pace. These numbers are targets, not requirements. Focus on the activities, not just the subscriber count.',
      'The hardest stretch is 0-50 subscribers. After 50, referrals and organic discovery start compounding.',
      'Review this roadmap monthly and adjust based on your actual data. Your path will look different from anyone else\'s.',
      'The artists who succeed are not the most talented — they are the most consistent.',
    ],
    nextGuide: { slug: 'content-calendar', title: 'Content Calendar' },
    prevGuide: { slug: 'sync-licensing', title: 'Sync Licensing' },
  },

  // ─── 14. Content Calendar ───
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
        content: 'Random posting leads to inconsistency, and inconsistency kills retention. A content calendar ensures you post regularly, mix content types effectively, and never run out of ideas. It takes the guesswork out of "what should I post today?"',
      },
      {
        title: 'Set your weekly cadence',
        content: 'Plan your week: Monday (music update or new track), Wednesday (behind-the-scenes or personal update), Friday (exclusive content for subscribers), and Weekend (engagement post: poll, Q&A, or fan shoutout). Start with 3-4 posts per week and scale up as it becomes habit.',
        tip: 'Batch your content creation. Spend 2-3 hours on Sunday creating all your posts for the week. This is far more efficient than creating daily.',
      },
      {
        title: 'Plan your monthly releases',
        content: 'Map out your month: Week 1 (new track release + announcement), Week 2 (behind-the-scenes of the creative process), Week 3 (subscriber-exclusive content drop), Week 4 (engagement + preview of next month). This rhythm keeps fans engaged and anticipating.',
      },
      {
        title: 'Align campaigns with releases',
        content: 'When you drop new music, coordinate: tease it in your community 3 days before, announce the drop day-of, share a behind-the-scenes the day after, and push the notification to fans 2 days later. Multi-touch campaigns convert better than single announcements.',
      },
      {
        title: 'Seasonal and event planning',
        content: 'Plan content around seasons, holidays, and your personal milestones. A year-end "Best Of" playlist, a birthday exclusive drop, or a summer EP gives you natural content hooks. Mark these dates on your calendar months in advance.',
      },
      {
        title: 'Track what works and iterate',
        content: 'After each month, review your analytics: which posts got the most engagement? Which tracks got the most plays? Which campaigns drove the most subscriptions? Adjust your calendar based on data, not gut feeling.',
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
