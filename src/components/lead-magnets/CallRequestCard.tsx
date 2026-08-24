'use client';

import { useState } from 'react';
import { Phone } from 'lucide-react';
import { CALL_CONSENT_TEXT } from '@/lib/acquisition/callRequest';
import { OPPORTUNITY_EVENTS, trackOpportunity } from '@/lib/opportunityFunnels/analytics';
import { readUtm, readCampaignAttribution } from '@/lib/leadMagnets/analytics';
import type { LeadMagnetInputValues } from '@/lib/leadMagnets/types';

// The optional hand-raiser at the opportunity calculator's save boundary. Renders BELOW the
// builder, never before it (the builder is the CTA and nothing may gate it). Submitting is an
// ACTIVE request: the server recomputes qualification from the calculator answers and decides
// alone whether a founder alert fires. This component never learns that decision; every
// accepted request gets the same honest expectation state.
interface CallRequestCardProps {
  toolSlug: string;
  calculatorInputs: LeadMagnetInputValues;
  planSummary?: string | null;
  publicToken?: string | null;
}

type CardState = 'collapsed' | 'open' | 'submitting' | 'requested';

export function CallRequestCard({ toolSlug, calculatorInputs, planSummary, publicToken }: CallRequestCardProps) {
  const [state, setState] = useState<CardState>('collapsed');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');

  const open = () => {
    setState('open');
    trackOpportunity(OPPORTUNITY_EVENTS.callOptionViewed, { toolKey: toolSlug, context: 'public' });
  };

  const submit = async () => {
    setError('');
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Enter the number we should call back.');
      return;
    }
    if (!consent) {
      setError('Check the consent box so we are allowed to call you.');
      return;
    }
    setState('submitting');
    try {
      const utm = readUtm();
      const res = await fetch('/api/lead-magnets/call-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolSlug,
          inputs: calculatorInputs,
          phone,
          consent: true,
          planSummary: planSummary || undefined,
          publicToken: publicToken || undefined,
          utm: { source: utm.utmSource, campaign: utm.utmCampaign, content: utm.utmContent },
          // The normalized campaign tag, so a hand-raiser is attributable to the video that
          // produced them. Re-validated server-side; reporting only, never part of qualification.
          attribution: readCampaignAttribution(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send your request');
      trackOpportunity(OPPORTUNITY_EVENTS.callRequested, { toolKey: toolSlug, context: 'public' });
      setState('requested');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your request');
      setState('open');
    }
  };

  if (state === 'requested') {
    return (
      <div className="rounded-2xl bg-crwn-surface border border-crwn-gold/40 p-4">
        <p className="text-sm font-semibold text-crwn-gold flex items-center gap-2">
          <Phone className="w-4 h-4" /> Request received
        </p>
        <p className="text-sm text-crwn-text-secondary mt-1.5">
          Keep this page open. Someone from CRWN may call you shortly to review your plan. If we
          miss you, we will text the number you gave us.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-crwn-surface border border-crwn-elevated p-4">
      {state === 'collapsed' ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold">Want help launching this?</p>
            <p className="text-xs text-crwn-text-secondary mt-0.5">
              A plan that never launches earns nothing. Talk it through with CRWN before this tab
              gets closed and forgotten.
            </p>
          </div>
          <button
            onClick={open}
            className="shrink-0 rounded-full bg-crwn-gold text-black text-sm font-semibold px-4 py-2"
          >
            Get a call now
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Get a call about launching this plan</p>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Your callback number"
            aria-label="Callback phone number"
            className="w-full rounded-xl bg-crwn-elevated border border-crwn-elevated px-3 py-2.5 text-sm outline-none focus:border-crwn-gold"
          />
          <label className="flex items-start gap-2 text-xs text-crwn-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 accent-[#D4AF37]"
            />
            <span>{CALL_CONSENT_TEXT}</span>
          </label>
          {/* Point-of-opt-in disclosure. Required wherever a mobile number is collected from a
              person who may then be contacted by text (A2P 10DLC / CTIA): frequency, carrier
              charges, how to stop, how to get help, and links to the policies that carry the
              full terms. Static copy, no product behavior attached. */}
          <p className="text-[11px] leading-relaxed text-crwn-text-secondary">
            Message frequency varies. Message and data rates may apply. Reply STOP to opt out,
            HELP for help. Consent is not a condition of purchase. See our{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">
              Privacy Policy
            </a>{' '}
            and{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline">
              Terms
            </a>
            .
          </p>
          {error && <p className="text-xs text-crwn-error">{error}</p>}
          <button
            onClick={submit}
            disabled={state === 'submitting'}
            className="w-full rounded-full bg-crwn-gold text-black text-sm font-semibold py-2.5 disabled:opacity-60"
          >
            {state === 'submitting' ? 'Sending…' : 'Request my call'}
          </button>
        </div>
      )}
    </div>
  );
}
