'use client';

import { useRef, useState } from 'react';
import { LM_EVENTS, trackLeadMagnet } from '@/lib/leadMagnets/analytics';
import { useViewportExposure } from '@/hooks/useViewportExposure';
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

  // EXPOSURE, not mount. This event was first wired from a mount effect, which counted a card
  // sitting below the fold as "viewed" and would have made every rate measured against it wrong in
  // the flattering direction. It now requires the card to actually be on screen and STAY there, so
  // the smooth scroll from the "Build my ..." CTA cannot manufacture an exposure on its way past.
  const exposureRef = useRef<HTMLDivElement>(null);
  useViewportExposure(exposureRef, {
    key: `crwn_capture_seen:${config.slug}`,
    onExposed: () => trackLeadMagnet(LM_EVENTS.leadCaptureViewed, { toolSlug: config.slug, context: 'public' }),
  });

  const set = <K extends keyof LeadCaptureValues>(k: K, val: LeadCaptureValues[K]) => setV((prev) => ({ ...prev, [k]: val }));

  const submit = () => {
    if (!EMAIL_RE.test(v.email.trim())) return setError('Enter a valid email so we can send your result.');
    // The attempt is recorded with its consent state BEFORE the consent guard, so "typed an email
    // but did not tick the box" is distinguishable from "never engaged". Without it, a consent-copy
    // problem and a nobody-scrolled-here problem look identical in the data, which is exactly the
    // ambiguity that made the previous zero-capture diagnosis unprovable.
    trackLeadMagnet(LM_EVENTS.leadSubmitted, {
      toolSlug: config.slug,
      context: 'public',
      reasonCode: v.emailConsent ? 'consented' : 'no_consent',
    });
    if (!v.emailConsent) return setError('Please check the box to get your result by email.');
    setError('');
    onSubmit({ ...v, email: v.email.trim() });
  };

  return (
    <div ref={exposureRef} className="space-y-3">
      {/* NOT a gate. The result is already visible above. This is the optional "send me a
          copy" ask, the same way /worth does it.

          The old version headlined "Want a copy of this?" and offered filing: a plan you can still
          have later. That is a weak reason to hand over an email, and production agreed (zero leads
          ever captured). It now names what actually arrives, because the follow-up IS the value and
          the sequence genuinely delivers these three things. */}
      {/* Kept SHORT on purpose. Measured on a 375x667 phone, the three-line version pushed the card
          to 511px, so barely any of it cleared the fold and the primary CTA scrolled past what was
          left. Height here is not cosmetic: it decides whether the offer is ever seen on a small
          screen. Say the thing in one line. */}
      <div>
        <h2 className="text-xl font-bold text-crwn-text">Want the plan behind this number?</h2>
        <p className="text-sm text-crwn-text-secondary mt-1">
          Your result, then the first move, the order to invite fans, and how to run it alongside the tools you already use.
        </p>
      </div>

      {/* Two fields. Genre, social handle and phone were collected here for months and read by
          nothing in the codebase, so they were pure friction on an optional ask. The capture API
          still accepts them, so nothing server-side changed. */}
      <input className={INPUT} type="text" placeholder="Artist name" value={v.artistName} onChange={(e) => set('artistName', e.target.value)} />
      <input className={INPUT} type="email" placeholder="Email *" value={v.email} onChange={(e) => set('email', e.target.value)} />

      <label className="flex gap-3 items-start cursor-pointer">
        <input type="checkbox" className="mt-1 accent-[#D4AF37] w-4 h-4" checked={v.emailConsent} onChange={(e) => set('emailConsent', e.target.checked)} />
        <span className="text-xs text-crwn-text-secondary leading-relaxed">{config.leadCapture.consentCopy}</span>
      </label>

      {error && <p className="text-xs text-crwn-error">{error}</p>}

      {/* SECONDARY, deliberately not gold. Since 2026-08-15 this card renders ABOVE the builder, so
          a gold pill here sits directly under ResultToBuilder's gold "Build my ..." CTA and reads as
          the primary next step. Rendered side by side it was actually the LOUDER of the two, because
          it is full width. The builder is the primary action; this is the optional continuation. */}
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="w-full py-3.5 rounded-full bg-crwn-elevated text-crwn-text font-semibold border border-crwn-elevated hover:border-crwn-gold/40 transition-colors disabled:opacity-40"
      >
        {/* Never "unlock": the result is already on the screen above this form. The button says
            what the email actually does, in the tool's own words. */}
        {submitting ? 'Sending…' : config.cta.publicSecondary || 'Email me a copy'}
      </button>

      <p className="text-[11px] text-crwn-text-secondary text-center leading-snug">
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
