'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useInView } from '@/hooks/useInView';
import {
  Crown, User, Music, CreditCard, BarChart3, Store, Users, Share2,
  DollarSign, Heart, ListMusic, Search, MessageCircle, Headphones,
  ChevronRight, ArrowRight, Zap, Target, Mail, TrendingUp, Mic,
  ShoppingBag, BookOpen, Map, Bot, Calendar, Gift, Shield,
  Play, Star, Radio, Sparkles, Globe,
} from 'lucide-react';
import Link from 'next/link';

// ─── Animated Number Counter ───
function AnimatedNumber({ end, duration = 2000, prefix = '', suffix = '' }: { end: number; duration?: number; prefix?: string; suffix?: string }) {
  const [count, setCount] = useState(0);
  const { ref, isInView } = useInView();

  useEffect(() => {
    if (!isInView) return;
    let startTime: number;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [isInView, end, duration]);

  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

// ─── Section Wrapper ───
function Section({ children, className = '', id = '' }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`py-20 md:py-32 px-4 ${className}`}>
      <div className="max-w-6xl mx-auto">{children}</div>
    </section>
  );
}

// ─── Floating Orbit Graphic ───
function OrbitGraphic() {
  return (
    <div className="relative w-48 h-48 mx-auto">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-crwn-gold/20 flex items-center justify-center guide-float">
          <Crown className="w-8 h-8 text-crwn-gold" />
        </div>
      </div>
      <div className="absolute inset-0 guide-orbit">
        <Music className="w-5 h-5 text-crwn-gold/60" />
      </div>
      <div className="absolute inset-0 guide-orbit-reverse" style={{ animationDelay: '-2s' }}>
        <DollarSign className="w-5 h-5 text-crwn-gold/40" />
      </div>
      <div className="absolute inset-0 guide-orbit" style={{ animationDelay: '-4s' }}>
        <Users className="w-5 h-5 text-crwn-gold/50" />
      </div>
    </div>
  );
}

// ─── Animated Mini Dashboard ───
function MiniDashboard() {
  const { ref, isInView } = useInView();
  const [showNotifs, setShowNotifs] = useState<number>(0);

  useEffect(() => {
    if (!isInView) return;
    const timers = [0, 800, 1600, 2400].map((delay, i) =>
      setTimeout(() => setShowNotifs(i + 1), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [isInView]);

  const notifs = [
    { text: 'New subscriber — The Wave', amount: '+$10' },
    { text: 'Track purchased — Midnight', amount: '+$5' },
    { text: 'Fan referral commission', amount: '+$2' },
    { text: 'Inner Circle upgrade', amount: '+$50' },
  ];

  return (
    <div ref={ref} className="neu-raised rounded-2xl p-6 guide-shimmer">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-crwn-text-secondary text-xs uppercase tracking-wider">Live Revenue</span>
      </div>
      <div className="text-3xl font-bold text-crwn-gold mb-4">
        {isInView ? <AnimatedNumber end={2847} prefix="$" /> : '$0'}
        <span className="text-sm text-crwn-text-secondary font-normal ml-2">this month</span>
      </div>
      <div className="space-y-2">
        {notifs.slice(0, showNotifs).map((n, i) => (
          <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-crwn-bg/50 guide-notif-slide" style={{ animationDelay: `${i * 0.1}s` }}>
            <span className="text-crwn-text text-sm">{n.text}</span>
            <span className="text-crwn-gold font-semibold text-sm">{n.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Animated Bar Chart ───
function MiniBarChart() {
  const { ref, isInView } = useInView();
  const bars = [40, 65, 45, 80, 60, 90, 75];
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div ref={ref} className="flex items-end gap-2 h-32 px-4">
      {bars.map((h, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t-md bg-gradient-to-t from-crwn-gold/60 to-crwn-gold transition-all duration-1000 ease-out"
            style={{ height: isInView ? `${h}%` : '0%', transitionDelay: `${i * 100}ms` }}
          />
          <span className="text-[10px] text-crwn-text-dim">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Guide Card (links to deep dive) ───
function GuideCard({ icon: Icon, title, description, href, delay = 0 }: {
  icon: React.ElementType; title: string; description: string; href: string; delay?: number;
}) {
  const { ref, isInView } = useInView();

  return (
    <div ref={ref} style={{ animationDelay: `${delay}ms` }} className={`${isInView ? 'guide-slide-left' : 'opacity-0'}`}>
      <Link
        href={href}
        className="block neu-raised rounded-2xl p-6 border border-transparent guide-card-glow group transition-all"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-crwn-gold/10 flex items-center justify-center group-hover:bg-crwn-gold/20 transition-colors">
            <Icon className="w-6 h-6 text-crwn-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-crwn-text font-semibold text-base mb-1 group-hover:text-crwn-gold transition-colors">
              {title}
            </h3>
            <p className="text-crwn-text-secondary text-sm leading-relaxed">{description}</p>
          </div>
          <ArrowRight className="w-5 h-5 text-crwn-text-dim group-hover:text-crwn-gold group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
        </div>
      </Link>
    </div>
  );
}

// ─── Roadmap Step (for fan guide) ───
function RoadmapStep({ icon: Icon, step, title, description }: {
  icon: React.ElementType; step: number; title: string; description: string;
}) {
  const { ref, isInView } = useInView();

  return (
    <div ref={ref} className={`guide-roadmap-line ${isInView ? 'guide-slide-left' : 'opacity-0'}`} style={{ animationDelay: `${step * 80}ms` }}>
      <div className="flex items-start gap-4 pb-8">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-crwn-gold/20 flex items-center justify-center z-10 relative">
          <span className="text-crwn-gold text-sm font-bold">{step}</span>
        </div>
        <div className="flex-1 neu-raised rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Icon className="w-5 h-5 text-crwn-gold" />
            <h3 className="text-crwn-text font-semibold">{title}</h3>
          </div>
          <p className="text-crwn-text-secondary text-sm leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Artist Guides Data ───
const artistGuides = [
  {
    category: 'Getting Set Up',
    guides: [
      { icon: User, title: 'Profile & Branding', description: 'Set up your artist name, bio, photos, genres, and location. Make a first impression that converts visitors to fans.', slug: 'profile-setup' },
      { icon: CreditCard, title: 'Stripe & Payments', description: 'Connect Stripe, understand platform fees, payout schedules, and instant cashout. Get paid for your art.', slug: 'stripe-payments' },
      { icon: Crown, title: 'Subscription Tiers', description: 'Design your tier structure, set pricing, manage benefits, and understand annual vs monthly conversions.', slug: 'subscription-tiers' },
      { icon: Music, title: 'Uploading Music', description: 'Add tracks and albums, set access levels, organize your catalog, and gate content to specific tiers.', slug: 'uploading-music' },
    ],
  },
  {
    category: 'Growing Your Business',
    guides: [
      { icon: Store, title: 'Shop & Products', description: 'Sell digital products, beat packs, experiences, and 1-on-1 bookings. Create urgency with limits and expiration.', slug: 'shop-products' },
      { icon: Target, title: 'Fan Funnel & Acquisition', description: 'Understand the full acquisition funnel from first click to paying subscriber. Source attribution, milestones, and optimization.', slug: 'fan-funnel' },
      { icon: Mail, title: 'Email & Text Campaigns', description: 'Reach your fans directly. Craft campaigns, segment by tier, automate drip sequences, and track open rates.', slug: 'email-campaigns' },
      { icon: Share2, title: 'Fan Referral Program', description: 'Set commission rates, track referral performance, and turn your biggest fans into your best marketers.', slug: 'referral-program' },
    ],
  },
  {
    category: 'Mastering the Platform',
    guides: [
      { icon: BarChart3, title: 'Analytics & Insights', description: 'Revenue trends, subscriber growth, play counts, top fans, churn analysis, and LTV metrics. Your command center.', slug: 'analytics-insights' },
      { icon: MessageCircle, title: 'Community & Posts', description: 'Share updates, gate content by tier, engage fans with photos, videos, and behind-the-scenes drops.', slug: 'community-posts' },
      { icon: Bot, title: 'AI Artist Manager', description: 'Your built-in AI analyzes engagement, identifies at-risk subscribers, suggests content, and writes weekly reports.', slug: 'ai-manager' },
      { icon: Radio, title: 'Sync Licensing', description: 'Browse real sync opportunities, submit your music, and understand how sync deals work on CRWN.', slug: 'sync-licensing' },
    ],
  },
  {
    category: 'Scaling & Strategy',
    guides: [
      { icon: Map, title: 'Growth Roadmap', description: 'A month-by-month plan from 0 to 1,000 subscribers. Milestones, tactics, and what to focus on at each stage.', slug: 'growth-roadmap' },
      { icon: Calendar, title: 'Content Calendar', description: 'Plan your releases, posts, and campaigns. Learn the ideal posting cadence and content mix that drives retention.', slug: 'content-calendar' },
    ],
  },
];

// ─── Fan Steps ───
const fanSteps = [
  { icon: Search, step: 1, title: 'Explore & Discover', description: 'Browse the catalog and search for artists. Every artist on CRWN is independent and keeps the majority of their earnings.' },
  { icon: Crown, step: 2, title: 'Subscribe to Artists', description: 'Pick a tier and support your favorite artists directly. Annual subscriptions save you 25%. Your subscription unlocks exclusive content.' },
  { icon: Heart, step: 3, title: 'Build Your Library', description: 'Like songs to save them, create playlists, and organize your collection. Your library grows as you discover new music.' },
  { icon: Store, step: 4, title: 'Shop for Exclusives', description: 'Buy digital products like beat packs, or book experiences like 1-on-1 video calls with your favorite artists.' },
  { icon: Headphones, step: 5, title: 'Listen Anywhere', description: 'Music keeps playing as you browse. Add CRWN to your home screen for the best mobile experience.' },
  { icon: MessageCircle, step: 6, title: 'Join Communities', description: 'Comment on posts, engage with artists and other fans. Higher tiers unlock exclusive community content.' },
  { icon: Share2, step: 7, title: 'Share & Earn', description: 'Share an artist page with friends. When someone subscribes through your link, you earn a commission on every payment.' },
  { icon: DollarSign, step: 8, title: 'Cash Out', description: 'Once your referral balance reaches $25, connect Stripe and cash out. No fees. Free weekly payouts or $2 instant.' },
];

// ─── Hero Section ───
function HeroSection({ isArtist, onToggle }: { isArtist: boolean; onToggle: (role: string) => void }) {
  return (
    <Section className="pt-24 md:pt-32">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-crwn-gold/10 rounded-full px-4 py-2 mb-6">
            <Sparkles className="w-4 h-4 text-crwn-gold" />
            <span className="text-crwn-gold text-sm font-medium">Your complete guide to CRWN</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-crwn-text mb-4">
            {isArtist ? (
              <>The Artist<br /><span className="text-crwn-gold">Playbook</span></>
            ) : (
              <>Your CRWN<br /><span className="text-crwn-gold">Guide</span></>
            )}
          </h1>
          <p className="text-lg text-crwn-text-secondary mb-8 max-w-lg leading-relaxed">
            {isArtist
              ? 'Everything you need to build a sustainable music business. From setting up your profile to scaling to 1,000 subscribers and beyond.'
              : 'Everything you need to discover, support, and connect with independent artists. Your music, your way.'}
          </p>

          {/* Role Toggle */}
          <div className="flex items-center gap-3 mb-8">
            <button
              onClick={() => onToggle('artist')}
              className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                isArtist
                  ? 'bg-crwn-gold text-crwn-bg'
                  : 'bg-crwn-surface border border-crwn-elevated text-crwn-text-secondary hover:border-crwn-gold/50'
              }`}
            >
              I&apos;m an Artist
            </button>
            <button
              onClick={() => onToggle('fan')}
              className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                !isArtist
                  ? 'bg-crwn-gold text-crwn-bg'
                  : 'bg-crwn-surface border border-crwn-elevated text-crwn-text-secondary hover:border-crwn-gold/50'
              }`}
            >
              I&apos;m a Supporter
            </button>
          </div>

          {isArtist && (
            <a href="#guides" className="inline-flex items-center gap-2 text-crwn-gold hover:underline text-sm">
              Jump to guides <ChevronRight className="w-4 h-4" />
            </a>
          )}
        </div>

        <div>
          {isArtist ? <MiniDashboard /> : <OrbitGraphic />}
        </div>
      </div>
    </Section>
  );
}

// ─── Stats Section (Artist) ───
function StatsSection() {
  const { ref, isInView } = useInView();

  return (
    <Section>
      <div ref={ref} className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {[
          { value: 14, label: 'In-Depth Guides', suffix: '' },
          { value: 4, label: 'Categories', suffix: '' },
          { value: 100, label: 'Tips & Tactics', suffix: '+' },
          { value: 0, label: 'Cost to You', prefix: '$' },
        ].map((stat, i) => (
          <div key={i} className={`neu-raised rounded-2xl p-6 text-center ${isInView ? 'guide-scale-in' : 'opacity-0'}`} style={{ animationDelay: `${i * 100}ms` }}>
            <div className="text-3xl md:text-4xl font-bold text-crwn-gold mb-1">
              {stat.prefix || ''}{isInView ? <AnimatedNumber end={stat.value} duration={1500} /> : 0}{stat.suffix || ''}
            </div>
            <div className="text-crwn-text-secondary text-sm">{stat.label}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Revenue Preview Section ───
function RevenuePreview() {
  const { ref, isInView } = useInView();

  return (
    <Section>
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-bold text-crwn-text mb-3">
          See What&apos;s Possible
        </h2>
        <p className="text-crwn-text-secondary text-lg max-w-2xl mx-auto">
          100 fans at $15/month = $1,500/month. Here&apos;s what your first week could look like.
        </p>
      </div>
      <div ref={ref} className="grid md:grid-cols-2 gap-8 items-center">
        <div className="neu-raised rounded-2xl p-6">
          <h3 className="text-crwn-text font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-crwn-gold" />
            Weekly Revenue
          </h3>
          <MiniBarChart />
        </div>
        <div className="space-y-4">
          {[
            { icon: Crown, label: 'Subscriptions', value: '$470/mo', desc: '47 fans across 3 tiers' },
            { icon: Store, label: 'Shop Sales', value: '$180/mo', desc: 'Beat packs & exclusives' },
            { icon: Share2, label: 'Referral Growth', value: '+12 fans', desc: 'From 5 active referrers' },
          ].map((item, i) => (
            <div key={i} className={`neu-raised rounded-xl p-4 flex items-center gap-4 ${isInView ? 'guide-slide-right' : 'opacity-0'}`} style={{ animationDelay: `${i * 150}ms` }}>
              <div className="w-10 h-10 rounded-lg bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
                <item.icon className="w-5 h-5 text-crwn-gold" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-crwn-text font-medium text-sm">{item.label}</span>
                  <span className="text-crwn-gold font-bold">{item.value}</span>
                </div>
                <span className="text-crwn-text-dim text-xs">{item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─── Artist Guides Section ───
function ArtistGuidesSection() {
  return (
    <Section id="guides">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-bold text-crwn-text mb-3">
          Your Complete Guide Library
        </h2>
        <p className="text-crwn-text-secondary text-lg max-w-2xl mx-auto">
          Each guide walks you through every detail with step-by-step instructions, pro tips, and visual examples.
        </p>
      </div>

      <div className="space-y-12">
        {artistGuides.map((category, ci) => (
          <div key={ci}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-full bg-crwn-gold/20 flex items-center justify-center">
                <span className="text-crwn-gold text-sm font-bold">{ci + 1}</span>
              </div>
              <h3 className="text-xl font-bold text-crwn-text">{category.category}</h3>
              <div className="flex-1 h-px bg-crwn-elevated" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {category.guides.map((guide, gi) => (
                <GuideCard
                  key={gi}
                  icon={guide.icon}
                  title={guide.title}
                  description={guide.description}
                  href={`/getting-started/guides/${guide.slug}`}
                  delay={gi * 80}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Fan Guide Section ───
function FanGuideSection() {
  return (
    <Section>
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-bold text-crwn-text mb-3">
          Your Journey Starts Here
        </h2>
        <p className="text-crwn-text-secondary text-lg max-w-2xl mx-auto">
          Follow these steps to discover amazing independent artists and get the most out of CRWN.
        </p>
      </div>
      <div className="max-w-2xl mx-auto">
        {fanSteps.map((step) => (
          <RoadmapStep
            key={step.step}
            icon={step.icon}
            step={step.step}
            title={step.title}
            description={step.description}
          />
        ))}
      </div>
    </Section>
  );
}

// ─── CTA Section ───
function CTASection({ isArtist }: { isArtist: boolean }) {
  const router = useRouter();

  return (
    <Section>
      <div className="neu-raised rounded-3xl p-8 md:p-12 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-crwn-gold/5 to-transparent" />
        <div className="relative z-10">
          <div className="w-16 h-16 rounded-full bg-crwn-gold/20 flex items-center justify-center mx-auto mb-6 guide-float">
            <Crown className="w-8 h-8 text-crwn-gold" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-crwn-text mb-4">
            {isArtist ? 'Ready to Build Your Artist Business?' : 'Ready to Discover Amazing Music?'}
          </h2>
          <p className="text-crwn-text-secondary text-lg mb-8 max-w-lg mx-auto">
            {isArtist
              ? 'Your fans are waiting. Set up your page, connect Stripe, and start earning from day one.'
              : 'Support independent artists directly. Every subscription makes a real difference.'}
          </p>
          <button
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold py-3 px-8 rounded-full hover:bg-crwn-gold/90 transition-colors press-scale"
          >
            {isArtist ? 'Go to Dashboard' : 'Start Exploring'}
            <ArrowRight className="w-5 h-5" />
          </button>
          <p className="mt-4 text-xs text-crwn-text-dim">
            You can revisit this guide anytime from the help icon on your home screen.
          </p>
        </div>
      </div>
    </Section>
  );
}

// ─── Navigation ───
function GettingStartedNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-crwn-bg/80 backdrop-blur-md border-b border-crwn-elevated">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="text-xl font-bold text-crwn-gold">
            CRWN
          </Link>
          <Link
            href="/home"
            className="text-sm text-crwn-text-secondary hover:text-crwn-gold transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Main Page ───
export default function GettingStartedPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [role, setRole] = useState(searchParams.get('role') || 'artist');
  const isArtist = role === 'artist';

  const handleToggle = (newRole: string) => {
    setRole(newRole);
    router.replace(`/getting-started?role=${newRole}`, { scroll: false });
  };

  return (
    <div className="min-h-screen bg-crwn-bg">
      <GettingStartedNav />
      <main className="page-fade-in">
        <HeroSection isArtist={isArtist} onToggle={handleToggle} />

        {isArtist ? (
          <>
            <StatsSection />
            <RevenuePreview />
            <ArtistGuidesSection />
          </>
        ) : (
          <FanGuideSection />
        )}

        <CTASection isArtist={isArtist} />
      </main>
    </div>
  );
}
