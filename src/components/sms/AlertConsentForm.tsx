'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ShieldCheck } from 'lucide-react';
import {
  ALERT_CONSENT_FOOTNOTE,
  ALERT_CONSENT_TEXT,
} from '@/lib/sms/alertConsent';

// The consent control itself. It renders the SAME constant the server stores, so what a person
// saw and what the record says cannot drift.
//
// The checkbox starts unchecked and is never programmatically checked: a pre-selected box is not
// consent, and Twilio names it as a rejection cause. Submit stays disabled until the number looks
// like a real number AND the box is ticked, but the browser is not the gate. The server re-checks
// both, normalizes the number itself, and ignores any consent text the client sends.
export function AlertConsentForm() {
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'submitting' | 'recorded'>('idle');
  const [error, setError] = useState('');
  const [consentedAt, setConsentedAt] = useState<string | null>(null);

  const phoneLooksValid = phone.replace(/\D/g, '').length >= 10;
  const canSubmit = phoneLooksValid && consent && state !== 'submitting';

  const submit = async () => {
    setError('');
    if (!canSubmit) return;
    setState('submitting');
    try {
      const res = await fetch('/api/sms-alert-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only the number and the boolean. The disclosure is the server's, not ours to assert.
        body: JSON.stringify({ phone, consent: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not record your consent');
      setConsentedAt(typeof data.consentedAt === 'string' ? data.consentedAt : null);
      setState('recorded');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record your consent');
      setState('idle');
    }
  };

  if (state === 'recorded') {
    return (
      <div className="rounded-2xl bg-crwn-surface border border-crwn-gold/40 p-5">
        <p className="text-sm font-semibold text-crwn-gold flex items-center gap-2">
          <Check className="w-4 h-4" aria-hidden="true" /> Consent recorded
        </p>
        <p className="text-sm text-crwn-text-secondary mt-2 leading-relaxed">
          Your consent to receive internal CRWN operational lead alerts by SMS has been recorded
          {consentedAt ? ` on ${new Date(consentedAt).toUTCString()}` : ''}. We stored the number
          you entered, the exact language you agreed to, and the time you agreed to it.
        </p>
        <p className="text-sm text-crwn-text-secondary mt-2 leading-relaxed">
          No text message was sent by submitting this form. You can stop the alerts at any time by
          replying STOP to any message, or reply HELP for help.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-crwn-surface border border-crwn-elevated p-5 space-y-4">
      <div>
        <label htmlFor="alert-phone" className="block text-sm font-semibold text-crwn-text mb-1.5">
          Company-designated mobile number
        </label>
        <input
          id="alert-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 555-5555"
          className="w-full rounded-xl bg-crwn-elevated border border-crwn-elevated px-3 py-2.5 text-sm text-crwn-text outline-none focus:border-crwn-gold"
        />
      </div>

      <label className="flex items-start gap-2.5 text-sm text-crwn-text-secondary cursor-pointer leading-relaxed">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 w-4 h-4 shrink-0 accent-[#D4AF37] cursor-pointer"
        />
        <span>{ALERT_CONSENT_TEXT}</span>
      </label>

      <p className="text-xs text-crwn-text-secondary leading-relaxed">
        {ALERT_CONSENT_FOOTNOTE} See our{' '}
        <Link href="/privacy" className="text-crwn-gold hover:underline">
          Privacy Policy
        </Link>{' '}
        and{' '}
        <Link href="/terms" className="text-crwn-gold hover:underline">
          Terms of Service
        </Link>
        .
      </p>

      {error && <p className="text-xs text-crwn-error">{error}</p>}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full rounded-full bg-crwn-gold text-black text-sm font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state === 'submitting' ? 'Recording…' : 'Agree & Enable SMS Alerts'}
      </button>

      <p className="text-xs text-crwn-text-secondary flex items-start gap-1.5 leading-relaxed">
        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        Submitting this form records your consent. It does not send a text message.
      </p>
    </div>
  );
}
