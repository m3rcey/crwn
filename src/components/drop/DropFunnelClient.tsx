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
import { Check, Crown, Download, Loader2, Lock, Mail, Play } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { freeJoinDisclosure } from '@/lib/subscriptions/freeJoinDisclosure';
import { InlineAudioPlayer } from '@/components/shared/InlineAudioPlayer';
import { TierOfferExperience } from '@/components/offer/TierOfferExperience';
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
  /** Normalized Tier Offer Experiences by tier id, read server-side. When a tier has one,
   *  the funnel renders the full merchandised experience; otherwise the compact card, so
   *  artists without a config are byte-for-byte unchanged. */
  experiences?: Record<string, OfferConfig>;
  magnet: { kind: 'upload' | 'track' | null; title: string; description: string };
  gold: DropOfferTier | null;
  goldItem: { title: string; description: string };
  silver: DropOfferTier | null;
}

type Phase = 'capture' | 'delivered' | 'silver' | 'joined';

const price = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}/mo`;

// Supabase auth errors are written for developers. A fan on an artist's offer card must
// never read "Signups not allowed for otp": it describes a correct refusal (the address
// has no CRWN contact because the drop was never claimed with it) in words that make a
// working product look broken. Mapped here, and anything unrecognised falls back to
// plain language rather than leaking the raw string.
function codeErrorText(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('signups not allowed') || m.includes('otp_disabled')) {
    return 'We do not have that email yet. Claim the drop above with it first, then this unlocks.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'That is a lot of codes at once. Wait a minute and try again.';
  }
  if (m.includes('invalid') || m.includes('expired')) {
    return 'That code has expired. Send a new one.';
  }
  return 'We could not send the code. Try again in a moment.';
}

export function DropFunnelClient({ token, artist, magnet, gold, goldItem, silver, experiences }: Props) {
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

  // startCheckout is declared below; a ref keeps the verify handler above it honest.
  const startCheckoutRef = useRef<((tierId: string) => void) | null>(null);

  // ── Inline sign-in code ────────────────────────────────────────────────────
  //
  // A captured contact holds a free membership but NEVER a session (see the claim
  // route), and /api/stripe/checkout requires one. The old path told them to leave for
  // their inbox and click a link, which on a phone means leaving Instagram, finding the
  // mail app, and coming back with the intent gone.
  //
  // This asks for the SIX DIGIT CODE from the same email instead, on this page. It is
  // not a weaker check: verifyOtp confirms the address exactly as the link does, so an
  // unverified typed email still cannot buy anything. It only removes the app switch.
  // The tier they pressed is remembered, so checkout opens on the thing they wanted
  // rather than dropping them back on a page to press it again.
  const [codeForTier, setCodeForTier] = useState<string | null>(null);
  const [emailForCode, setEmailForCode] = useState('');
  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeError, setCodeError] = useState('');

  const sendCodeTo = useCallback(async (addr: string, tierId: string) => {
    setCodeForTier(tierId);
    setCodeError('');
    setCode('');
    setCodeBusy(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { shouldCreateUser: false },
      });
      if (otpError) setCodeError(codeErrorText(otpError.message));
      else setCodeSent(true);
    } catch {
      setCodeError('Could not send the code. Try again.');
    } finally {
      setCodeBusy(false);
    }
  }, []);

  const sendCode = useCallback(async (tierId: string) => {
    setCodeForTier(tierId);
    setCodeError('');
    setCode('');
    if (!email) {
      // A genuinely fresh tab with no stored address. The box below asks for it rather
      // than dead-ending, because telling someone to "enter your email again" with no
      // field to type into is not an instruction, it is a wall.
      setCodeSent(false);
      return;
    }
    // shouldCreateUser false inside: this address already exists as a captured contact
    // from the claim. Never mint an account here.
    await sendCodeTo(email, tierId);
  }, [email, sendCodeTo]);

  const verifyCode = useCallback(async (tierId: string) => {
    const token = code.trim();
    // Supabase issues an EIGHT digit OTP on this project (probe-verified), not the six
    // most code boxes assume. Accepting 6 or more keeps it working if that ever changes.
    if (token.length < 6) { setCodeError('Enter the code from the email.'); return; }
    setCodeBusy(true);
    setCodeError('');
    try {
      // TWO TOKEN TYPES, because a fan can be in either identity state and the page
      // cannot know which. A captured contact is created by admin.createUser with no
      // email_confirm, so they are UNCONFIRMED and Supabase issues their code through
      // the signup confirmation flow ('signup'). A fan who already confirmed an address
      // gets an ordinary email OTP ('email'). Trying both is not sloppiness: each is a
      // real state this funnel produces, and neither verifies a token issued for the
      // other, so a wrong guess fails closed rather than letting anyone in.
      let vErr = (await supabase.auth.verifyOtp({ email, token, type: 'email' })).error;
      if (vErr) {
        vErr = (await supabase.auth.verifyOtp({ email, token, type: 'signup' })).error;
      }
      if (vErr) { setCodeError('That code did not work. Check it and try again.'); return; }
      setHasSession(true);
      setCodeForTier(null);
      // Straight into checkout for the tier they pressed. The intent survives.
      void startCheckoutRef.current?.(tierId);
    } catch {
      setCodeError('That code did not work. Try again.');
    } finally {
      setCodeBusy(false);
    }
  }, [code, email]);

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

  startCheckoutRef.current = startCheckout;

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

  const magnetAccess = claimed?.magnet?.trackUrl ? (
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

  // The ONE purchase cluster: benefit CTA (or historical fallback), checkout for a
  // session, and the inline sign-in-code flow for a captured contact. The compact offer
  // card and the full Tier Offer Experience both render exactly this, so checkout and
  // auth state can never fork between the two presentations.
  const ctaLabel = (tier: DropOfferTier): string =>
    experiences?.[tier.id]?.cta ?? `Join ${tier.name} for ${price(tier.priceCents)}`;

  const purchaseAction = (tier: DropOfferTier) => (
    <>
        {hasSession ? (
          <button
            onClick={() => startCheckout(tier.id)}
            disabled={checkoutBusy !== null}
            className="w-full py-3 rounded-full font-semibold bg-crwn-gold text-crwn-bg press-scale disabled:opacity-60"
          >
            {checkoutBusy === tier.id ? 'Opening checkout…' : ctaLabel(tier)}
          </button>
        ) : codeForTier === tier.id ? (
          <div className="rounded-xl bg-crwn-elevated p-4">
            <p className="text-sm text-crwn-text flex items-start gap-2">
              <Mail className="w-4 h-4 text-crwn-gold mt-0.5 shrink-0" />
              <span>
                {codeSent
                  ? `We sent a code to ${email}. Check spam if it is not in your inbox. Enter it here and checkout opens.`
                  : email
                    ? 'Getting your code ready...'
                    : 'Confirm the email you claimed the drop with and we will send a code.'}
              </span>
            </p>
            {!email && (
              <div className="mt-3 flex gap-2">
                <input
                  type="email"
                  value={emailForCode}
                  onChange={(e) => setEmailForCode(e.target.value)}
                  placeholder="you@email.com"
                  aria-label="Your email"
                  className="flex-1 rounded-xl bg-crwn-card px-4 py-3 text-sm text-crwn-text placeholder:text-crwn-text-secondary/50 outline-none"
                />
                <button
                  onClick={() => {
                    const addr = emailForCode.trim();
                    setEmail(addr);
                    void sendCodeTo(addr, tier.id);
                  }}
                  disabled={!emailForCode.trim()}
                  className="px-5 rounded-xl font-semibold bg-crwn-gold text-crwn-bg press-scale disabled:opacity-50"
                >
                  Send code
                </button>
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                placeholder="00000000"
                aria-label="Sign-in code"
                className="flex-1 rounded-xl bg-crwn-card px-4 py-3 text-lg tracking-[0.3em] text-crwn-text placeholder:text-crwn-text-secondary/50 outline-none"
              />
              <button
                onClick={() => verifyCode(tier.id)}
                disabled={codeBusy || code.trim().length < 6}
                className="px-5 rounded-xl font-semibold bg-crwn-gold text-crwn-bg press-scale disabled:opacity-50"
              >
                {codeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}
              </button>
            </div>
            {codeError && <p className="mt-2 text-sm text-red-400">{codeError}</p>}
            <p className="mt-3 text-xs text-crwn-text-secondary">
              No code yet? Check spam, or{' '}
              <button onClick={() => sendCode(tier.id)} disabled={codeBusy} className="text-crwn-gold">send it again</button>.
              The link in that email still works too.
            </p>
          </div>
        ) : (
          <>
            <button
              onClick={() => sendCode(tier.id)}
              disabled={codeBusy}
              className="w-full py-3 rounded-full font-semibold bg-crwn-gold text-crwn-bg press-scale disabled:opacity-60"
            >
              {ctaLabel(tier)}
            </button>
            <p className="mt-2 text-xs text-crwn-text-secondary text-center">
              We will email you a code to confirm it is you. Already have CRWN?{' '}
              <a href="/login" className="text-crwn-gold">Sign in</a>.
            </p>
          </>
        )}
    </>
  );

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
          <div className="space-y-6">
            <div className="neu-raised rounded-2xl p-6 bg-crwn-card text-center">
              <p className="text-xs uppercase tracking-wide text-crwn-gold mb-2">Delivered</p>
              <h1 className="text-xl font-bold text-crwn-text">{magnet.title || 'Your drop'}</h1>
              <div className="mt-4 flex justify-center">{submitting && !claimed ? <Loader2 className="w-5 h-5 animate-spin text-crwn-gold" /> : magnetAccess}</div>
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
