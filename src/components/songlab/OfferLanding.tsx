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
// AUTH IS NOT WEAKENED HERE. A logged-out attendee is created through the SAME
// `signUp` the normal form uses (same endpoint, same rules, same rate limits); this page
// only stops asking for a username and a password of their own. Because the project
// requires email confirmation today, that call returns no session, so the page says so
// plainly and the chosen song rides through verification on the existing
// user_metadata.pending_next rail (?claim=1&o=<option>), which finishes the join and the
// vote automatically when they tap the link. If the project is ever switched to
// auto-confirm, the identical code path completes in the room with no further change.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Check, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { preselectedOption, type DecisionOption } from '@/lib/songLab/core';
import {
  BALLOT_CTA_LABEL,
  BALLOT_SUBMITTING_LABEL,
  BALLOT_NETWORK_ERROR,
  validateBallotSubmission,
  needsIdentity,
  ballotDisclosure,
  possessive,
  ballotErrorFor,
  cleanFirstName,
  MAX_FIRST_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  type BallotField,
} from '@/lib/songLab/voteForm';

export interface LandingBallot {
  question: string;
  options: DecisionOption[];
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
}

interface ClaimResult {
  joined: boolean;
  alreadyMember: boolean;
  voted: boolean;
  destination: string;
  rewardPath: string | null;
}

/** A password the fan never types and never needs: their email is the recovery path, and
 *  Google sign-in remains available. Generated with the platform CSPRNG, never Math.random. */
function generatePassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => b.toString(36)).join('').slice(0, 28);
  return `Crwn-${body}-9Aa!`;
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
}: OfferLandingProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading, signUp } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<BallotField | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [done, setDone] = useState<ClaimResult | null>(null);
  const autoClaimed = useRef(false);
  const identityRef = useRef<HTMLDivElement | null>(null);

  const ballotMode = !!ballot && ballot.options.length >= 2;
  const signedIn = !!user;
  const claimBase = `/${artistSlug}/join/${offerSlug}?claim=1`;
  const nextWithVote = (optionId: string | null) =>
    optionId ? `${claimBase}&o=${optionId}` : claimBase;

  const claim = useCallback(async (optionId: string | null) => {
    setBusy(true);
    setError(null);
    setErrorField(null);
    try {
      const res = await fetch('/api/song-lab/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistSlug, offerSlug, ...(optionId ? { optionId } : {}) }),
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

  // Bring the newly revealed identity fields into view without stealing focus (a forced
  // focus mid-flow is hostile to a screen reader and pops the keyboard over the choices).
  useEffect(() => {
    if (!selected || signedIn || done || sentTo) return;
    identityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selected, signedIn, done, sentTo]);

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
    // Logged out: create the account through the canonical signup, carrying the chosen
    // song so it survives email verification. No username and no chosen password: those
    // are the only two things this form drops, and neither is an authorization control.
    setBusy(true);
    setError(null);
    setErrorField(null);
    const cleanEmail = email.trim();
    const { error: signUpError } = await signUp(
      cleanEmail,
      generatePassword(),
      undefined,
      cleanFirstName(firstName),
      undefined,
      nextWithVote(selected),
    );
    if (signUpError) {
      // Includes "already registered" where the project reports it. Never assert whether
      // the address exists: that is the enumeration answer, and the sign-in link below
      // covers the fan who knows they have an account.
      setError('We could not finish that. Check the email address, or sign in below.');
      setErrorField('email');
      setBusy(false);
      return;
    }
    // A session exists only when the project auto-confirms. Otherwise the vote completes
    // when they tap the link in their email.
    const { data: { session } } = await createBrowserSupabaseClient().auth.getSession();
    if (session) {
      claim(selected);
      return;
    }
    setSentTo(cleanEmail);
    setBusy(false);
  };

  const selectedLabel = ballot?.options.find((o) => o.id === selected)?.label ?? '';

  /* ── Sent-the-email state (today's default: confirmation required) ── */
  if (sentTo) {
    return (
      <Shell>
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-crwn-gold flex items-center justify-center">
          <Mail className="w-8 h-8 text-crwn-bg" aria-hidden />
        </div>
        <h1 className="text-3xl font-bold text-crwn-text mb-4">One more tap</h1>
        <p className="text-lg text-crwn-text-secondary mb-4">
          {`We sent a link to ${sentTo}. Open it on this phone and your vote for ${selectedLabel} is in.`}
        </p>
        <p className="text-base text-crwn-text-secondary">
          {`It can take a minute to arrive. Check your junk folder if you do not see it.`}
        </p>
        <p className="mt-6 text-base text-crwn-text-secondary">
          {`Already have a CRWN account? `}
          <a href={`/login?next=${encodeURIComponent(nextWithVote(selected))}`} className="text-crwn-gold underline">
            Sign in to finish
          </a>
        </p>
      </Shell>
    );
  }

  /* ── Confirmation state ── */
  if (done) {
    const primaryHref = done.rewardPath ?? done.destination;
    const primaryLabel = done.rewardPath
      ? `See what ${artistName} left for you`
      : 'See how the vote is going';
    return (
      <Shell>
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-crwn-gold flex items-center justify-center">
          <Check className="w-9 h-9 text-crwn-bg" strokeWidth={3} aria-hidden />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-crwn-text mb-4" aria-live="polite">
          {done.voted ? 'Your vote is in' : "You're in"}
        </h1>
        {done.voted && selectedLabel ? (
          <p className="text-xl text-crwn-text mb-3">{`You picked ${selectedLabel}.`}</p>
        ) : null}
        {!done.voted ? (
          <p className="text-lg text-crwn-text-secondary mb-3">
            We could not count this vote (it may have just closed), but your spot is saved.
          </p>
        ) : null}
        <p className="text-lg text-crwn-text-secondary mb-8">
          {`You're in ${possessive(artistName)} free fan community. ${artistName} can send you the result and news about upcoming shows.`}
        </p>
        <a
          href={primaryHref}
          className="block w-full py-5 rounded-full bg-crwn-gold text-crwn-bg text-xl font-bold hover:bg-crwn-gold/90 active:scale-[0.98] transition"
        >
          {primaryLabel}
        </a>
        {done.rewardPath ? (
          <a href={done.destination} className="inline-block mt-5 text-base text-crwn-gold hover:underline">
            See how the vote is going
          </a>
        ) : null}
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

      <div
        role="radiogroup"
        aria-label={ballot!.question}
        className="space-y-3 mb-6"
      >
        <p className="text-lg font-semibold text-crwn-text">Tap your pick:</p>
        {ballot!.options.map((o) => {
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

      {selected && needsIdentity(signedIn) ? (
        <div ref={identityRef} className="text-left space-y-4 mb-6">
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
              className="w-full min-h-[60px] rounded-2xl bg-crwn-surface px-4 py-4 text-xl text-crwn-text ring-1 ring-white/15 outline-none focus:ring-2 focus:ring-crwn-gold"
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
              className="w-full min-h-[60px] rounded-2xl bg-crwn-surface px-4 py-4 text-xl text-crwn-text ring-1 ring-white/15 outline-none focus:ring-2 focus:ring-crwn-gold"
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
  return (
    <div className="min-h-screen bg-crwn-bg flex flex-col items-center justify-center px-5 py-10">
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
