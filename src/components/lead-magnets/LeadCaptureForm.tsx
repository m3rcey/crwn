'use client';

import { useState } from 'react';
import type { LeadMagnetConfig } from '@/lib/leadMagnets/types';

export interface LeadCaptureValues {
  email: string;
  artistName: string;
  phone: string;
  genre: string;
  socialHandle: string;
  monthlyListeners: string;
  mainGoal: string;
  emailConsent: boolean;
}

const INPUT =
  'w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-4 py-3.5 text-base text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public lead capture. Email + explicit marketing consent required. Phone is optional
// (used only for a callback the lead asks for; CRWN sends no SMS). No prechecked boxes.
export function LeadCaptureForm({ config, submitting, onSubmit }: { config: LeadMagnetConfig; submitting: boolean; onSubmit: (v: LeadCaptureValues) => void }) {
  const [v, setV] = useState<LeadCaptureValues>({
    email: '',
    artistName: '',
    phone: '',
    genre: '',
    socialHandle: '',
    monthlyListeners: '',
    mainGoal: '',
    emailConsent: false,
  });
  const [error, setError] = useState('');

  const set = <K extends keyof LeadCaptureValues>(k: K, val: LeadCaptureValues[K]) => setV((prev) => ({ ...prev, [k]: val }));

  const submit = () => {
    if (!EMAIL_RE.test(v.email.trim())) return setError('Enter a valid email so we can send your result.');
    if (!v.emailConsent) return setError('Please check the box to get your result by email.');
    setError('');
    onSubmit({ ...v, email: v.email.trim() });
  };

  return (
    <div className="space-y-4">
      {/* NOT a gate. The result is already visible above. This is the optional "send me a
          copy" ask, the same way /worth does it. */}
      <div>
        <h2 className="text-xl font-bold text-crwn-text">Want a copy of this?</h2>
        <p className="text-sm text-crwn-text-secondary mt-1">Optional. We will email you this plan so you still have it later.</p>
      </div>

      <input className={INPUT} type="text" placeholder="Artist name" value={v.artistName} onChange={(e) => set('artistName', e.target.value)} />
      <input className={INPUT} type="email" placeholder="Email *" value={v.email} onChange={(e) => set('email', e.target.value)} />

      <div className="grid grid-cols-2 gap-3">
        <input className={INPUT} type="text" placeholder="Genre" value={v.genre} onChange={(e) => set('genre', e.target.value)} />
        <input className={INPUT} type="text" placeholder="@ handle" value={v.socialHandle} onChange={(e) => set('socialHandle', e.target.value)} />
      </div>

      <input className={INPUT} type="tel" placeholder="Phone (optional)" value={v.phone} onChange={(e) => set('phone', e.target.value)} />

      <label className="flex gap-3 items-start cursor-pointer">
        <input type="checkbox" className="mt-1 accent-[#D4AF37] w-4 h-4" checked={v.emailConsent} onChange={(e) => set('emailConsent', e.target.checked)} />
        <span className="text-xs text-crwn-text-secondary leading-relaxed">{config.leadCapture.consentCopy}</span>
      </label>

      {error && <p className="text-xs text-crwn-error">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="w-full py-3.5 rounded-full bg-crwn-gold text-crwn-bg font-semibold disabled:opacity-40"
      >
        {/* Never "unlock": the result is already on the screen above this form. The button says
            what the email actually does, in the tool's own words. */}
        {submitting ? 'Sending…' : config.cta.publicSecondary || 'Email me a copy'}
      </button>

      <p className="text-[11px] text-crwn-text-secondary text-center leading-relaxed">
        By continuing you agree to our{' '}
        <a href="/terms" className="underline">
          Terms
        </a>{' '}
        and{' '}
        <a href="/privacy" className="underline">
          Privacy Policy
        </a>
        . We do not sell your information.
      </p>
    </div>
  );
}
