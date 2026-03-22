'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Send, Mail, HelpCircle, CreditCard, Music, Flag, Loader2, CheckCircle } from 'lucide-react';

const categories = [
  { value: 'General', icon: HelpCircle, label: 'General Question' },
  { value: 'Billing', icon: CreditCard, label: 'Billing & Payments' },
  { value: 'Artist Account', icon: Music, label: 'Artist Account' },
  { value: 'Bug Report', icon: Flag, label: 'Bug Report' },
];

export default function SupportPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    category: '',
    message: '',
  });
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

  return (
    <div className="min-h-screen bg-crwn-bg">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/home" className="text-crwn-gold hover:underline text-sm mb-8 inline-block">
          ← Back to CRWN
        </Link>

        <h1 className="text-3xl font-bold text-crwn-gold mb-2">Support</h1>
        <p className="text-crwn-text-secondary mb-8">
          Have a question or need help? Fill out the form below and we&apos;ll get back to you within 24–48 hours.
        </p>

        {status === 'sent' ? (
          <div className="bg-crwn-surface rounded-xl p-8 text-center">
            <CheckCircle className="w-12 h-12 text-crwn-gold mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-crwn-text mb-2">Message Sent</h2>
            <p className="text-crwn-text-secondary mb-6">
              We&apos;ve sent a confirmation to your email. Our team will respond as soon as possible.
            </p>
            <button
              onClick={() => setStatus('idle')}
              className="text-crwn-gold hover:underline text-sm"
            >
              Send another message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name & Email */}
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
                  className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-4 py-2.5 text-crwn-text placeholder:text-crwn-text-dim focus:outline-none focus:border-crwn-gold transition-colors"
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
                  className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-4 py-2.5 text-crwn-text placeholder:text-crwn-text-dim focus:outline-none focus:border-crwn-gold transition-colors"
                  placeholder="you@email.com"
                />
              </div>
            </div>

            {/* Category */}
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
                        : 'border-crwn-elevated bg-crwn-surface text-crwn-text-secondary hover:border-crwn-text-dim'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs text-center">{label}</span>
                  </button>
                ))}
              </div>
              {/* Hidden required input for category validation */}
              <input
                tabIndex={-1}
                className="opacity-0 h-0 w-0 absolute"
                required
                value={formData.category}
                onChange={() => {}}
              />
            </div>

            {/* Message */}
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
                className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-4 py-2.5 text-crwn-text placeholder:text-crwn-text-dim focus:outline-none focus:border-crwn-gold transition-colors resize-none"
                placeholder="Describe your issue or question..."
              />
            </div>

            {status === 'error' && (
              <p className="text-red-400 text-sm">Something went wrong. Please try again or email us directly at support@thecrwn.app.</p>
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
        )}

        {/* Direct contact */}
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
