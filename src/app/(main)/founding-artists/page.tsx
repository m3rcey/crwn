'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Crown, Percent, Star, TrendingUp, Music, Users, DollarSign, Shield, ChevronRight } from 'lucide-react';

function MockDashboard() {
  return (
    <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-4 max-w-sm mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-crwn-gold/20 flex items-center justify-center">
          <Music className="w-4 h-4 text-crwn-gold" />
        </div>
        <div>
          <p className="text-white text-sm font-medium">Artist Dashboard</p>
          <p className="text-[#666] text-xs">Your music career, one screen</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-[#1a1a1a] rounded-lg p-2 text-center">
          <p className="text-crwn-gold text-lg font-bold">$847</p>
          <p className="text-[#666] text-[10px]">This Month</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg p-2 text-center">
          <p className="text-white text-lg font-bold">234</p>
          <p className="text-[#666] text-[10px]">Subscribers</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg p-2 text-center">
          <p className="text-green-400 text-lg font-bold">+18%</p>
          <p className="text-[#666] text-[10px]">Growth</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {['New subscriber - The Wave', 'Album purchase - $4.99', 'Merch sale - $24.99'].map((item, i) => (
          <div key={i} className="flex items-center gap-2 bg-[#1a1a1a] rounded-lg px-3 py-2">
            <DollarSign className="w-3 h-3 text-green-400" />
            <p className="text-[#999] text-xs">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockArtistPage() {
  return (
    <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] overflow-hidden max-w-sm mx-auto">
      <div className="h-20 bg-gradient-to-r from-red-900/40 to-purple-900/40" />
      <div className="p-4 -mt-6">
        <div className="w-12 h-12 rounded-full bg-crwn-gold/30 border-2 border-[#141414] flex items-center justify-center mb-2">
          <span className="text-lg">🎤</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-white text-sm font-bold">Your Name</p>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-crwn-gold/15 text-crwn-gold">Founding Artist #42</span>
        </div>
        <p className="text-[#666] text-xs mb-3">Your bio goes here</p>
        <div className="flex gap-4 text-[10px] text-[#666] border-b border-[#2a2a2a] pb-2 mb-2">
          <span className="text-crwn-gold border-b border-crwn-gold pb-2">Music</span>
          <span>Tiers</span>
          <span>Shop</span>
          <span>Community</span>
        </div>
        <div className="space-y-1.5">
          {['Track 1', 'Track 2', 'Track 3'].map((t, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 border-b border-[#1a1a1a]">
              <div className="w-8 h-8 rounded bg-[#2a2a2a]" />
              <div>
                <p className="text-white text-xs">{t}</p>
                <p className="text-green-400 text-[10px]">Free</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockCommunity() {
  return (
    <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-4 max-w-sm mx-auto">
      <p className="text-white text-sm font-medium mb-3">Community</p>
      {['Just dropped a new track! Check it out 🔥', 'Studio session today, who wants to see behind the scenes?', 'Exclusive merch drop this Friday'].map((post, i) => (
        <div key={i} className="bg-[#1a1a1a] rounded-lg p-3 mb-2">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-full bg-crwn-gold/20" />
            <p className="text-white text-xs font-medium">Artist</p>
            <p className="text-[#666] text-[10px]">{i + 1}h ago</p>
          </div>
          <p className="text-[#999] text-xs">{post}</p>
        </div>
      ))}
    </div>
  );
}

export default function FoundingArtistsPage() {
  const [count, setCount] = useState(0);
  const [spotsLeft, setSpotsLeft] = useState(500);

  useEffect(() => {
    fetch('/api/founding-artist')
      .then(res => res.json())
      .then(data => {
        setCount(data.foundingArtists || 0);
        setSpotsLeft(data.spotsLeft || 500);
      })
      .catch(() => {});
  }, []);

  const benefits = [
    { icon: Percent, title: '1% Off Your Platform Fee', desc: 'Permanently lower fees than any other artist on CRWN. Stacks with every tier you upgrade to.' },
    { icon: Crown, title: 'Free Pro Plan for 1 Year', desc: 'Unlimited tracks, fan tiers, community, shop, and analytics. No monthly fee for your first year.' },
    { icon: Star, title: 'Founding Artist Badge', desc: 'A permanent badge on your profile showing you were one of the first. Early believers get recognized.' },
    { icon: TrendingUp, title: 'Priority Placement', desc: 'Featured on the Explore page and recommended to new fans joining the platform.' },
    { icon: Shield, title: 'Shape the Platform', desc: 'Direct input on new features. We build what founding artists need first.' },
    { icon: Users, title: 'Exclusive Community', desc: 'Connect with other founding artists. Collaborate, cross-promote, grow together.' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] page-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-crwn-gold/5 to-transparent" />
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-crwn-gold/10 border border-crwn-gold/20 mb-6">
            <Crown className="w-4 h-4 text-crwn-gold" />
            <span className="text-crwn-gold text-sm font-medium">{spotsLeft} spots remaining</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Be One of the First 500 Artists on CRWN
          </h1>
          <p className="text-lg md:text-xl text-[#999] max-w-2xl mx-auto mb-8">
            Founding artists get permanent perks that no one else will ever have access to. Lower fees, free Pro features, and a badge that proves you were here from day one.
          </p>
          <div className="inline-block mb-8">
            <div className="text-5xl font-bold text-crwn-gold mb-2">{count} / 500</div>
            <div className="w-48 mx-auto h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
              <div
                className="h-full bg-crwn-gold transition-all duration-1000"
                style={{ width: `${(count / 500) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/profile/artist?tab=profile" className="neu-button-accent px-8 py-4 text-lg">
              Claim Your Spot
            </Link>
            <a href="#benefits" className="px-8 py-4 text-lg text-[#999] hover:text-white transition-colors">
              Learn More
            </a>
          </div>
        </div>
      </div>

      {/* What You Get */}
      <div id="benefits" className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">What Founding Artists Get</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {benefits.map((b, i) => (
            <div key={i} className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-6">
              <div className="w-10 h-10 rounded-full bg-crwn-gold/10 flex items-center justify-center mb-3">
                <b.icon className="w-5 h-5 text-crwn-gold" />
              </div>
              <h3 className="text-white font-semibold mb-2">{b.title}</h3>
              <p className="text-[#999] text-sm leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Mock: Your Artist Page */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-3xl font-bold text-white mb-4">Your Own Artist Page</h2>
            <p className="text-[#999] leading-relaxed mb-4">
              A dedicated page at thecrwn.app/yourname where fans can stream your music, subscribe to tiers, shop your merch, and join your community. All in one place.
            </p>
            <p className="text-[#999] leading-relaxed">
              No algorithms deciding who sees your content. No middlemen taking 30%. Direct connection to your fans.
            </p>
          </div>
          <MockArtistPage />
        </div>
      </div>

      {/* Mock: Dashboard */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <MockDashboard />
          <div>
            <h2 className="text-3xl font-bold text-white mb-4">See Every Dollar in Real Time</h2>
            <p className="text-[#999] leading-relaxed mb-4">
              Your dashboard shows exactly how much you are earning, who your top fans are, and where your growth is coming from. No waiting weeks for reports.
            </p>
            <p className="text-[#999] leading-relaxed">
              Subscriptions, one-time purchases, merch sales, and tips all in one feed.
            </p>
          </div>
        </div>
      </div>

      {/* Mock: Community */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-3xl font-bold text-white mb-4">Build Real Community</h2>
            <p className="text-[#999] leading-relaxed mb-4">
              Post updates, share behind-the-scenes content, and interact directly with your supporters. Gate content by tier so your most loyal fans get the most access.
            </p>
            <p className="text-[#999] leading-relaxed">
              No more fighting for attention in a crowded feed. Your community, your rules.
            </p>
          </div>
          <MockCommunity />
        </div>
      </div>

      {/* How It Works */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">How to Join</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step: '1', title: 'Sign Up', desc: 'Create your free CRWN account in under a minute.' },
            { step: '2', title: 'Set Up Your Page', desc: 'Upload your music, set your tiers, and customize your artist page.' },
            { step: '3', title: 'Start Earning', desc: 'Share your page with fans and watch the revenue flow in.' },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <div className="w-12 h-12 rounded-full bg-crwn-gold text-[#0a0a0a] font-bold text-xl flex items-center justify-center mx-auto mb-4">
                {s.step}
              </div>
              <h3 className="text-white font-semibold mb-2">{s.title}</h3>
              <p className="text-[#999] text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Final CTA */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Only {spotsLeft} Spots Left
        </h2>
        <p className="text-[#999] text-lg mb-8 max-w-xl mx-auto">
          Once all 500 founding artist spots are taken, these perks are gone forever. Do not wait.
        </p>
        <Link href="/profile/artist?tab=profile" className="neu-button-accent px-10 py-4 text-lg inline-flex items-center gap-2">
          Claim Your Spot <ChevronRight className="w-5 h-5" />
        </Link>
        <p className="text-[#666] text-xs mt-4">Free to sign up. No credit card required.</p>
      </div>

      {/* Footer */}
      <div className="border-t border-[#1a1a1a] py-8 text-center">
        <p className="text-[#666] text-xs">
          JNW Creative Enterprises, Inc. &copy; {new Date().getFullYear()}.{' '}
          <Link href="/terms" className="text-crwn-gold hover:underline">Terms</Link> &middot;{' '}
          <Link href="/privacy" className="text-crwn-gold hover:underline">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
