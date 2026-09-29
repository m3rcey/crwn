'use client';

// The lead-magnet landing client. One job: the shortest possible path from a tap to the
// promised benefit.
//
// TWO MODES.
//
// Classic (no ballot): headline, description, one CTA carrying the artist's own label.
// Unchanged behavior for download/recognition/other magnets.
//
// BALLOT (a `vote` magnet whose decision is open): the songs ARE the page. This is scanned
// off a QR code in a live room after the artist asked from the stage for a vote, so the
// attendee's intent is to VOTE, and the free membership is the relationship created
// underneath that single action. Order: see the choices, tap one, then the smallest
// identity CRWN can accept appears beneath the choice, then one gold "Cast my vote".
// Asking them to "Join free" before showing the songs inverted that intent, which is the
// bug this mode exists to fix.
//
// Built for an audience that skews 60+: large type, 64px targets, plain words, visible
// labels (not placeholder-only), no CRWN vocabulary, and a confirmation screen rather
// than a silent redirect.
//
// AUTH IS NOT WEAKENED HERE, AND THE VOTE NO LONGER WAITS ON EMAIL. A logged-out
// attendee's submission goes to /api/song-lab/live-claim, which counts the vote against a
// CAPTURED CONTACT (an unverified auth user, exactly the row `signUp` already writes)
// and returns NO session. Nobody is logged in by voting; signing in still requires
// proving inbox ownership through the emailed link. An address that already belongs to a
// VERIFIED account is refused and routed to sign-in, because casting a vote in a real
// person's name on an unproven claim is worse than one extra tap for the rare fan who
// has an account and is not signed in on this phone.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Check, Mail, Pause, Play, Music } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { preselectedOption, type DecisionOption } from '@/lib/songLab/core';
import { accountEmailNote } from '@/lib/songLab/liveClaim';
import { VoteCountdown } from '@/components/songlab/VoteCountdown';
import { usePlayer } from '@/hooks/usePlayer';
import { TierOfferExperience } from '@/components/offer/TierOfferExperience';
import { useOfferPurchase, offerPrice } from '@/components/offer/useOfferPurchase';
import type { TierOfferExperience as OfferConfig } from '@/lib/offerExperience/types';
import type { Track } from '@/types';
import {
  BALLOT_CTA_LABEL,
  BALLOT_SUBMITTING_LABEL,
  BALLOT_NETWORK_ERROR,
  validateBallotSubmission,
  needsIdentity,
  ballotDisclosure,
  possessive,
  ballotErrorFor,
  successCta,
  cleanFirstName,
  MAX_FIRST_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  type BallotField,
} from '@/lib/songLab/voteForm';

/** A ballot option as the page renders it: the stored option plus, for an online vote, its
 *  song as a playable track row (read from tracks_public AS THE VISITOR and pre-signed, so it
 *  is absent when the visitor may not play it). It plays through the app's ONE player, which
 *  is what keeps two songs from playing at once and shows the same bar as the artist page. */
export type LandingOption = DecisionOption & { track?: Track };

/** The artist's ladder sold under an online vote: the same primary/downsell and offer
 *  experiences the drop page renders, resolved server-side. */
export interface LandingOfferTier {
  id: string;
  name: string;
  priceCents: number;
  description: string;
  benefits: string[];
}
export interface LandingOffers {
  primary: LandingOfferTier;
  downsell: LandingOfferTier | null;
  experiences: Record<string, OfferConfig>;
}

export interface LandingBallot {
  /** Which show's poll this is. Sent back with the vote so the server can refuse a
   *  submission whose show closed while the page was open. */
  decisionId: string;
  question: string;
  options: LandingOption[];
  /** Absolute closing instant, or null when the vote runs until the artist closes it. */
  closesAt?: string | null;
}

/** No ballot right now: either between sets, or the night is over. */
export interface LandingInterlude {
  kind: 'between' | 'ended';
  endedLabel: string | null;
  nextLabel: string | null;
  opensAtLabel: string | null;
}

interface OfferLandingProps {
  artistSlug: string;
  artistName: string;
  avatarUrl: string | null;
  offerSlug: string;
  headline: string;
  description: string | null;
  ctaLabel: string;
  ballot?: LandingBallot | null;
  interlude?: LandingInterlude | null;
  offers?: LandingOffers | null;
}

interface ClaimResult {
  joined: boolean;
  alreadyMember: boolean;
  voted: boolean;
  destination: string;
  rewardPath: string | null;
  /** Whether the account-access email went out. Never a condition of the vote. */
  emailSent?: boolean;
  /** Where the poll stands now, counting every source. */
  results?: PollResults | null;
}

interface PollResults {
  options: Array<{ id: string; label: string; votes: number; percent: number }>;
  total: number;
}

export function OfferLanding({
  artistSlug,
  artistName,
  avatarUrl,
  offerSlug,
  headline,
  description,
  ctaLabel,
  ballot,
  interlude,
  offers,
}: OfferLandingProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<BallotField | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { currentTrack, isPlaying, play, pause } = usePlayer();
  // The ballot's songs, in ballot order: the queue the player advances through.
  const ballotTracks = (ballot?.options ?? []).map((o) => o.track).filter((t): t is Track => !!t);

  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [done, setDone] = useState<ClaimResult | null>(null);
  const autoClaimed = useRef(false);
  const identityRef = useRef<HTMLDivElement | null>(null);

  // ── The ladder under the result (online vote only) ──
  // The stage is DERIVED: a counted vote or a cancelled checkout opens the primary offer, a
  // paid checkout shows the welcome, and only an explicit "Not right now" moves it (to the
  // downsell). A cancel returns to the PRIMARY: backing out of checkout is not a no.
  const [declined, setDeclined] = useState(false);
  const [offerError, setOfferError] = useState('');
  const purchase = useOfferPurchase({
    email,
    setEmail,
    experiences: offers?.experiences,
    returnPath: () => `/${artistSlug}/join/${offerSlug}`,
    attributionSource: 'song_lab_vote',
    utmCampaignFallback: `${artistSlug}-${offerSlug}`,
    captureStep: 'Vote above',
    confirmEmailPrompt: 'Confirm the email you voted with and we will send a code.',
    onError: setOfferError,
  });
  const offerBeacon = useCallback((tierId: string, eventType: 'tier_card_viewed' | 'tier_vsl_started' | 'tier_offer_declined') => {
    fetch('/api/tier-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tierIds: [tierId], eventType, source: 'direct' }),
    }).catch(() => {});
  }, []);
  const hasOffer = !!offers && ballotTracks.length > 0;
  const returnStatus = hasOffer ? searchParams.get('subscription') : null;
  const offerStage: 'primary' | 'downsell' | 'joined' | null = !hasOffer
    ? null
    : returnStatus === 'success'
      ? 'joined'
      : done || returnStatus === 'canceled'
        ? (declined && offers!.downsell ? 'downsell' : 'primary')
        : null;

  useEffect(() => {
    if (!offers) return;
    if (offerStage === 'primary') offerBeacon(offers.primary.id, 'tier_card_viewed');
    if (offerStage === 'downsell' && offers.downsell) offerBeacon(offers.downsell.id, 'tier_card_viewed');
    if (offerStage === 'primary' || offerStage === 'downsell') window.scrollTo({ top: 0 });
  }, [offerStage, offers, offerBeacon]);

  const ballotMode = !!ballot && ballot.options.length >= 2;
  const signedIn = !!user;
  const claimBase = `/${artistSlug}/join/${offerSlug}?claim=1`;
  // How this fan reached the page (a QR flyer or the JUBO text). Reporting only: it
  // never affects what they see or what they may do, and the server allowlists it.
  const sourceParam = searchParams.get('utm_source') || searchParams.get('src') || null;
  const carrySource = sourceParam ? `&utm_source=${encodeURIComponent(sourceParam)}` : '';
  const nextWithVote = (optionId: string | null) =>
    `${claimBase}${optionId ? `&o=${optionId}` : ''}${carrySource}`;

  const claim = useCallback(async (optionId: string | null) => {
    setBusy(true);
    setError(null);
    setErrorField(null);
    try {
      const res = await fetch('/api/song-lab/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistSlug,
          offerSlug,
          ...(optionId ? { optionId } : {}),
          // The show this page was displaying. The server refuses the vote (but still
          // joins them) if that show has since closed, so a Show 1 pick submitted after
          // the handover is never silently counted in Show 2.
          ...(ballot?.decisionId ? { decisionId: ballot.decisionId } : {}),
          ...(sourceParam ? { source: sourceParam } : {}),
          // The page's own query string, so link tags survive into the claim row.
          query: typeof window !== 'undefined' ? window.location.search : '',
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.destination) {
        if (ballotMode) {
          setDone({
            joined: !!data.joined,
            alreadyMember: !!data.alreadyMember,
            voted: !!data.voted,
            destination: data.destination,
            rewardPath: typeof data.rewardPath === 'string' ? data.rewardPath : null,
            results: data.results ?? null,
          });
          setBusy(false);
          return;
        }
        router.push(data.destination);
        return;
      }
      setError(ballotErrorFor(data?.reason, data?.error));
      setBusy(false);
    } catch {
      setError(BALLOT_NETWORK_ERROR);
      setBusy(false);
    }
  }, [artistSlug, offerSlug, router, ballotMode]);

  // Back from signup/verification with ?claim=1: finish without another tap. The carried
  // choice is re-validated against the real ballot; an unknown value still joins them and
  // they pick by hand on the Lab.
  useEffect(() => {
    if (isLoading || !user || autoClaimed.current) return;
    if (searchParams.get('claim') === '1') {
      autoClaimed.current = true;
      const carried = ballot ? preselectedOption(searchParams.get('o'), ballot.options) : null;
      if (carried) setSelected(carried);
      claim(carried);
    }
  }, [isLoading, user, searchParams, claim, ballot]);

  // The ballot always opens at the TOP: the artist, the headline, then the songs. A browser
  // restores the old scroll position on reload and back/forward, which dropped a returning
  // fan straight onto the vote button with the artist and the headline scrolled away.
  useEffect(() => {
    if (!ballotMode) return;
    let previous: ScrollRestoration | null = null;
    try {
      previous = window.history.scrollRestoration;
      window.history.scrollRestoration = 'manual';
    } catch { /* fine */ }
    window.scrollTo(0, 0);
    return () => {
      try { if (previous) window.history.scrollRestoration = previous; } catch { /* fine */ }
    };
  }, [ballotMode]);

  // Bring the newly revealed identity fields into view without stealing focus (a forced
  // focus mid-flow is hostile to a screen reader and pops the keyboard over the choices).
  useEffect(() => {
    if (!selected || signedIn || done || needsSignIn) return;
    identityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selected, signedIn, done, needsSignIn]);

  const submitBallot = async () => {
    if (busy) return;
    const rejection = validateBallotSubmission({ selectedOptionId: selected, signedIn, firstName, email });
    if (rejection) {
      setError(rejection.message);
      setErrorField(rejection.field);
      return;
    }
    if (signedIn) {
      claim(selected);
      return;
    }
    // Logged out: ONE request counts the vote. The server creates (or reuses) the captured
    // contact, joins the free tier, records the vote and emails an account link afterward.
    // It deliberately returns no session, so nothing here logs anybody in.
    setBusy(true);
    setError(null);
    setErrorField(null);
    try {
      const res = await fetch('/api/song-lab/live-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistSlug,
          offerSlug,
          optionId: selected,
          decisionId: ballot?.decisionId,
          firstName: cleanFirstName(firstName),
          email: email.trim(),
          ...(sourceParam ? { source: sourceParam } : {}),
          // The page's own query string, so link tags survive into the claim row.
          query: typeof window !== 'undefined' ? window.location.search : '',
        }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        setDone({
          joined: !!data.joined,
          alreadyMember: !!data.alreadyMember,
          voted: !!data.voted,
          destination: data.destination,
          rewardPath: typeof data.rewardPath === 'string' ? data.rewardPath : null,
          emailSent: !!data.emailSent,
          results: data.results ?? null,
        });
        setBusy(false);
        return;
      }

      // Only reachable before the public-votes migration is applied: the server could not
      // store a vote for an address that belongs to an account, and says so rather than
      // pretending. Once that table exists this branch stops happening.
      if (data?.needsSignIn) {
        setNeedsSignIn(true);
        setBusy(false);
        return;
      }

      setError(ballotErrorFor(data?.reason, data?.error));
      setErrorField(data?.field === 'firstName' || data?.field === 'email' ? data.field : null);
      setBusy(false);
    } catch {
      setError(BALLOT_NETWORK_ERROR);
      setBusy(false);
    }
  };

  const selectedLabel = ballot?.options.find((o) => o.id === selected)?.label ?? '';

  /* ── The address belongs to a verified CRWN account ──
     CRWN will not cast a vote or join a membership in a real person's name on an
     unproven claim, so this is the ONE case that asks for a sign-in. One tap, and the
     chosen song rides along. */
  if (needsSignIn) {
    return (
      <Shell>
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-crwn-gold flex items-center justify-center">
          <Mail className="w-8 h-8 text-crwn-bg" aria-hidden />
        </div>
        <h1 className="text-3xl font-bold text-crwn-text mb-4">You already have an account</h1>
        <p className="text-lg text-crwn-text-secondary mb-8">
          {`Sign in and your vote${selectedLabel ? ` for ${selectedLabel}` : ''} goes straight in.`}
        </p>
        <a
          href={`/login?next=${encodeURIComponent(nextWithVote(selected))}`}
          className="block w-full py-5 rounded-full bg-crwn-gold text-crwn-bg text-xl font-bold"
        >
          Sign in and vote
        </a>
        <button
          onClick={() => { setNeedsSignIn(false); setEmail(''); }}
          className="mt-5 text-base text-crwn-gold underline"
        >
          Use a different email
        </button>
      </Shell>
    );
  }

  /* ── Back from a paid checkout ── */
  if (offerStage === 'joined') {
    return (
      <Shell>
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-crwn-gold flex items-center justify-center">
          <Check className="w-9 h-9 text-crwn-bg" strokeWidth={3} aria-hidden />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-crwn-text mb-4">{"You're in"}</h1>
        <p className="text-lg text-crwn-text-secondary mb-8">
          {`Your membership with ${artistName} is active. Your receipt is in your email.`}
        </p>
        <a
          href={`/${artistSlug}`}
          className="block w-full py-5 rounded-full bg-crwn-gold text-crwn-bg text-xl font-bold hover:bg-crwn-gold/90 transition"
        >
          {`Go to ${possessive(artistName)} page`}
        </a>
      </Shell>
    );
  }

  /* ── The ladder, straight after the vote (online vote only) ──
     Same presentation and the same purchase cluster as the drop page: the primary rung's
     full experience, and an explicit "Not right now" rolls down to the cheaper rung. */
  if (hasOffer && (offerStage === 'primary' || offerStage === 'downsell')) {
    const tier = offerStage === 'downsell' && offers!.downsell ? offers!.downsell : offers!.primary;
    const config = offers!.experiences[tier.id];
    if (config) {
      const isPrimary = tier.id === offers!.primary.id;
      return (
        <div className="min-h-screen bg-crwn-bg">
          <div className={`w-full max-w-xl mx-auto px-5 pt-8 ${currentTrack ? 'pb-40' : 'pb-16'}`}>
            <div className="mb-6 rounded-2xl bg-crwn-surface ring-1 ring-crwn-gold/40 px-5 py-4 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-crwn-gold flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-crwn-bg" strokeWidth={3} aria-hidden />
              </span>
              <p className="text-base text-crwn-text text-left">
                {done?.voted && selectedLabel ? `Your vote for ${selectedLabel} is in.` : 'Your vote is in.'}
                {done && (done.joined || done.alreadyMember) ? ` You're on ${possessive(artistName)} list.` : ''}
              </p>
            </div>
            <TierOfferExperience
              artist={{ name: artistName, avatarUrl }}
              tier={tier}
              config={config}
              price={offerPrice}
              actionSlot={purchase.purchaseAction(tier)}
              onDecline={isPrimary && offers!.downsell ? () => {
                offerBeacon(tier.id, 'tier_offer_declined');
                setDeclined(true);
              } : undefined}
              declineLabel={isPrimary && offers!.downsell ? 'Not right now' : undefined}
              onVslStart={() => offerBeacon(tier.id, 'tier_vsl_started')}
            />
            {offerError ? <p className="mt-4 text-sm text-red-400 text-center" role="alert">{offerError}</p> : null}
          </div>
        </div>
      );
    }
  }

  /* ── Confirmation state ── */
  if (done) {
    // This screen ENDS the journey: the live percentages are right here, so there is
    // nothing worth sending the fan to except a reward the artist actually configured.
    const cta = successCta(done.rewardPath, artistName);
    return (
      <Shell>
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-crwn-gold flex items-center justify-center">
          <Check className="w-9 h-9 text-crwn-bg" strokeWidth={3} aria-hidden />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-crwn-text mb-4" aria-live="polite">
          {done.voted ? 'Your vote is in' : "You're in"}
        </h1>
        {done.voted && selectedLabel ? (
          <p className="text-xl text-crwn-text mb-6">{`You picked ${selectedLabel}.`}</p>
        ) : null}

        {/* Where the room stands. Real stored votes only, and the bars are the whole
            visualization: no charts, no legends, nothing small to squint at. Centered to
            match every other block on this screen; the BAR still spans the full width,
            because a progress bar whose length is trimmed stops meaning anything. */}
        {done.results && done.results.total > 0 ? (
          <div className="mb-8">
            <p className="text-base font-semibold text-crwn-text-secondary uppercase tracking-wide mb-3">
              Right now
            </p>
            <div className="space-y-4">
              {done.results.options.map((o) => (
                <div key={o.id}>
                  <div className="flex items-baseline justify-center gap-3 mb-1.5">
                    <span className="text-xl font-bold text-crwn-text">{o.label}</span>
                    <span className="text-2xl font-bold text-crwn-gold tabular-nums">{o.percent}%</span>
                  </div>
                  <div className="h-4 rounded-full bg-crwn-surface overflow-hidden" role="presentation">
                    <div
                      className="h-full rounded-full bg-crwn-gold transition-all"
                      style={{ width: `${o.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-base text-crwn-text-secondary">
              {done.results.total === 1 ? '1 vote so far' : `${done.results.total} votes so far`}
            </p>
          </div>
        ) : null}
        {!done.voted ? (
          <p className="text-lg text-crwn-text-secondary mb-3">
            We could not count this vote (it may have just closed), but your spot is saved.
          </p>
        ) : null}
        {/* Only claim the membership when one actually exists. The public-participant
            path (an address that already belongs to an account) counts the vote WITHOUT
            joining anything, so saying otherwise would be a promise CRWN did not keep.
            Both variants are the same size and tone, so neither reveals account status. */}
        <p className="text-lg text-crwn-text-secondary mb-8">
          {done.joined || done.alreadyMember
            ? `You're in ${possessive(artistName)} free fan community. ${artistName} can send you the result and news about upcoming shows.`
            : `To get the result and news about upcoming shows, sign in to CRWN with that email and join ${possessive(artistName)} free community.`}
        </p>
        {cta ? (
          <a
            href={cta.href}
            className="block w-full py-5 rounded-full bg-crwn-gold text-crwn-bg text-xl font-bold hover:bg-crwn-gold/90 active:scale-[0.98] transition"
          >
            {cta.label}
          </a>
        ) : null}
        {/* Subordinate on purpose: the vote is already counted, and this email is the key
            to the account later, never a condition of the vote. */}
        {done.emailSent ? (
          <p className="mt-6 text-base text-crwn-text-secondary leading-relaxed">
            {accountEmailNote(true)}
          </p>
        ) : null}
      </Shell>
    );
  }

  /* ── Between sets, or the night is over ──
     One state at a time, in large plain words. A closed poll is never rendered as a
     greyed-out ballot: for a room that skews 60+, a disabled card reads as "broken". */
  if (!ballotMode && interlude) {
    const between = interlude.kind === 'between';
    return (
      <Shell>
        <Hero artistName={artistName} avatarUrl={avatarUrl} headline={headline} description={null} uppercase />
        <div className="rounded-2xl bg-crwn-surface ring-1 ring-white/10 px-5 py-8">
          <p className="text-2xl font-bold text-crwn-text uppercase leading-tight" aria-live="polite">
            {between
              ? `${interlude.endedLabel || 'This show'} voting has ended`
              : 'Voting has ended for tonight'}
          </p>
          <p className="mt-4 text-xl text-crwn-text-secondary leading-relaxed">
            {between
              ? interlude.opensAtLabel
                ? `${interlude.nextLabel || 'The next show'} voting opens at ${interlude.opensAtLabel}.`
                : `${interlude.nextLabel || 'The next show'} voting opens soon.`
              : `Thanks for being part of the show. ${artistName} will share what won.`}
          </p>
          {between ? (
            <p className="mt-4 text-lg text-crwn-text-secondary">
              Keep this page. Come back when the next set starts.
            </p>
          ) : null}
        </div>
        {/* Secondary and deliberately not gold: the vote is over, but someone scanning a
            flyer afterward should still be able to keep in touch. Never a vote action. */}
        <a
          href={`/${artistSlug}`}
          className="mt-6 inline-block text-lg text-crwn-gold underline"
        >
          {`See ${possessive(artistName)} page`}
        </a>
      </Shell>
    );
  }

  /* ── Classic (non-ballot) magnets: unchanged ── */
  if (!ballotMode) {
    const handleClassic = () => {
      if (busy) return;
      if (user) claim(null);
      else router.push(`/signup?next=${encodeURIComponent(claimBase)}`);
    };
    return (
      <Shell>
        <Hero artistName={artistName} avatarUrl={avatarUrl} headline={headline} description={description} uppercase />
        <p className="text-sm text-crwn-text-secondary mb-6">Free. No card, ever.</p>
        <button
          onClick={handleClassic}
          disabled={busy || isLoading}
          className="w-full py-4 rounded-full bg-crwn-gold text-crwn-bg text-lg font-bold hover:bg-crwn-gold/90 active:scale-[0.98] transition disabled:opacity-60"
        >
          {busy ? BALLOT_SUBMITTING_LABEL : ctaLabel}
        </button>
        {error ? <p className="mt-4 text-base text-red-400" role="alert">{error}</p> : null}
        {!user && !isLoading ? (
          <p className="mt-5 text-sm text-crwn-text-secondary">
            {`Already with ${artistName}? `}
            <a href={`/login?next=${encodeURIComponent(claimBase)}`} className="text-crwn-gold hover:underline">
              Sign in
            </a>
          </p>
        ) : null}
      </Shell>
    );
  }

  /* ── Ballot mode: the songs are the page ── */
  return (
    <Shell>
      <Hero artistName={artistName} avatarUrl={avatarUrl} headline={headline} description={description} uppercase />

      {/* The clock sits ABOVE the choices: a fan deciding whether to bother needs to know
          how long they have before they read the options, not after. Refreshes the page
          on expiry so the closed state comes from the server rather than from this
          component's opinion. */}
      <VoteCountdown
        closesAt={ballot!.closesAt}
        size="lead"
        onExpire={() => router.refresh()}
      />

      <div
        role="radiogroup"
        aria-label={ballot!.question}
        className="space-y-3 mb-6"
      >
        <p className="text-lg font-semibold text-crwn-text">
          {ballotTracks.length ? 'Listen, then tap your pick:' : 'Tap your pick:'}
        </p>
        {ballotTracks.length ? (
          // Online vote: the album covers ARE the ballot. Shown whole, side by side, no
          // overlay. The cover + name is the choice; the gold corner button only plays, and
          // it is a sibling of the choice, never inside it, so a play tap never votes.
          <div className="grid grid-cols-3 gap-3">
            {ballot!.options.map((o) => {
              const t = o.track;
              const isSelected = selected === o.id;
              const isThisPlaying = !!t && currentTrack?.id === t.id && isPlaying;
              const pick = () => {
                setSelected(o.id);
                if (errorField === 'option') { setError(null); setErrorField(null); }
              };
              return (
                <div key={o.id}>
                  <div className="relative aspect-square w-full">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={t ? `${o.label}, ${t.title}` : o.label}
                      onClick={pick}
                      className={`absolute inset-0 rounded-xl overflow-hidden bg-crwn-elevated shadow-lg transition focus:outline-none focus-visible:ring-4 focus-visible:ring-crwn-gold/70 ${
                        isSelected ? 'ring-4 ring-crwn-gold' : 'ring-1 ring-white/15 hover:ring-white/40'
                      }`}
                    >
                      {t?.album_art_url ? (
                        <Image src={t.album_art_url} alt="" fill sizes="(max-width: 480px) 33vw, 150px" className="object-cover" />
                      ) : (
                        <Music className="absolute inset-0 m-auto w-8 h-8 text-crwn-text-secondary" aria-hidden />
                      )}
                      {isSelected ? (
                        <span className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-crwn-gold flex items-center justify-center shadow-md">
                          <Check className="w-4 h-4 text-crwn-bg" strokeWidth={3} aria-hidden />
                        </span>
                      ) : null}
                    </button>
                    {t ? (
                      <button
                        type="button"
                        onClick={() => (isThisPlaying ? pause() : play(t, ballotTracks))}
                        aria-label={isThisPlaying ? `Pause ${t.title}` : `Play ${t.title}`}
                        className="absolute bottom-1.5 right-1.5 w-10 h-10 rounded-full bg-crwn-gold flex items-center justify-center shadow-lg active:scale-95 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
                      >
                        {isThisPlaying
                          ? <Pause className="w-5 h-5 text-crwn-bg" fill="currentColor" aria-hidden />
                          : <Play className="w-5 h-5 text-crwn-bg ml-0.5" fill="currentColor" aria-hidden />}
                      </button>
                    ) : null}
                  </div>
                  {/* The name is a larger tap target for the same choice; the radio above
                      already announces it, so this stays out of the accessibility tree. */}
                  <div onClick={pick} aria-hidden className="mt-2 cursor-pointer text-center">
                    <span className={`block text-sm font-bold leading-tight ${isSelected ? 'text-crwn-gold' : 'text-crwn-text'}`}>{o.label}</span>
                    {t ? (
                      <span className={`block mt-0.5 text-xs ${isThisPlaying ? 'text-crwn-gold' : 'text-crwn-text-secondary'}`}>
                        {isThisPlaying ? `Playing: ${t.title}` : t.title}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : ballot!.options.map((o) => {
          const isSelected = selected === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => {
                setSelected(o.id);
                if (errorField === 'option') { setError(null); setErrorField(null); }
              }}
              // The tick is absolutely placed, not a flex sibling: an inline one would
              // shift the centered title sideways the moment a choice is selected.
              className={`relative w-full min-h-[72px] pl-5 pr-14 py-5 rounded-2xl text-xl sm:text-2xl font-bold text-center transition focus:outline-none focus-visible:ring-4 focus-visible:ring-crwn-gold/70 ${
                isSelected
                  ? 'bg-crwn-gold/15 text-crwn-text ring-2 ring-crwn-gold'
                  : 'bg-crwn-surface text-crwn-text ring-1 ring-white/15 hover:ring-white/30'
              }`}
            >
              <span className="block pl-9">{o.label}</span>
              {isSelected ? (
                <Check className="absolute right-5 top-1/2 -translate-y-1/2 w-7 h-7 text-crwn-gold" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Labels centered with the rest of the screen. The INPUTS keep their own
          left-aligned text: centered text inside a field fights the caret and is
          unreadable the moment someone types a long address. */}
      {selected && needsIdentity(signedIn) ? (
        <div ref={identityRef} className="space-y-4 mb-6">
          <div>
            <label htmlFor="ballot-first-name" className="block text-base font-semibold text-crwn-text mb-1.5">
              First name
            </label>
            <input
              id="ballot-first-name"
              type="text"
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); if (errorField === 'firstName') { setError(null); setErrorField(null); } }}
              autoComplete="given-name"
              autoCapitalize="words"
              maxLength={MAX_FIRST_NAME_LENGTH}
              aria-invalid={errorField === 'firstName'}
              className="w-full min-h-[60px] rounded-2xl bg-crwn-surface px-4 py-4 text-xl text-left text-crwn-text ring-1 ring-white/15 outline-none focus:ring-2 focus:ring-crwn-gold"
            />
          </div>
          <div>
            <label htmlFor="ballot-email" className="block text-base font-semibold text-crwn-text mb-1.5">
              Email
            </label>
            <input
              id="ballot-email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (errorField === 'email') { setError(null); setErrorField(null); } }}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={MAX_EMAIL_LENGTH}
              aria-invalid={errorField === 'email'}
              className="w-full min-h-[60px] rounded-2xl bg-crwn-surface px-4 py-4 text-xl text-left text-crwn-text ring-1 ring-white/15 outline-none focus:ring-2 focus:ring-crwn-gold"
            />
          </div>
        </div>
      ) : null}

      <button
        onClick={submitBallot}
        disabled={busy || isLoading}
        className="w-full py-5 rounded-full bg-crwn-gold text-crwn-bg text-xl font-bold uppercase tracking-wide hover:bg-crwn-gold/90 active:scale-[0.98] transition disabled:opacity-60"
      >
        {busy ? BALLOT_SUBMITTING_LABEL : BALLOT_CTA_LABEL}
      </button>

      <p className="mt-4 text-base text-crwn-text-secondary leading-relaxed">
        {ballotDisclosure(artistName)}
      </p>

      {error ? (
        <p className="mt-4 text-lg text-red-400" role="alert">{error}</p>
      ) : null}

      {!signedIn && !isLoading ? (
        <p className="mt-6 text-sm text-crwn-text-secondary">
          {`Already with ${artistName}? `}
          <a
            href={`/login?next=${encodeURIComponent(nextWithVote(selected))}`}
            className="text-crwn-gold hover:underline"
          >
            Sign in
          </a>
        </p>
      ) : null}
    </Shell>
  );
}

/* ── Shared chrome ── */

function Shell({ children }: { children: React.ReactNode }) {
  // The player bar is fixed to the bottom once a song plays; reserve its height so it never
  // covers the vote button or the email fields.
  const { currentTrack } = usePlayer();
  return (
    <div className={`min-h-screen bg-crwn-bg flex flex-col items-center justify-center px-5 py-10 ${currentTrack ? 'pb-36' : ''}`}>
      <div className="w-full max-w-md text-center page-fade-in">{children}</div>
    </div>
  );
}

function Hero({ artistName, avatarUrl, headline, description, uppercase }: {
  artistName: string;
  avatarUrl: string | null;
  headline: string;
  description: string | null;
  uppercase?: boolean;
}) {
  return (
    <>
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={artistName}
          width={72}
          height={72}
          className="rounded-full mx-auto mb-4 object-cover ring-2 ring-crwn-gold/60"
        />
      ) : null}
      <p className="text-sm font-semibold tracking-widest uppercase text-crwn-gold mb-3">{artistName}</p>
      <h1 className={`text-3xl sm:text-4xl font-bold text-crwn-text leading-tight mb-4 ${uppercase ? 'uppercase' : ''}`}>
        {headline}
      </h1>
      {description ? (
        <p className="text-lg text-crwn-text-secondary mb-4 whitespace-pre-line">{description}</p>
      ) : null}
    </>
  );
}
