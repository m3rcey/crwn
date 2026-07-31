'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Send, Mail, HelpCircle, CreditCard, Music, Flag, Loader2, CheckCircle, Search, GraduationCap, ArrowRight } from 'lucide-react';
import { guides } from '@/app/(public)/getting-started/guides/guideContent';
import { SupportChatPanel } from '@/components/support/SupportChatPanel';

const categories = [
  { value: 'General', icon: HelpCircle, label: 'General Question' },
  { value: 'Billing', icon: CreditCard, label: 'Billing & Payments' },
  { value: 'Artist Account', icon: Music, label: 'Artist Account' },
  { value: 'Bug Report', icon: Flag, label: 'Bug Report' },
];

// Search across the real guide library: titles, subtitles, step content, pro tips.
// Every hit deep-links into /getting-started/guides/[slug], so help written once
// serves the guide pages, this search, and the chat assistant's knowledge base.
function searchGuides(query: string) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  return guides
    .map((g) => {
      const haystack = [
        g.title,
        g.subtitle,
        g.category,
        ...g.steps.map((s) => `${s.title} ${s.content}`),
        ...g.proTips,
      ]
        .join(' ')
        .toLowerCase();
      const titleHay = `${g.title} ${g.subtitle}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (titleHay.includes(t)) score += 3;
        else if (haystack.includes(t)) score += 1;
      }
      return { guide: g, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function ContactForm() {
  const [formData, setFormData] = useState({ name: '', email: '', category: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error();
      setStatus('sent');
      setFormData({ name: '', email: '', category: '', message: '' });
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="bg-crwn-surface rounded-xl p-8 text-center">
        <CheckCircle className="w-12 h-12 text-crwn-gold mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-crwn-text mb-2">Message Sent</h2>
        <p className="text-crwn-text-secondary mb-6">
          We&apos;ve sent a confirmation to your email. Our team will respond as soon as possible.
        </p>
        <button onClick={() => setStatus('idle')} className="text-crwn-gold hover:underline text-sm">
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="name" className="block text-sm text-crwn-text-secondary mb-1.5">
            Name
          </label>
          <input
            id="name"
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-4 py-2.5 text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold transition-colors"
            placeholder="Your name"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm text-crwn-text-secondary mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-4 py-2.5 text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold transition-colors"
            placeholder="you@email.com"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-crwn-text-secondary mb-1.5">Category</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {categories.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFormData({ ...formData, category: value })}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors ${
                formData.category === value
                  ? 'border-crwn-gold bg-crwn-gold/10 text-crwn-gold'
                  : 'border-crwn-elevated bg-crwn-surface text-crwn-text-secondary hover:border-crwn-text-secondary'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs text-center">{label}</span>
            </button>
          ))}
        </div>
        <input tabIndex={-1} className="opacity-0 h-0 w-0 absolute" required value={formData.category} onChange={() => {}} />
      </div>

      <div>
        <label htmlFor="message" className="block text-sm text-crwn-text-secondary mb-1.5">
          Message
        </label>
        <textarea
          id="message"
          required
          rows={5}
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-4 py-2.5 text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold transition-colors resize-none"
          placeholder="Describe your issue or question..."
        />
      </div>

      {status === 'error' && (
        <p className="text-red-400 text-sm">
          Something went wrong. Please try again or email us directly at support@thecrwn.app.
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="flex items-center justify-center gap-2 w-full sm:w-auto bg-crwn-gold text-black font-semibold px-8 py-3 rounded-full hover:bg-crwn-gold/90 transition-colors disabled:opacity-50"
      >
        {status === 'sending' ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Send Message
          </>
        )}
      </button>
    </form>
  );
}

export default function SupportPage() {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchGuides(query), [query]);

  return (
    <div className="min-h-screen bg-crwn-bg">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/home" className="text-crwn-gold hover:underline text-sm mb-8 inline-block">
          ← Back to CRWN
        </Link>

        <h1 className="text-3xl font-bold text-crwn-gold mb-2">How can we help?</h1>
        <p className="text-crwn-text-secondary mb-6">
          Search the guides, chat with us, or send a message. Every stuck minute is a fan not converted.
        </p>

        {/* Search across the guide library */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-crwn-text-secondary absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search: payouts, tiers, uploading, Stripe..."
            className="w-full bg-crwn-surface border border-crwn-elevated rounded-full pl-10 pr-4 py-3 text-crwn-text placeholder:text-crwn-text-secondary/60 focus:outline-none focus:border-crwn-gold transition-colors"
          />
        </div>

        {query.trim().length >= 2 && (
          <div className="mb-6 space-y-2">
            {results.length === 0 ? (
              <p className="text-sm text-crwn-text-secondary px-2">
                No guide covers that yet. Ask in the chat below and we will answer directly.
              </p>
            ) : (
              results.map(({ guide }) => (
                <Link
                  key={guide.slug}
                  href={`/getting-started/guides/${guide.slug}`}
                  className="flex items-center justify-between gap-3 bg-crwn-surface hover:bg-crwn-elevated rounded-xl px-4 py-3 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-crwn-text truncate">{guide.title}</p>
                    <p className="text-xs text-crwn-text-secondary truncate">{guide.subtitle}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-crwn-text-secondary shrink-0" />
                </Link>
              ))
            )}
          </div>
        )}

        {/* Getting started */}
        <Link
          href="/getting-started"
          className="flex items-center gap-4 bg-crwn-surface hover:bg-crwn-elevated rounded-xl p-5 mb-4 transition-colors"
        >
          <div className="w-11 h-11 rounded-full bg-crwn-gold/15 flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5 text-crwn-gold" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-crwn-text">Getting started guide</p>
            <p className="text-sm text-crwn-text-secondary">
              Step-by-step walkthroughs of every part of CRWN, from your page to your first payout.
            </p>
          </div>
        </Link>

        {/* Live chat: AI first, human when needed */}
        <div className="mb-10">
          <SupportChatPanel />
        </div>

        {/* Contact form fallback */}
        <h2 className="text-lg font-semibold text-crwn-text mb-1">Or send us a message</h2>
        <p className="text-sm text-crwn-text-secondary mb-5">We reply by email, usually within 24 to 48 hours.</p>
        <ContactForm />

        <div className="mt-12 pt-6 border-t border-crwn-elevated">
          <p className="text-crwn-text-secondary text-sm flex items-center gap-2">
            <Mail className="w-4 h-4" />
            You can also email us directly at{' '}
            <a href="mailto:support@thecrwn.app" className="text-crwn-gold hover:underline">
              support@thecrwn.app
            </a>
          </p>
        </div>

        <div className="mt-6 pt-6 border-t border-crwn-elevated text-center text-xs text-crwn-text-secondary">
          JNW Creative Enterprises, Inc. © 2026. All rights reserved.
        </div>
      </div>
    </div>
  );
}
