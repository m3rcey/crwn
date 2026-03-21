'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Crown, DollarSign, Repeat, Check } from 'lucide-react';

interface FormData {
  name: string;
  email: string;
  platform: string;
  audienceSize: string;
  profileUrl: string;
  whyCrwn: string;
}

const earningsData: Record<number, { flat: number; recurring: number; total: number }> = {
  5: { flat: 3000, recurring: 1650, total: 4650 },
  10: { flat: 6000, recurring: 3300, total: 9300 },
  20: { flat: 12000, recurring: 6600, total: 18600 },
  50: { flat: 30000, recurring: 16500, total: 46500 },
};

export default function PartnerPage() {
  const [artistsPerMonth, setArtistsPerMonth] = useState(10);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    platform: '',
    audienceSize: '',
    profileUrl: '',
    whyCrwn: '',
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const earnings = earningsData[artistsPerMonth];

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.email || !formData.platform || !formData.audienceSize || !formData.profileUrl) {
      setErrorMessage('Please fill in all required fields.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const res = await fetch('/api/partner/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          platform: formData.platform,
          audience_size: formData.audienceSize,
          profile_url: formData.profileUrl,
          why_crwn: formData.whyCrwn,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to submit application');
      }

      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMessage('Something went wrong. Please try again.');
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] page-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#D4AF37]/5 to-transparent" />
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24 text-center relative z-10">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Earn While You <span className="text-[#D4AF37]">Put Artists On</span>
          </h1>
          <p className="text-lg md:text-xl text-[#999] max-w-2xl mx-auto mb-8">
            Partner with CRWN and earn every time an artist you refer joins. Free Empire access. Real money. No cap.
          </p>
          <a
            href="#apply"
            className="inline-block bg-[#D4AF37] text-black font-semibold px-8 py-4 rounded-full text-lg hover:bg-[#c9a136] transition-colors"
          >
            Become a Partner
          </a>
        </div>
      </div>

      {/* What You Get */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">What You Get</h2>
        <div className="grid md:grid-cols-3 gap-6 stagger-fade-in">
          {[
            {
              icon: Crown,
              title: 'Free Empire Tier',
              desc: 'Full access to CRWN\'s top platform tier ($350/mo value) for 12 months. Use it. Make content about it. Keep it.',
            },
            {
              icon: DollarSign,
              title: '$50 Per Artist',
              desc: 'Every artist who signs up through your link and goes paid = $50 in your pocket. Flat. Simple.',
            },
            {
              icon: Repeat,
              title: '10% Recurring',
              desc: 'Earn 10% of every referred artist\'s monthly subscription for 12 months. 20 artists at $50/mo avg = $1,200/yr passive.',
            },
          ].map((benefit, i) => (
            <div key={i} className="bg-[#1a1a1a] rounded-2xl p-6">
              <benefit.icon className="w-8 h-8 text-[#D4AF37] mb-4" />
              <h3 className="text-white font-semibold mb-2">{benefit.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{benefit.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">How It Works</h2>
        <div className="flex flex-col md:flex-row justify-between md:gap-4 relative">
          {/* Gold connecting line */}
          <div className="hidden md:block absolute top-4 left-[calc(12.5%+8px)] right-[calc(12.5%+8px)] h-0.5 bg-[#D4AF37]/30" />
          {[
            { step: '1', title: 'Apply below', desc: 'Tell us about your audience and platforms.' },
            { step: '2', title: 'Get your link', desc: 'We set you up with a custom /join/[code] partner link and free Empire access.' },
            { step: '3', title: 'Create content', desc: 'Talk about CRWN however feels natural to you. Reviews, tutorials, rants — your style.' },
            { step: '4', title: 'Get paid', desc: 'Track signups in your dashboard. Cash out via Stripe.' },
          ].map((item, i) => (
            <div key={i} className="flex-1 text-center relative md:px-2">
              <div className="w-8 h-8 rounded-full bg-[#D4AF37] text-black font-bold flex items-center justify-center mx-auto mb-4 relative z-10">
                {item.step}
              </div>
              <h3 className="text-white font-semibold mb-2">{item.title}</h3>
              <p className="text-zinc-400 text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Earnings Calculator */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-4">What Could You Earn?</h2>
        <p className="text-zinc-400 text-center mb-12 max-w-xl mx-auto">
          Estimate your Year 1 earnings based on how many artists you refer per month.
        </p>

        {/* Selector buttons */}
        <div className="flex justify-center gap-3 mb-8">
          {[5, 10, 20, 50].map((count) => (
            <button
              key={count}
              onClick={() => setArtistsPerMonth(count)}
              className={`px-6 py-3 rounded-full font-medium transition-colors ${
                artistsPerMonth === count
                  ? 'bg-[#D4AF37] text-black'
                  : 'bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]'
              }`}
            >
              {count}/mo
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="bg-[#1a1a1a] rounded-2xl p-6 max-w-md mx-auto">
          <div className="grid gap-4">
            <div className="flex justify-between items-center py-3 border-b border-[#2a2a2a]">
              <span className="text-zinc-400">Flat Fee Earnings:</span>
              <span className="text-white font-semibold">${earnings.flat.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-[#2a2a2a]">
              <span className="text-zinc-400">Recurring Earnings:</span>
              <span className="text-white font-semibold">${earnings.recurring.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-white font-semibold">Year 1 Total:</span>
              <span className="text-[#D4AF37] font-bold text-xl">${earnings.total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Who This Is For */}
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-white text-lg font-semibold mb-4">
          This program is for music industry creators, educators, and tastemakers.
        </p>
        <p className="text-zinc-400 max-w-2xl mx-auto">
          If you make content about the business of music, produce tutorials, review tools for artists, or have an audience of independent musicians — this is for you.
        </p>
      </div>

      {/* Apply Section */}
      <div id="apply" className="max-w-xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-8">Apply to Partner</h2>

        {status === 'success' ? (
          <div className="bg-[#1a1a1a] rounded-2xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[#D4AF37]/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-[#D4AF37]" />
            </div>
            <p className="text-white font-semibold text-lg mb-2">Application received.</p>
            <p className="text-zinc-400">We&apos;ll be in touch within 48 hours.</p>
          </div>
        ) : (
          <div className="bg-[#1a1a1a] rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-white text-sm font-medium mb-2">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:border-[#D4AF37] focus:outline-none"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:border-[#D4AF37] focus:outline-none"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Primary Platform *</label>
              <select
                value={formData.platform}
                onChange={(e) => handleInputChange('platform', e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#D4AF37] focus:outline-none"
              >
                <option value="">Select platform</option>
                <option value="tiktok">TikTok</option>
                <option value="youtube">YouTube</option>
                <option value="instagram">Instagram</option>
                <option value="twitter">Twitter/X</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Audience Size *</label>
              <select
                value={formData.audienceSize}
                onChange={(e) => handleInputChange('audienceSize', e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#D4AF37] focus:outline-none"
              >
                <option value="">Select size</option>
                <option value="under_5k">Under 5K</option>
                <option value="5k_25k">5K-25K</option>
                <option value="25k_100k">25K-100K</option>
                <option value="100k_500k">100K-500K</option>
                <option value="500k_plus">500K+</option>
              </select>
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Link to Your Profile *</label>
              <input
                type="text"
                value={formData.profileUrl}
                onChange={(e) => handleInputChange('profileUrl', e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:border-[#D4AF37] focus:outline-none"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-white text-sm font-medium mb-2">Why CRWN? (optional)</label>
              <textarea
                value={formData.whyCrwn}
                onChange={(e) => handleInputChange('whyCrwn', e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:border-[#D4AF37] focus:outline-none resize-none"
                rows={3}
                placeholder="1-2 sentences on why you want to partner"
              />
            </div>

            {status === 'error' && errorMessage && (
              <p className="text-red-400 text-sm">{errorMessage}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={status === 'loading'}
              className="w-full bg-[#D4AF37] text-black font-semibold py-4 rounded-full text-lg hover:bg-[#c9a136] transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? 'Submitting...' : 'Apply to Partner'}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[#1a1a1a] py-8 text-center">
        <p className="text-[#666] text-xs">
          JNW Creative Enterprises, Inc. &copy; {new Date().getFullYear()}.{' '}
          <Link href="/terms" className="text-[#D4AF37] hover:underline">Terms</Link> &middot;{' '}
          <Link href="/privacy" className="text-[#D4AF37] hover:underline">Privacy</Link>
        </p>
      </div>
    </main>
  );
}
