'use client';

import Link from 'next/link';
import { Gift, Users, DollarSign, TrendingUp, ChevronRight, Clock } from 'lucide-react';

function MockRecruiterDashboard() {
  return (
    <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-4 max-w-sm mx-auto">
      <p className="text-white text-sm font-medium mb-3">Recruiter Dashboard</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-[#1a1a1a] rounded-lg p-3 text-center">
          <p className="text-green-400 text-xl font-bold">$475</p>
          <p className="text-[#666] text-[10px]">Total Earned</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg p-3 text-center">
          <p className="text-white text-xl font-bold">8</p>
          <p className="text-[#666] text-[10px]">Artists Referred</p>
        </div>
      </div>
      <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 mb-3">
        <p className="text-[#666] text-[10px] mb-1">Your referral link</p>
        <p className="text-crwn-gold text-xs font-medium">thecrwn.app/join/yourname</p>
      </div>
      <div className="space-y-1.5">
        {[
          { name: 'Artist A', status: 'Qualified', color: 'text-green-400' },
          { name: 'Artist B', status: 'Qualified', color: 'text-green-400' },
          { name: 'Artist C', status: 'Pending (Day 12)', color: 'text-crwn-gold' },
        ].map((a, i) => (
          <div key={i} className="flex items-center justify-between bg-[#1a1a1a] rounded-lg px-3 py-2">
            <p className="text-[#999] text-xs">{a.name}</p>
            <span className={`text-[10px] ${a.color}`}>{a.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockPayoutHistory() {
  return (
    <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-4 max-w-sm mx-auto">
      <p className="text-white text-sm font-medium mb-3">Payout History</p>
      <div className="space-y-2">
        {[
          { desc: 'Flat fee - Artist A qualified', amount: '$50.00', date: 'Mar 1' },
          { desc: 'Flat fee - Artist B qualified', amount: '$50.00', date: 'Feb 15' },
          { desc: '5% recurring - Artist A (Pro)', amount: '$2.45', date: 'Feb 1' },
          { desc: 'First referral bonus', amount: '$50.00', date: 'Jan 20' },
        ].map((p, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-[#1a1a1a]">
            <div>
              <p className="text-[#999] text-xs">{p.desc}</p>
              <p className="text-[#666] text-[10px]">{p.date}</p>
            </div>
            <p className="text-green-400 text-sm font-medium">{p.amount}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockReferralLink() {
  return (
    <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-4 max-w-sm mx-auto">
      <p className="text-white text-sm font-medium mb-3">Share Your Link</p>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 bg-[#0f0f0f] rounded-full px-4 py-2.5">
          <p className="text-crwn-gold text-sm">thecrwn.app/join/yourname</p>
        </div>
        <div className="bg-crwn-gold rounded-full px-3 py-2.5">
          <p className="text-[#0a0a0a] text-xs font-bold">Copy</p>
        </div>
      </div>
      <p className="text-[#666] text-xs text-center">When an artist signs up through your link and stays on a paid plan for 30 days, you get paid.</p>
    </div>
  );
}

export default function RecruitPitchPage() {
  const tiers = [
    { name: 'First Referral', threshold: '1st artist', flat: '$50', recurring: '--', window: '--' },
    { name: 'Starter', threshold: '2-5 artists', flat: '$25/each', recurring: '--', window: '--' },
    { name: 'Connector', threshold: '6-15 artists', flat: '$50/each', recurring: '5% monthly', window: '12 months' },
    { name: 'Ambassador', threshold: '16+ artists', flat: '$75/each', recurring: '10% monthly', window: '12 months' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-green-500/5 to-transparent" />
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
            <DollarSign className="w-4 h-4 text-green-400" />
            <span className="text-green-400 text-sm font-medium">Earn real money</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">Get Paid to Bring Artists to CRWN</h1>
          <p className="text-lg md:text-xl text-[#999] max-w-2xl mx-auto mb-8">Know talented artists? Share your unique link. When they join a paid plan and stick around for 30 days, you earn cash. The more you refer, the more you make.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/signup" className="bg-green-500 text-white font-semibold px-8 py-4 rounded-full text-lg hover:bg-green-600 transition-colors inline-flex items-center justify-center gap-2">Become a Recruiter <ChevronRight className="w-5 h-5" /></Link>
            <a href="#how-it-works" className="px-8 py-4 text-lg text-[#999] hover:text-white transition-colors">See How It Works</a>
          </div>
        </div>
      </div>
      <div id="how-it-works" className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">How It Works</h2>
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { icon: Gift, title: 'Get Your Link', desc: 'Sign up and get a unique referral URL you can share anywhere.' },
            { icon: Users, title: 'Refer Artists', desc: 'Share your link with artists you know. They sign up through it.' },
            { icon: Clock, title: '30 Day Window', desc: 'The artist stays on a paid plan for 30 days to qualify.' },
            { icon: DollarSign, title: 'Get Paid', desc: 'Flat fee hits your Stripe. Recurring commissions follow monthly.' },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                <s.icon className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-white font-semibold mb-1">{s.title}</h3>
              <p className="text-[#999] text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-3xl font-bold text-white mb-4">One Link, Unlimited Potential</h2>
            <p className="text-[#999] leading-relaxed mb-4">Your referral link is clean and memorable. Put it in your bio, text it to friends, or share it in group chats. Every artist who signs up through it is tracked to you.</p>
            <p className="text-[#999] leading-relaxed">No complicated setup. No minimum requirements. Just share and earn.</p>
          </div>
          <MockReferralLink />
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-4">The More You Refer, the More You Earn</h2>
        <p className="text-[#999] text-center mb-12 max-w-xl mx-auto">Your tier upgrades automatically as you hit milestones. Higher tiers unlock bigger flat fees and recurring monthly commissions.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2a2a]">
                <th className="text-left py-3 text-[#666] font-medium">Tier</th>
                <th className="text-left py-3 text-[#666] font-medium">Threshold</th>
                <th className="text-left py-3 text-[#666] font-medium">Flat Fee</th>
                <th className="text-left py-3 text-[#666] font-medium">Recurring</th>
                <th className="text-left py-3 text-[#666] font-medium">Window</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, i) => (
                <tr key={i} className="border-b border-[#1a1a1a]">
                  <td className="py-4 text-green-400 font-medium">{tier.name}</td>
                  <td className="py-4 text-white">{tier.threshold}</td>
                  <td className="py-4 text-white">{tier.flat}</td>
                  <td className="py-4 text-white">{tier.recurring}</td>
                  <td className="py-4 text-white">{tier.window}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[#666] mt-4 text-center">Recurring commissions are based on the artist's monthly subscription fee to CRWN (Pro $49, Label $149, Empire $349). Artists must stay 30 days to qualify.</p>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <MockRecruiterDashboard />
          <div>
            <h2 className="text-3xl font-bold text-white mb-4">Track Everything From Your Dashboard</h2>
            <p className="text-[#999] leading-relaxed mb-4">See which artists signed up, who is in their 30-day qualifying period, and who has fully qualified. Your earnings update in real time.</p>
            <p className="text-[#999] leading-relaxed">Connect your Stripe account once and payouts happen automatically.</p>
          </div>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-3xl font-bold text-white mb-4">Real Money, Sent Directly to You</h2>
            <p className="text-[#999] leading-relaxed mb-4">Flat fees are paid when an artist qualifies. Recurring commissions are paid on the 1st of every month. Everything goes straight to your Stripe account.</p>
            <p className="text-[#999] leading-relaxed">No minimum payout threshold. No waiting 60 days. You earn it, you get it.</p>
          </div>
          <MockPayoutHistory />
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">What Could You Earn?</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { artists: 3, total: '$125', desc: '3 artists on Pro plans. $50 first referral + $25 x 2 = $125 in flat fees.' },
            { artists: 10, total: '$794', desc: '10 artists on Pro. $500 in flat fees + $24.50/mo recurring for 12 months.' },
            { artists: 20, total: '$5,070', desc: '20 artists (mixed plans). $1,500 flat fees + $297.50/mo recurring for 12 months.' },
          ].map((ex, i) => (
            <div key={i} className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-6 text-center">
              <p className="text-white text-sm mb-2">{ex.artists} artists referred</p>
              <p className="text-green-400 text-3xl font-bold mb-3">{ex.total}</p>
              <p className="text-[#999] text-xs leading-relaxed">{ex.desc}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Start Earning Today</h2>
        <p className="text-[#999] text-lg mb-8 max-w-xl mx-auto">Free to join. No experience needed. If you know artists who deserve a better platform, this is how you help them and get paid doing it.</p>
        <Link href="/signup" className="bg-green-500 text-white font-semibold px-10 py-4 rounded-full text-lg hover:bg-green-600 transition-colors inline-flex items-center gap-2">Become a Recruiter <ChevronRight className="w-5 h-5" /></Link>
        <p className="text-[#666] text-xs mt-4">Free to join. Just need a CRWN account and a Stripe account for payouts.</p>
      </div>
      <div className="border-t border-[#1a1a1a] py-8 text-center">
        <p className="text-[#666] text-xs">JNW Creative Enterprises, Inc. &copy; {new Date().getFullYear()}. <Link href="/terms" className="text-crwn-gold hover:underline">Terms</Link> &middot; <Link href="/privacy" className="text-crwn-gold hover:underline">Privacy</Link></p>
      </div>
    </div>
  );
}
