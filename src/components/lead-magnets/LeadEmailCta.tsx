'use client';

// Above-the-fold squeeze CTA: collect the email, then sign up directly under it.
//
// Two asks, stacked, in the order that respects intent: the low-commitment one first (email me
// the breakdown), the high-commitment one right beneath it (sign up and build it). The email
// capture reuses the proven public /api/leads/calculator endpoint (upserts crm_contacts and
// emails the breakdown), so nothing new touches the database.

import { useState } from 'react';
import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';

export function LeadEmailCta({
  claimed,
  claimHref,
  toolSlug,
  ctaLabel,
}: {
  claimed: boolean;
  claimHref: string;
  toolSlug: string;
  /** Feature-specific continuation label, e.g. "Build My Membership". */
  ctaLabel?: string;
}) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  const submit = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setState('error');
      return;
    }
    setState('sending');
    try {
      const res = await fetch('/api/leads/calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: `${toolSlug} lead` }),
      });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-7">
      {state === 'done' ? (
        <div className="flex items-center gap-2 text-[#D4AF37]">
          <Check className="w-5 h-5" /> Sent. Check your inbox for the full breakdown.
        </div>
      ) : (
        <>
          <h3 className="font-semibold text-lg mb-1.5 tracking-tight">Get the full breakdown in your inbox</h3>
          <p className="text-white/50 mb-4 text-sm leading-relaxed max-w-md">
            Every number here, plus the exact setup to capture it. No spam.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (state === 'error') setState('idle');
              }}
              placeholder="you@email.com"
              className="flex-1 px-4 py-3 bg-crwn-bg border border-white/[0.12] rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-[#D4AF37] transition"
            />
            <button
              onClick={submit}
              disabled={state === 'sending'}
              className="px-6 py-3 bg-white/[0.06] text-white font-medium rounded-full hover:bg-white/[0.1] transition disabled:opacity-50 whitespace-nowrap"
            >
              {state === 'sending' ? 'Sending' : 'Email it to me'}
            </button>
          </div>
          {state === 'error' && <p className="text-xs text-red-400 mt-2">Enter a valid email and try again.</p>}
        </>
      )}

      <Link
        href={claimed ? '/profile/artist' : claimHref}
        className="mt-4 w-full flex items-center justify-center gap-2 bg-[#D4AF37] text-black font-semibold py-3.5 px-6 rounded-full hover:opacity-90 transition"
      >
        {claimed ? 'Open your dashboard' : ctaLabel || 'Sign up free and build this'}
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
