'use client';

// The fan side of a Fan Automation, as one state machine:
//
//   capture -> delivered (magnet + Gold offer) -> [decline] -> silver -> checkout
//                                   \-> [Gold CTA] -> canonical Stripe checkout
//
// Rules encoded here:
//   * The email form is the ONLY gate, and it gates the magnet, not the page.
//   * Gold success (?subscription=success) NEVER shows Silver.
//   * An explicit decline, or a Stripe cancel return (?subscription=canceled), shows Silver.
//   * Checkout is ALWAYS the canonical /api/stripe/checkout with a tierId; price, fee and
//     destination are server-derived there. This component sends pointers and nothing else.
//   * A signed-out fan cannot open Stripe (checkout requires a session); their delivery
//     email carries a magic link back to ?offer=gold, and the CTA says so honestly.
//   * sessionStorage remembers the claim across the Stripe redirect; it is a per-viewer
//     convenience, wrapped in try/catch, and the page works without it.

import { useCallback, useEffect, useState } from 'react';
import { Check, Crown, Download, Loader2, Lock, Mail, Play } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { freeJoinDisclosure } from '@/lib/subscriptions/freeJoinDisclosure';

export interface DropOfferTier {
  id: string;
  name: string;
  priceCents: number;
  description: string;
  benefits: string[];
}

interface ClaimMagnet {
  kind: 'upload' | 'track' | null;
  title: string;
  url: string | null;
  trackUrl: string | null;
}

interface Props {
  token: string;
  artist: { name: string; slug: string; avatarUrl: string | null };
  magnet: { kind: 'upload' | 'track' | null; title: string; description: string };
  gold: DropOfferTier | null;
  goldItem: { title: string; description: string };
  silver: DropOfferTier | null;
}

type Phase = 'capture' | 'delivered' | 'silver' | 'joined';

const price = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}/mo`;

export function DropFunnelClient({ token, artist, magnet, gold, goldItem, silver }: Props) {
  const storageKey = `crwn_drop_${token}`;
  const [phase, setPhase] = useState<Phase>('capture');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [claimed, setClaimed] = useState<{ magnet: ClaimMagnet; emailSent: boolean; hasSession: boolean; isOwner: boolean } | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);

  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setHasSession(!!data.user), () => {});
  }, []);

  // Landing state from the URL: a checkout return or an email deep link.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    let remembered = false;
    try { remembered = sessionStorage.getItem(storageKey) === '1'; } catch { /* fine */ }

    if (q.get('subscription') === 'success') {
      setPhase('joined');
    } else if (q.get('subscription') === 'canceled') {
      setPhase(silver ? 'silver' : remembered ? 'delivered' : 'capture');
    } else if (q.get('offer') === 'gold' || remembered) {
      setPhase('delivered');
    }
  }, [silver, storageKey]);

  const claim = useCallback(async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/drop/${token}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The page's query string rides along so the tags on the artist's DM link
        // (utm_*, campaign, keyword) survive into the lead row. Normalized server-side.
        body: JSON.stringify({ email, firstName, query: window.location.search }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.');
        return;
      }
      setClaimed({ magnet: data.magnet, emailSent: data.emailSent, hasSession: data.hasSession, isOwner: data.isOwner });
      setHasSession(data.hasSession);
      try { sessionStorage.setItem(storageKey, '1'); } catch { /* fine */ }
      setPhase('delivered');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [token, email, firstName, storageKey]);

  // If the fan arrives signed in (magic link return), the claim needs no email form.
  const claimWithSession = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/drop/${token}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: window.location.search }),
      });
      const data = await res.json();
      if (res.ok) {
        setClaimed({ magnet: data.magnet, emailSent: data.emailSent, hasSession: true, isOwner: data.isOwner });
        try { sessionStorage.setItem(storageKey, '1'); } catch { /* fine */ }
      }
    } finally {
      setSubmitting(false);
    }
  }, [token, storageKey]);

  useEffect(() => {
    if (phase === 'delivered' && !claimed && hasSession) void claimWithSession();
  }, [phase, claimed, hasSession, claimWithSession]);

  const startCheckout = useCallback(async (tierId: string) => {
    setCheckoutBusy(tierId);
    setError('');
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId,
          // The return path keeps the page's query string, so the campaign tags on the
          // artist's link survive the Stripe round trip. Validated server-side either way.
          returnUrl: `/drop/${token}${window.location.search}`,
          attributionSource: 'fan_automation',
          // Real link tags win over the defaults, so a tagged DM link is traceable on the
          // Stripe subscription itself; the funnel identity fills silence.
          utmSource: new URLSearchParams(window.location.search).get('utm_source') || 'fan_automation',
          utmMedium: new URLSearchParams(window.location.search).get('utm_medium') || '',
          utmCampaign: new URLSearchParams(window.location.search).get('utm_campaign') || token,
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        // External URL (Stripe): the one sanctioned use of window.location.href.
        window.location.href = data.url;
        return;
      }
      setError(data.error || 'Could not open checkout. Try again.');
    } catch {
      setError('Could not open checkout. Try again.');
    } finally {
      setCheckoutBusy(null);
    }
  }, [token]);

  const header = (
    <div className="flex items-center gap-3 mb-6">
      {artist.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artist.avatarUrl} alt={artist.name} className="w-12 h-12 rounded-full object-cover" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-crwn-elevated flex items-center justify-center">
          <Crown className="w-6 h-6 text-crwn-gold" />
        </div>
      )}
      <div>
        <p className="text-sm text-crwn-text-secondary">A drop from</p>
        <p className="text-lg font-semibold text-crwn-text">{artist.name}</p>
      </div>
    </div>
  );

  const magnetAccess = claimed?.magnet && (claimed.magnet.url || claimed.magnet.trackUrl) ? (
    <a
      href={claimed.magnet.url || claimed.magnet.trackUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-6 py-3 rounded-full press-scale"
    >
      {claimed.magnet.kind === 'upload' ? <Download className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      {claimed.magnet.kind === 'upload' ? 'Download it now' : 'Play it now'}
    </a>
  ) : claimed?.emailSent ? (
    <p className="text-sm text-crwn-text-secondary">Check your email: your access link is on the way.</p>
  ) : null;

  const offerCard = (tier: DropOfferTier, opts: { headline: string; sub: string; itemTitle?: string; itemDescription?: string; declineLabel?: string; onDecline?: () => void }) => (
    <div className="neu-raised rounded-2xl p-6 bg-crwn-card">
      <p className="text-xs uppercase tracking-wide text-crwn-gold mb-2">{opts.headline}</p>
      {opts.itemTitle ? (
        <>
          <h2 className="text-xl font-bold text-crwn-text">{opts.itemTitle}</h2>
          {opts.itemDescription && <p className="text-sm text-crwn-text-secondary mt-2">{opts.itemDescription}</p>}
          <div className="flex items-center gap-2 mt-4 text-sm text-crwn-text-secondary">
            <Lock className="w-4 h-4 text-crwn-gold" />
            <span>Inside {tier.name}, {price(tier.priceCents)}</span>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-xl font-bold text-crwn-text">{tier.name}</h2>
          <p className="text-sm text-crwn-text-secondary mt-1">{price(tier.priceCents)}</p>
        </>
      )}
      <p className="text-sm text-crwn-text-secondary mt-3">{opts.sub}</p>
      {tier.benefits.length > 0 && (
        <ul className="mt-4 space-y-2">
          {tier.benefits.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-crwn-text">
              <Check className="w-4 h-4 text-crwn-gold mt-0.5 shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5">
        {hasSession ? (
          <button
            onClick={() => startCheckout(tier.id)}
            disabled={checkoutBusy !== null}
            className="w-full py-3 rounded-full font-semibold bg-crwn-gold text-crwn-bg press-scale disabled:opacity-60"
          >
            {checkoutBusy === tier.id ? 'Opening checkout…' : `Join ${tier.name} for ${price(tier.priceCents)}`}
          </button>
        ) : (
          <div className="rounded-xl bg-crwn-elevated p-4 text-sm text-crwn-text-secondary flex items-start gap-2">
            <Mail className="w-4 h-4 text-crwn-gold mt-0.5 shrink-0" />
            <span>
              We emailed you a one-tap sign-in link. Open it and this button unlocks. Already have CRWN?{' '}
              <a href="/login" className="text-crwn-gold">Sign in</a>.
            </span>
          </div>
        )}
      </div>
      {opts.onDecline && (
        <button onClick={opts.onDecline} className="mt-3 w-full text-sm text-crwn-text-secondary press-scale">
          {opts.declineLabel || 'Not right now'}
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-crwn-bg text-crwn-text">
      <div className="max-w-lg mx-auto px-4 py-10">
        {header}

        {phase === 'capture' && (
          <div className="neu-raised rounded-2xl p-6 bg-crwn-card">
            <h1 className="text-2xl font-bold text-crwn-text">{magnet.title || 'Your drop is here'}</h1>
            {magnet.description && <p className="text-sm text-crwn-text-secondary mt-2">{magnet.description}</p>}
            {hasSession ? (
              <button
                onClick={() => { setPhase('delivered'); }}
                className="mt-5 w-full py-3 rounded-full font-semibold bg-crwn-gold text-crwn-bg press-scale"
              >
                Get it now
              </button>
            ) : (
              <div className="mt-5 space-y-3">
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name (optional)"
                  className="w-full rounded-xl bg-crwn-elevated px-4 py-3 text-sm text-crwn-text placeholder:text-crwn-text-secondary outline-none"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email"
                  className="w-full rounded-xl bg-crwn-elevated px-4 py-3 text-sm text-crwn-text placeholder:text-crwn-text-secondary outline-none"
                />
                <button
                  onClick={claim}
                  disabled={submitting || !email}
                  className="w-full py-3 rounded-full font-semibold bg-crwn-gold text-crwn-bg press-scale disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : `Send me ${magnet.title || 'the drop'}`}
                </button>
                <p className="text-xs text-crwn-text-secondary leading-relaxed">
                  {freeJoinDisclosure(magnet.title, artist.name)}
                </p>
              </div>
            )}
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          </div>
        )}

        {phase === 'delivered' && (
          <div className="space-y-6">
            <div className="neu-raised rounded-2xl p-6 bg-crwn-card">
              <p className="text-xs uppercase tracking-wide text-crwn-gold mb-2">Delivered</p>
              <h1 className="text-xl font-bold text-crwn-text">{magnet.title || 'Your drop'}</h1>
              <div className="mt-4">{submitting && !claimed ? <Loader2 className="w-5 h-5 animate-spin text-crwn-gold" /> : magnetAccess}</div>
              {claimed?.isOwner && (
                <p className="mt-3 text-xs text-crwn-text-secondary">You are viewing your own funnel, so no membership was changed.</p>
              )}
            </div>
            {gold ? (
              offerCard(gold, {
                headline: `The one thing ${artist.name} wants you to hear next`,
                sub: goldItem.title
                  ? 'Free gets you the drop. Members get the room it lives in.'
                  : `Members get everything ${artist.name} makes, first.`,
                itemTitle: goldItem.title || undefined,
                itemDescription: goldItem.description || undefined,
                declineLabel: 'Not right now',
                onDecline: silver ? () => setPhase('silver') : undefined,
              })
            ) : (
              <a href={`/${artist.slug}`} className="block text-center text-sm text-crwn-gold">
                See everything from {artist.name}
              </a>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}

        {phase === 'silver' && silver && (
          <div className="space-y-6">
            {offerCard(silver, {
              headline: 'A lighter way in',
              sub: `Same inner circle, lower commitment. You can move up whenever you want.`,
              onDecline: undefined,
            })}
            <a href={`/${artist.slug}`} className="block text-center text-sm text-crwn-text-secondary">
              Maybe later. Take me to {artist.name}&apos;s page
            </a>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}

        {phase === 'joined' && (
          <div className="neu-raised rounded-2xl p-8 bg-crwn-card text-center">
            <Crown className="w-10 h-10 text-crwn-gold mx-auto mb-3" />
            <h1 className="text-xl font-bold text-crwn-text">You are in.</h1>
            <p className="text-sm text-crwn-text-secondary mt-2">
              Welcome to {artist.name}&apos;s inner circle. Everything unlocks on their page.
            </p>
            <a
              href={`/${artist.slug}`}
              className="mt-5 inline-block px-6 py-3 rounded-full font-semibold bg-crwn-gold text-crwn-bg press-scale"
            >
              Go to {artist.name}&apos;s page
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
