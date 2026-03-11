'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useInView } from '@/hooks/useInView';

// Animated counter
function AnimatedNumber({ end, duration = 2000 }: { end: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const { ref, isInView } = useInView();
  
  useEffect(() => {
    if (!isInView) return;
    
    let startTime: number;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [isInView, end, duration]);
  
  return <span ref={ref}>{count}</span>;
}

// Section wrapper with animation
function Section({ children, className = '', id = '' }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`min-h-screen flex items-center justify-center py-20 px-4 ${className}`}>
      {children}
    </section>
  );
}

// Navigation
function Navigation() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-crwn-bg/80 backdrop-blur-md border-b border-crwn-elevated">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex-shrink-0">
            <Link href="/" className="text-2xl font-bold text-crwn-gold">
              CRWN
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-crwn-text hover:text-crwn-gold transition-colors">
              Log In
            </Link>
            <Link href="/signup" className="neu-button-accent px-4 py-2 text-crwn-bg font-semibold rounded-lg">
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

// Hero Section
function HeroSection() {
  const [notifications, setNotifications] = useState<string[]>([]);
  const { ref, isInView } = useInView();

  useEffect(() => {
    if (!isInView) return;
    
    const notifs = [
      'Jordan subscribed to VIP — $10',
      'Marcus purchased exclusive track — $5',
      'Emily sent a fan tip — $3',
    ];
    
    notifs.forEach((notif, i) => {
      setTimeout(() => {
        setNotifications(prev => [...prev, notif]);
      }, i * 1500);
    });
  }, [isInView]);

  return (
    <Section className="pt-24">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="text-5xl md:text-7xl font-bold text-crwn-text mb-6">
            CRWN
          </h1>
          <h2 className="text-3xl md:text-4xl font-semibold text-crwn-gold mb-4">
            Turn listeners into paying fans.
          </h2>
          <p className="text-xl text-crwn-text-secondary mb-8 max-w-lg">
            Build a direct relationship with your audience and earn recurring income
            from the people who love your music.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/signup" className="neu-button-accent px-8 py-4 text-crwn-bg font-semibold rounded-xl text-center">
              Get Started
            </Link>
            <a href="#monetize" className="px-8 py-4 border border-crwn-elevated text-crwn-text rounded-xl hover:border-crwn-gold hover:text-crwn-gold transition-all text-center">
              Learn More ↓
            </a>
          </div>
        </div>

        <div ref={ref} className="neu-raised rounded-2xl p-6 bg-crwn-bg">
          <h3 className="text-lg font-semibold text-crwn-text mb-4">Today's Revenue</h3>
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-crwn-text">
              <span>VIP Subscriptions</span>
              <span className="text-crwn-gold">$87</span>
            </div>
            <div className="flex justify-between text-crwn-text">
              <span>Exclusive Track Sales</span>
              <span className="text-crwn-gold">$42</span>
            </div>
            <div className="flex justify-between text-crwn-text">
              <span>Fan Tips</span>
              <span className="text-crwn-gold">$18</span>
            </div>
            <div className="border-t border-crwn-elevated pt-3 flex justify-between text-lg font-bold">
              <span className="text-crwn-text">Total Today</span>
              <span className="text-crwn-gold">$147</span>
            </div>
          </div>
          
          <div className="space-y-2">
            {notifications.map((notif, i) => (
              <div key={i} className="neu-inset px-4 py-2 text-sm text-crwn-text animate-[slideIn_0.3s_ease-out]">
                {notif}
              </div>
            ))}
            {notifications.length === 0 && (
              <div className="neu-inset px-4 py-2 text-sm text-crwn-text-dim">
                Waiting for activity...
              </div>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

// Section 2: Fans Math
function FansMathSection() {
  const { ref: sectionRef, isInView } = useInView();

  const fans = [
    { fans: 100, revenue: 1000 },
    { fans: 500, revenue: 5000 },
    { fans: 1000, revenue: 10000 },
  ];

  return (
    <Section id="monetize" className="bg-crwn-bg">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-4xl md:text-5xl font-bold text-crwn-text mb-4">
          You Don't Need Millions of Streams
        </h2>
        <p className="text-xl text-crwn-text-secondary mb-12">
          100 fans × $10/month = $1,000/month.<br />
          CRWN helps you turn listeners into paying supporters.
        </p>
        
        <div ref={sectionRef} className="grid md:grid-cols-3 gap-6">
          {fans.map((item, i) => (
            <div key={i} className="neu-raised rounded-2xl p-8">
              <div className="text-5xl md:text-6xl font-bold text-crwn-gold mb-2">
                {isInView ? <AnimatedNumber end={item.fans} /> : 0}
              </div>
              <div className="text-crwn-text text-lg">fans</div>
              <div className="text-2xl font-semibold text-crwn-text mt-4">
                ${isInView ? <AnimatedNumber end={item.revenue} /> : 0}/mo
              </div>
            </div>
          ))}
        </div>
        
        <p className="text-lg text-crwn-gold mt-8">
          A small group of real supporters can change everything.
        </p>
      </div>
    </Section>
  );
}

// Section 3: Monetize
function MonetizeSection() {
  return (
    <Section className="bg-crwn-bg">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-crwn-text mb-4 text-center">
          Monetize Your Music
        </h2>
        <p className="text-xl text-crwn-text-secondary mb-12 text-center max-w-2xl mx-auto">
          Create subscription tiers, sell exclusive content, and earn directly from your biggest fans.
          Stop relying on fractions of a cent per stream.
        </p>

        <div className="neu-raised rounded-2xl p-8 max-w-2xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full neu-inset flex items-center justify-center text-xl">🎵</div>
            <div>
              <h3 className="text-xl font-bold text-crwn-text">M3rcey</h3>
              <p className="text-crwn-text-dim text-sm">Chicago, IL</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="neu-inset p-4 rounded-xl">
              <div className="text-crwn-text-dim text-sm">Free Listener</div>
              <div className="text-crwn-text">Access to public releases</div>
            </div>
            
            <div className="neu-raised p-4 rounded-xl border border-crwn-gold/30">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <span className="text-crwn-text font-semibold">VIP</span>
                  <span className="text-crwn-gold ml-2">$10/month</span>
                </div>
              </div>
              <ul className="space-y-1 text-sm text-crwn-text-secondary">
                <li>• Exclusive songs</li>
                <li>• Private livestreams</li>
                <li>• Early releases</li>
              </ul>
            </div>
            
            <div className="neu-raised p-4 rounded-xl">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <span className="text-crwn-text font-semibold">Inner Circle</span>
                  <span className="text-crwn-gold ml-2">$25/month</span>
                </div>
              </div>
              <ul className="space-y-1 text-sm text-crwn-text-secondary">
                <li>• Monthly 1-on-1 session</li>
                <li>• Unreleased tracks</li>
                <li>• Private chat</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

// Section 4: AI Manager
function AISection() {
  return (
    <Section className="bg-crwn-bg">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-crwn-text mb-4 text-center">
          Your AI Artist Manager
        </h2>
        <p className="text-xl text-crwn-text-secondary mb-12 text-center max-w-2xl mx-auto">
          Every artist on CRWN gets a built-in AI manager that analyzes fan engagement,
          suggests content, and identifies your biggest supporters.
          Focus on making music while the system helps grow your fan business.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="neu-raised rounded-2xl p-6 border border-crwn-gold/20">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">🤖</span>
              <h3 className="text-lg font-semibold text-crwn-gold">Weekly Artist Report</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-crwn-text">New Subscribers</span>
                <span className="text-crwn-gold font-bold">+24</span>
              </div>
              <div className="flex justify-between">
                <span className="text-crwn-text">Revenue This Week</span>
                <span className="text-crwn-gold font-bold">$417</span>
              </div>
              <div className="flex justify-between">
                <span className="text-crwn-text">Top Supporters Identified</span>
                <span className="text-crwn-gold font-bold">7</span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-crwn-elevated">
              <p className="text-crwn-text text-sm">
                <span className="text-crwn-gold font-semibold">Recommendation:</span><br />
                Post acoustic snippet tonight — engagement predicted +32%
              </p>
            </div>
          </div>

          <div className="neu-inset rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">💡</span>
              <h3 className="text-lg font-semibold text-crwn-text">Action Items</h3>
            </div>
            <div className="neu-raised p-4 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-crwn-gold">→</span>
                <div>
                  <p className="text-crwn-text">3 fans likely to upgrade to VIP</p>
                  <p className="text-crwn-text-dim text-sm">Suggested action: send exclusive preview</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

// Section 5: Community
function CommunitySection() {
  return (
    <Section className="bg-crwn-bg">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-crwn-text mb-4 text-center">
          Build a Real Fan Community
        </h2>
        <p className="text-xl text-crwn-text-secondary mb-12 text-center">
          Share updates, drop exclusive releases, and host live sessions for your supporters.
          Turn passive listeners into an active community.
        </p>

        <div className="neu-raised rounded-2xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 rounded-full neu-inset flex items-center justify-center text-lg">🎵</div>
            <div>
              <h3 className="text-crwn-text font-semibold">M3rcey</h3>
              <p className="text-crwn-text-dim text-sm">Just now</p>
            </div>
          </div>
          <p className="text-crwn-text text-lg mb-4">
            "Unreleased track dropping tonight for VIP members."
          </p>
          <div className="flex gap-6 text-crwn-text-secondary">
            <span className="flex items-center gap-1">
              <span className="text-crwn-gold">❤️</span> 128 likes
            </span>
            <span className="flex items-center gap-1">
              <span className="text-crwn-gold">💬</span> 34 comments
            </span>
            <span className="flex items-center gap-1">
              <span className="text-crwn-gold">🎧</span> 52 listening now
            </span>
          </div>
        </div>
      </div>
    </Section>
  );
}

// Section 6: Fan Relationships
function FanRelationshipsSection() {
  const topFans = [
    { name: 'Jordan', tier: 'VIP subscriber', duration: '8 months' },
    { name: 'Maya', tier: 'Top listener', plays: '34 plays this week' },
    { name: 'Devin', tier: 'Top sharer', shares: 'Shared your track 12 times' },
  ];

  return (
    <Section className="bg-crwn-bg">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-crwn-text mb-4 text-center">
          Own Your Fan Relationships
        </h2>
        <p className="text-xl text-crwn-text-secondary mb-12 text-center">
          See who your top supporters are and understand what your audience engages with most.
          Your audience, your data, your business.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="neu-raised rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-crwn-gold mb-4">Top Supporters</h3>
            <div className="space-y-4">
              {topFans.map((fan, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full neu-inset flex items-center justify-center text-crwn-gold font-bold">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-crwn-text font-medium">{fan.name}</p>
                    <p className="text-crwn-text-dim text-sm">{fan.tier} ({fan.duration || fan.plays || fan.shares})</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="neu-inset rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-crwn-text mb-4">Audience Insights</h3>
            <div className="space-y-3">
              <div>
                <p className="text-crwn-text-dim text-sm">Top Cities</p>
                <p className="text-crwn-text">Chicago, Atlanta, London</p>
              </div>
              <div>
                <p className="text-crwn-text-dim text-sm">Top Genres</p>
                <p className="text-crwn-text">Hip-Hop, R&B, Afrobeats</p>
              </div>
              <div>
                <p className="text-crwn-text-dim text-sm">Avg. Listen Time</p>
                <p className="text-crwn-text">18 minutes</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

// Section 7: Founding Artists
function FoundingArtistSection() {
  const [count, setCount] = useState(0);
  const [spotsLeft, setSpotsLeft] = useState(500);
  const [isLoaded, setIsLoaded] = useState(false);
  const { ref: sectionRef, isInView } = useInView();

  useEffect(() => {
    fetch('/api/founding-artist')
      .then(res => res.json())
      .then(data => {
        setCount(data.foundingArtists || 0);
        setSpotsLeft(data.spotsLeft || 500);
        setIsLoaded(true);
      })
      .catch(() => setIsLoaded(true));
  }, []);

  useEffect(() => {
    if (!isInView || !isLoaded || count === 0) return;
    // Animate from 0 to count
    let start = 0;
    const interval = setInterval(() => {
      start += Math.ceil(count / 30);
      if (start >= count) {
        setCount(count);
        clearInterval(interval);
      } else {
        setCount(start);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [isInView, isLoaded, count]);

  return (
    <Section className="bg-crwn-bg">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-4xl md:text-5xl font-bold text-crwn-text mb-4">
          Founding Artist Program
        </h2>
        <p className="text-xl text-crwn-text-secondary mb-8">
          The first 500 artists receive reduced platform fees and early access to new features.
          Help shape the future of fan-powered music.
        </p>

        <div ref={sectionRef} className="neu-raised rounded-2xl p-8 inline-block">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-4xl">👑</span>
            <span className="text-2xl font-bold text-crwn-gold">Founding Artist</span>
          </div>
          <div className="text-6xl font-bold text-crwn-gold mb-4">
            {isLoaded ? count : '...'} / 500
          </div>
          <div className="w-64 mx-auto h-2 bg-crwn-surface rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#9a7b2a] to-crwn-gold transition-all duration-1000"
              style={{ width: `${isLoaded ? (count / 500) * 100 : 0}%` }}
            />
          </div>
          <p className="text-crwn-text-dim mt-4">
            {isLoaded ? spotsLeft : '...'} spots remaining
          </p>
        </div>
      </div>
    </Section>
  );
}

// Section 8: Final CTA
function CTASection() {
  return (
    <Section className="bg-crwn-bg pb-32">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-4xl md:text-5xl font-bold text-crwn-text mb-4">
          Build Your Artist Business
        </h2>
        <p className="text-xl text-crwn-text-secondary mb-8">
          Artists don't need labels to build sustainable careers — they need real fans.
          CRWN gives you the tools to make it happen.
        </p>
        <Link href="/signup" className="neu-button-accent px-12 py-4 text-crwn-bg font-bold rounded-xl text-xl inline-block">
          Get Started
        </Link>
      </div>
    </Section>
  );
}

// Footer
function Footer() {
  return (
    <footer className="bg-crwn-bg border-t border-crwn-elevated py-8">
      <div className="max-w-7xl mx-auto px-4 text-center text-crwn-text-dim">
        <p>© 2026 CRWN. All rights reserved.</p>
      </div>
    </footer>
  );
}

// Main Homepage
export default function Homepage() {
  return (
    <div className="min-h-screen bg-crwn-bg">
      <Navigation />
      <main>
        <HeroSection />
        <FansMathSection />
        <MonetizeSection />
        <AISection />
        <CommunitySection />
        <FanRelationshipsSection />
        <FoundingArtistSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
