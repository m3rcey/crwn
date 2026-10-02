'use client';

// The fan side of a Fan Automation, as one state machine:
//
//   capture -> delivered (magnet + Gold offer) -> [decline] -> silver -> checkout
//                                   \-> [Gold CTA] -> canonical Stripe checkout
//
// Rules encoded here:
//   * The email form is the ONLY gate, and it gates the magnet, not the page.
//   * Gold success (?subscription=success) NEVER shows Silver.
//   * ONLY an explicit decline shows Silver. A Stripe cancel return goes back to the
//     primary offer: backing out of checkout is not the same as saying no.
//   * Checkout is ALWAYS the canonical /api/stripe/checkout with a tierId; price, fee and
//     destination are server-derived there. This component sends pointers and nothing else.
//   * A signed-out fan cannot open Stripe (checkout requires a session); their delivery
//     email carries a magic link back to ?offer=gold, and the CTA says so honestly.
//   * sessionStorage remembers the claim across the Stripe redirect; it is a per-viewer
//     convenience, wrapped in try/catch, and the page works without it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Crown, Download, Loader2, Lock, Play } from 'lucide-react';
import { freeJoinDisclosure } from '@/lib/subscriptions/freeJoinDisclosure';
import { InlineAudioPlayer } from '@/components/shared/InlineAudioPlayer';
import { MagnetPlayer } from '@/components/drop/MagnetPlayer';
import { CampaignBanner } from '@/components/drop/CampaignBanner';
import type { CampaignPresentation } from '@/lib/campaigns/giveaway';
import { TierOfferExperience } from '@/components/offer/TierOfferExperience';
import { useOfferPurchase, offerPrice } from '@/components/offer/useOfferPurchase';
import type { TierOfferExperience as OfferConfig } from '@/lib/offerExperience/types';

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
  /** The active campaign wrapper, or null. Null is the normal state and means the
   *  evergreen funnel renders exactly as it always has. */
  campaign?: CampaignPresentation | null;
  /** Normalized Tier Offer Experiences by tier id, read server-side. When a tier has one,
   *  the funnel renders the full merchandised experience; otherwise the compact card, so
   *  artists without a config are byte-for-byte unchanged. */
  experiences?: Record<string, OfferConfig>;
  magnet: { kind: 'upload' | 'track' | null; title: string; description: string; coverUrl?: string | null; project?: string | null; durationSec?: number | null };
  gold: DropOfferTier | null;
  goldItem: { title: string; description: string };
  silver: DropOfferTier | null;
}

type Phase = 'capture' | 'delivered' | 'silver' | 'joined';

const price = offerPrice;

export function DropFunnelClient({ token, artist, magnet, gold, goldItem, silver, experiences, campaign }: Props) {
  const storageKey = `crwn_drop_${token}`;
  const [phase, setPhase] = useState<Phase>('capture');
  const [email, setEmail] = useState('');
  // The locked player's play control points the fan at the one thing that unlocks it.
  const emailRef = useRef<HTMLInputElement>(null);
  const isTrackMagnet = magnet.kind === 'track';
  const playerProps = {
    title: magnet.title || 'The song',
    artistName: artist.name,
    project: magnet.project ?? null,
    coverUrl: magnet.coverUrl ?? null,
    durationSec: magnet.durationSec ?? null,
  };
  const [firstName, setFirstName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [claimed, setClaimed] = useState<{ magnet: ClaimMagnet; emailSent: boolean; hasSession: boolean; isOwner: boolean } | null>(null);

  // The ONE purchase cluster (checkout + inline sign-in code), shared with the vote page.
  const { hasSession, setHasSession, purchaseAction } = useOfferPurchase({
    email,
    setEmail,
    experiences,
    returnPath: () => `/drop/${token}${window.location.search}`,
    attributionSource: 'fan_automation',
    utmCampaignFallback: token,
    captureStep: 'Claim the drop above',
    confirmEmailPrompt: 'Confirm the email you claimed the drop with and we will send a code.',
    onError: setError,
  });

  // Landing state from the URL: a checkout return or an email deep link.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    let remembered = false;
    try {
      remembered = sessionStorage.getItem(storageKey) === '1';
      const savedEmail = sessionStorage.getItem(`${storageKey}_email`);
      if (savedEmail) setEmail(savedEmail);
    } catch { /* fine */ }

    if (q.get('subscription') === 'success') {
      setPhase('joined');
    } else if (q.get('subscription') === 'canceled') {
      // Back to the PRIMARY offer, not the downsell. Opening checkout and returning is
      // not a decision: a fan taps back to check the price, to find their card, or by
      // accident, and answering that with a cheaper tier tells someone who was buying
      // Platinum that we would rather sell them Gold. The downsell has one trigger now,
      // the explicit "Not right now" below the offer, which is the only signal that
      // actually means no.
      setPhase(remembered ? 'delivered' : 'capture');
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
      try {
        sessionStorage.setItem(storageKey, '1');
        // The address is needed again to request a sign-in code on a LATER visit. It
        // lived only in component state, so a reload or a Stripe round trip lost it and
        // the code could never be sent. Same per-viewer storage as the claim flag, and
        // it is the fan's own address in the fan's own browser.
        if (email) sessionStorage.setItem(`${storageKey}_email`, email);
      } catch { /* fine */ }
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

  // High-signal offer analytics through the EXISTING fan-side spine (tier_events):
  // a view when a full experience renders, a play when its VSL starts, a declined when
  // the fan explicitly passes. Best-effort beacons; checkout starts stay server-side.
  const sentBeacons = useRef<Set<string>>(new Set());
  const offerBeacon = useCallback((tierId: string, eventType: 'tier_card_viewed' | 'tier_vsl_started' | 'tier_offer_declined') => {
    const k = `${tierId}:${eventType}`;
    if (sentBeacons.current.has(k)) return;
    sentBeacons.current.add(k);
    fetch('/api/tier-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tierIds: [tierId], eventType, source: 'direct' }),
    }).catch(() => {});
  }, []);

  const header = (
    // One line, not a stacked block: every pixel here pushes the opt-in button toward the fold.
    <div className="flex items-center justify-center gap-3 mb-4">
      {artist.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artist.avatarUrl} alt={artist.name} className="w-10 h-10 rounded-full object-cover" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-crwn-elevated flex items-center justify-center">
          <Crown className="w-5 h-5 text-crwn-gold" />
        </div>
      )}
      <p className="text-sm text-crwn-text-secondary">
        A drop from <span className="font-semibold text-crwn-text">{artist.name}</span>
      </p>
    </div>
  );

  const magnetAccess = claimed?.magnet?.trackUrl && isTrackMagnet ? (
    // The song the fan saw locked, now playing, with the short-lived signed URL. One compact
    // row, so the offer's buy button under it stays above the fold on a phone and a laptop.
    <MagnetPlayer {...playerProps} src={claimed.magnet.trackUrl} layout="row" />
  ) : claimed?.magnet?.trackUrl ? (
    // The song plays HERE. The signed URL is short-lived by design; the player mounts it
    // for this visit, and re-access below mints a fresh one any time.
    <InlineAudioPlayer src={claimed.magnet.trackUrl} title={magnet.title || 'Your track'} />
  ) : claimed?.magnet?.url ? (
    <a
      href={claimed.magnet.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-6 py-3 rounded-full press-scale"
    >
      <Download className="w-4 h-4" /> Download it now
    </a>
  ) : claimed?.emailSent ? (
    <p className="text-sm text-crwn-text-secondary">Check your email: your access link is on the way.</p>
  ) : phase === 'delivered' && !hasSession ? (
    // A RETURNING session-less visitor: the page remembered the claim but not the signed
    // URL, which expires on purpose. A duplicate claim is re-delivery by design, so one
    // tap (or one email, in a fresh browser) brings the song back.
    <button
      onClick={() => {
        if (email) { void claim(); } else { setPhase('capture'); }
      }}
      disabled={submitting}
      className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-6 py-3 rounded-full press-scale disabled:opacity-60"
    >
      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
      {`Get ${magnet.title || 'it'} again`}
    </button>
  ) : null;

  // The full merchandised experience for a tier, bound to this funnel's ONE purchase
  // cluster. A plain render FUNCTION, not an inner component: an inner component gets a
  // new identity every parent render, which would remount the whole experience (and
  // restart its video) on every keystroke in the sign-in-code box.
  const offerView = (tier: DropOfferTier, config: OfferConfig, onDecline?: () => void, declineLabel?: string) => (
    <TierOfferExperience
      artist={{ name: artist.name, avatarUrl: artist.avatarUrl }}
      tier={tier}
      config={config}
      price={price}
      actionSlot={purchaseAction(tier)}
      onDecline={onDecline}
      declineLabel={declineLabel}
      onVslStart={() => offerBeacon(tier.id, 'tier_vsl_started')}
    />
  );

  // A phase change is a new page in the fan's mind: declining Platinum must land them at
  // the TOP of the Gold offer, not mid-scroll where the tap happened. Instant, not
  // smooth, deliberately: reduced-motion users get no animation to object to.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase]);

  // The offer VIEW beacon fires on phase entry, deduped per tier per mount.
  useEffect(() => {
    if (phase === 'delivered' && gold && experiences?.[gold.id]) offerBeacon(gold.id, 'tier_card_viewed');
    if (phase === 'silver' && silver && experiences?.[silver.id]) offerBeacon(silver.id, 'tier_card_viewed');
  }, [phase, gold, silver, experiences, offerBeacon]);

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
      <div className="mt-5">{purchaseAction(tier)}</div>
      {opts.onDecline && (
        <button onClick={opts.onDecline} className="mt-3 w-full text-sm text-crwn-text-secondary press-scale">
          {opts.declineLabel || 'Not right now'}
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-crwn-bg text-crwn-text">
      <div className="max-w-lg mx-auto px-4 pt-5 pb-10">
        {header}

        {campaign && (phase === 'capture' || phase === 'delivered') && (
          <CampaignBanner campaign={campaign} />
        )}

        {phase === 'capture' && (
          <div className="neu-raised rounded-2xl p-6 bg-crwn-card text-center">
            {isTrackMagnet ? (
              <div className="mb-3">
                <MagnetPlayer
                  {...playerProps}
                  onLockedTap={() => {
                    emailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    emailRef.current?.focus({ preventScroll: true });
                  }}
                />
              </div>
            ) : (
              <h1 className="text-2xl font-bold text-crwn-text">{magnet.title || 'Your drop is here'}</h1>
            )}
            {magnet.description && <p className="text-sm text-crwn-text-secondary mt-2">{magnet.description}</p>}
            {hasSession ? (
              <button
                onClick={() => { setPhase('delivered'); }}
                className="mt-5 w-full py-3 rounded-full font-semibold bg-crwn-gold text-crwn-bg press-scale"
              >
                Get it now
              </button>
            ) : (
              <div className="mt-4 space-y-3">
                {/* Name and email on ONE row: the opt-in button must sit above the fold. */}
                <div className="grid grid-cols-[2fr_3fr] gap-2">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    aria-label="First name (optional)"
                    autoComplete="given-name"
                    className="w-full min-w-0 rounded-xl bg-crwn-elevated px-3 py-3 text-sm text-crwn-text placeholder:text-crwn-text-secondary outline-none"
                  />
                  <input
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Your email"
                    autoComplete="email"
                    inputMode="email"
                    className="w-full min-w-0 rounded-xl bg-crwn-elevated px-3 py-3 text-sm text-crwn-text placeholder:text-crwn-text-secondary outline-none"
                  />
                </div>
                <button
                  // Never dimmed for an empty field: a greyed-out button reads as broken, and it
                  // is the one thing this page wants tapped. With no email yet, it points there.
                  onClick={() => {
                    if (!email.trim()) {
                      setError('Enter your email to unlock it.');
                      emailRef.current?.focus();
                      return;
                    }
                    void claim();
                  }}
                  disabled={submitting}
                  className="w-full py-3 rounded-full font-semibold bg-crwn-gold text-crwn-bg press-scale disabled:opacity-60"
                >
                  {/* Benefit-led capture CTA: the fan is unlocking the thing, not filling a form. */}
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : `Unlock ${magnet.title || 'the drop'}`}
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
          <div className="space-y-4">
            <div className="neu-raised rounded-2xl p-4 bg-crwn-card text-center">
              <p className="text-xs uppercase tracking-wide text-crwn-gold mb-2">{isTrackMagnet ? 'Unlocked' : 'Delivered'}</p>
              {!(isTrackMagnet && claimed?.magnet?.trackUrl) ? (
                <h1 className="text-xl font-bold text-crwn-text">{magnet.title || 'Your drop'}</h1>
              ) : null}
              <div className="mt-3 flex justify-center">{submitting && !claimed ? <Loader2 className="w-5 h-5 animate-spin text-crwn-gold" /> : magnetAccess}</div>
              {magnet.kind === 'track' && (
                <p className="mt-3 text-xs text-crwn-text-secondary">
                  Yours for good: as a free member it plays any time on{' '}
                  <a href={`/${artist.slug}`} className="text-crwn-gold">{artist.name}&apos;s page</a>
                  {' '}once you sign in with the link from your email.
                </p>
              )}
              {claimed?.isOwner && (
                <p className="mt-3 text-xs text-crwn-text-secondary">You are viewing your own funnel, so no membership was changed.</p>
              )}
            </div>
            {gold && experiences?.[gold.id] ? (
              offerView(gold, experiences[gold.id], silver ? () => {
                offerBeacon(gold.id, 'tier_offer_declined');
                setPhase('silver');
              } : undefined, 'Not right now')
            ) : gold ? (
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
            {experiences?.[silver.id] ? (
              offerView(silver, experiences[silver.id], () => {
                offerBeacon(silver.id, 'tier_offer_declined');
                setPhase('joined');
              }, 'Stay free')
            ) : (
              offerCard(silver, {
                headline: 'A lighter way in',
                sub: `Same inner circle, lower commitment. You can move up whenever you want.`,
                onDecline: undefined,
              })
            )}
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
