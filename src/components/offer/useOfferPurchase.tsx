'use client';
// The ONE purchase cluster for a Tier Offer Experience on a public funnel page: the
// benefit CTA, canonical checkout for a signed-in fan, and the inline sign-in-code flow for
// a captured contact. Moved verbatim out of DropFunnelClient (2026-09-28) so the Song Lab
// vote page can sell the same ladder without a second copy of checkout or auth: copies of
// money and identity code drift, and the drift is found by a fan.
//
// Rules it keeps, unchanged from the drop funnel:
//   * Checkout is ALWAYS the canonical /api/stripe/checkout with a tierId; price, fee and
//     destination are server-derived there. This sends pointers and nothing else.
//   * A captured contact holds a free membership but NEVER a session, and checkout requires
//     one. The fan confirms their address with the emailed code on this page (verifyOtp
//     confirms it exactly as the link does), then checkout opens on the tier they pressed.
//   * shouldCreateUser is false: the address already exists from the capture. Never mint an
//     account here.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getPersistedReferralCode } from '@/components/shared/ReferralPersist';
import type { TierOfferExperience as OfferConfig } from '@/lib/offerExperience/types';

export interface PurchasableTier {
  id: string;
  name: string;
  priceCents: number;
}

export const offerPrice = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}/mo`;

// Supabase auth errors are written for developers. A fan on an artist's offer card must
// never read "Signups not allowed for otp": it describes a correct refusal (the address
// has no CRWN contact yet) in words that make a working product look broken. Mapped here,
// and anything unrecognised falls back to plain language rather than leaking the raw string.
function codeErrorText(raw: string, captureStep: string): string {
  const m = raw.toLowerCase();
  if (m.includes('signups not allowed') || m.includes('otp_disabled')) {
    return `We do not have that email yet. ${captureStep} with it first, then this unlocks.`;
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'That is a lot of codes at once. Wait a minute and try again.';
  }
  if (m.includes('invalid') || m.includes('expired')) {
    return 'That code has expired. Send a new one.';
  }
  return 'We could not send the code. Try again in a moment.';
}

interface Options {
  /** The address the fan gave at capture (a drop claim, a vote). May be empty on a fresh tab. */
  email: string;
  setEmail: (email: string) => void;
  experiences?: Record<string, OfferConfig>;
  /** Internal path Stripe returns to, query string included. Validated server-side. */
  returnPath: () => string;
  attributionSource: string;
  /** Used for utm_campaign when the page's own link carries none. */
  utmCampaignFallback: string;
  /** How the fan gave their email, in the words of the page: "Claim the drop above". */
  captureStep: string;
  /** "Confirm the email you claimed the drop with and we will send a code." */
  confirmEmailPrompt: string;
  onError: (message: string) => void;
}

export function useOfferPurchase(o: Options) {
  const { email, setEmail, experiences, onError } = o;
  const [hasSession, setHasSession] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setHasSession(!!data.user), () => {});
  }, []);

  // startCheckout is declared below; a ref keeps the verify handler above it honest.
  const startCheckoutRef = useRef<((tierId: string) => void) | null>(null);
  // The latest options, so the callbacks below keep stable identities.
  const opts = useRef(o);
  opts.current = o;

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
      if (otpError) setCodeError(codeErrorText(otpError.message, opts.current.captureStep));
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
      // real state these funnels produce, and neither verifies a token issued for the
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
    onError('');
    const { returnPath, attributionSource, utmCampaignFallback } = opts.current;
    try {
      const q = new URLSearchParams(window.location.search);
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId,
          // The return path keeps the page's query string, so the campaign tags on the
          // artist's link survive the Stripe round trip. Validated server-side either way.
          returnUrl: returnPath(),
          attributionSource,
          // A fan's share link (/<artist>/r/<code>, or ?ref= on any page) is kept for 30 days
          // by ReferralPersist. Every poster, QR code and DM lands on a funnel page, so without
          // this a referred fan who bought HERE credited nobody, while the same purchase on the
          // artist page credited the sharer. A pointer like the rest: the server resolves the
          // code, refuses self-referral and charges the artist's own rate.
          referralCode: getPersistedReferralCode(q.get('ref') || ''),
          // Real link tags win over the defaults, so a tagged link is traceable on the
          // Stripe subscription itself; the funnel identity fills silence.
          utmSource: q.get('utm_source') || attributionSource,
          utmMedium: q.get('utm_medium') || '',
          utmCampaign: q.get('utm_campaign') || utmCampaignFallback,
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        // External URL (Stripe): the one sanctioned use of window.location.href.
        window.location.href = data.url;
        return;
      }
      onError(data.error || 'Could not open checkout. Try again.');
    } catch {
      onError('Could not open checkout. Try again.');
    } finally {
      setCheckoutBusy(null);
    }
  }, [onError]);

  startCheckoutRef.current = startCheckout;

  const ctaLabel = (tier: PurchasableTier): string =>
    experiences?.[tier.id]?.cta ?? `Join ${tier.name} for ${offerPrice(tier.priceCents)}`;

  const purchaseAction = (tier: PurchasableTier): ReactNode => (
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
                    : o.confirmEmailPrompt}
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

  return { hasSession, setHasSession, startCheckout, purchaseAction };
}
