'use client';

// The first useful outcome screen: what to launch, what to charge, who it is for, why it
// fits, and the next three moves. Renders in Rise Mode's slot while the Quest Engine is
// dark, so a brand-new artist meets a concrete recommendation instead of a placeholder.
//
// Read-only over GET /api/starter-offer (deterministic, derived from the artist's own
// claimed calculator results). Falls back to the old "on its way" copy when the account
// has no artist row yet or the fetch fails, so this can never make the page worse.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Check } from 'lucide-react';
import { trackOpportunity } from '@/lib/opportunityFunnels/analytics';
import type { StarterOffer } from '@/lib/leadResults/starterOffer';

const RESULT_VERSION = 'starterOffer@1';

function meta(offer: StarterOffer) {
  return {
    toolKey: offer.toolSlug ?? 'none',
    opportunityKey: offer.kind,
    resultVersion: RESULT_VERSION,
    context: 'artist' as const,
    authed: true,
  };
}

function Fallback() {
  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="text-5xl mb-3">👑</div>
      <h2 className="text-2xl font-bold text-crwn-text">Rise Mode is on its way</h2>
      <p className="text-lg text-crwn-text-secondary mt-3 leading-relaxed">
        Your guided career mode, your next move every day, is being prepared for your CRWN.
      </p>
    </div>
  );
}

export function StarterOfferCard() {
  const [offer, setOffer] = useState<StarterOffer | null>(null);
  const [artistSlug, setArtistSlug] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const viewedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/starter-offer', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!alive) return;
        if (json?.offer) {
          setOffer(json.offer as StarterOffer);
          setArtistSlug(typeof json.artistSlug === 'string' ? json.artistSlug : null);
          setState('ready');
        } else {
          setState('fallback');
        }
      } catch {
        if (alive) setState('fallback');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (state === 'ready' && offer && !viewedRef.current) {
      viewedRef.current = true;
      trackOpportunity('recommended_action_viewed', meta(offer));
    }
  }, [state, offer]);

  if (state === 'loading') {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  if (state === 'fallback' || !offer) return <Fallback />;

  const previewHref = artistSlug ? `/${artistSlug}` : null;
  const primaryLabel = offer.alreadyLaunched ? 'Invite your first fans' : 'Finish my offer';
  const primaryHref = offer.alreadyLaunched && previewHref ? previewHref : offer.builderHref;

  return (
    <div className="max-w-lg mx-auto py-6 px-1 stagger-fade-in">
      <p className="text-sm font-bold uppercase tracking-widest text-crwn-gold">Your first move</p>
      <h2 className="text-2xl font-bold text-crwn-text mt-2">Based on what you told us, start here.</h2>

      <div className="bg-crwn-surface rounded-2xl p-5 mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-xl font-bold text-crwn-text">{offer.offerName}</h3>
          <span className="text-xl font-bold text-crwn-gold whitespace-nowrap">{offer.priceLabel}</span>
        </div>
        <p className="text-sm text-crwn-text-secondary mt-1">{offer.featureLabel}</p>
        {offer.monthlyLabel && (
          <p className="text-base text-crwn-text mt-3">
            Worth <span className="text-crwn-gold font-bold">{offer.monthlyLabel}</span> once it is live. Until then it earns nothing.
          </p>
        )}
        <p className="text-base text-crwn-text-secondary mt-3 leading-relaxed">{offer.why}</p>

        <div className="border-t border-white/10 mt-4 pt-4">
          <p className="text-sm font-semibold text-crwn-text">Who it is for</p>
          <p className="text-sm text-crwn-text-secondary mt-1">{offer.audience}</p>
        </div>

        {offer.benefits.length > 0 && (
          <div className="border-t border-white/10 mt-4 pt-4">
            <p className="text-sm font-semibold text-crwn-text">What is inside</p>
            <ul className="mt-2 space-y-1.5">
              {offer.benefits.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-crwn-text-secondary">
                  <Check className="w-4 h-4 text-crwn-gold shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-crwn-text-secondary mt-2 italic">{offer.fulfillmentNote}</p>
          </div>
        )}

        {(offer.constraintNote || offer.overlapNote) && (
          <p className="text-xs text-crwn-text-secondary mt-4 leading-relaxed">
            {offer.constraintNote ?? offer.overlapNote}
          </p>
        )}
      </div>

      {offer.missing.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-semibold text-crwn-text">Still needed before it can earn</p>
          <ul className="mt-2 space-y-1.5">
            {offer.missing.map((m) => (
              <li key={m} className="text-sm text-crwn-text-secondary">
                · {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <p className="text-sm font-semibold text-crwn-text">Your next three moves</p>
        <ol className="mt-2 space-y-2">
          {offer.nextActions.map((a, i) => (
            <li key={a.label} className="flex items-start gap-2.5 text-sm text-crwn-text-secondary">
              <span className="text-crwn-gold font-bold">{i + 1}.</span>
              {a.href ? (
                <Link prefetch href={a.href} className="hover:text-crwn-text underline-offset-2 hover:underline">
                  {a.label}
                </Link>
              ) : (
                <span>{a.label}</span>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 space-y-3">
        <Link
          prefetch
          href={primaryHref}
          onClick={() => trackOpportunity('recommended_action_started', meta(offer))}
          className="block w-full text-center bg-crwn-gold text-black font-bold py-3.5 rounded-full hover:opacity-90 transition-opacity"
        >
          {primaryLabel}
        </Link>
        {previewHref && !offer.alreadyLaunched && (
          <Link
            prefetch
            href={previewHref}
            className="block w-full text-center text-crwn-gold font-semibold py-2.5 rounded-full border border-crwn-gold/40 hover:border-crwn-gold transition-colors"
          >
            Preview what fans will see
          </Link>
        )}
      </div>
    </div>
  );
}
