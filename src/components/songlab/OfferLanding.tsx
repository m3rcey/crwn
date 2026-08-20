'use client';

// The lead-magnet landing client. One job: the shortest possible path from a tap (an
// Instagram link or a QR scanned in a live room) to the promised benefit. Anonymous
// visitors read the offer and hit ONE gold CTA; signup preserves this page as the return
// destination (?claim=1) so the claim fires the moment they come back authenticated.
// Existing members skip signup entirely.
//
// Two modes:
// - Classic (no ballot): headline + one CTA, redirect to the benefit on claim. Unchanged.
// - Live show mode (ballot): a vote offer whose decision is open renders the ballot as
//   the FIRST screen. The fan taps a choice, then one submission joins the free tier AND
//   casts the vote (the choice rides through signup as ?o=). Built for audiences meeting
//   CRWN for the first time mid-show, some of them 60+: large type, large tap targets,
//   plain words, an explicit on-page disclosure that voting also joins the community,
//   and a confirmation screen instead of a silent redirect.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { preselectedOption, ballotCtaLabel, type DecisionOption } from '@/lib/songLab/core';

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
  const { user, isLoading } = useAuth();
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [done, setDone] = useState<ClaimResult | null>(null);
  const autoClaimed = useRef(false);

  const ballotMode = !!ballot && ballot.options.length >= 2;
  const claimBase = `/${artistSlug}/join/${offerSlug}?claim=1`;

  const claim = useCallback(async (optionId: string | null) => {
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch('/api/song-lab/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistSlug,
          offerSlug,
          ...(optionId ? { optionId } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok && data.destination) {
        if (ballotMode) {
          // In the live room the fan needs to SEE that it worked, not be teleported.
          setDone({
            joined: !!data.joined,
            alreadyMember: !!data.alreadyMember,
            voted: !!data.voted,
            destination: data.destination,
            rewardPath: typeof data.rewardPath === 'string' ? data.rewardPath : null,
          });
          setClaiming(false);
          return;
        }
        router.push(data.destination);
        return;
      }
      setError(data.error || 'Something went wrong. Please try again.');
      setClaiming(false);
    } catch {
      setError('Something went wrong. Please try again.');
      setClaiming(false);
    }
  }, [artistSlug, offerSlug, router, ballotMode]);

  // Back from signup/login with ?claim=1: finish the claim without another tap. In
  // ballot mode the carried choice (?o=) is re-validated against the real ballot; an
  // unknown value still joins and the fan picks by hand on the Lab.
  useEffect(() => {
    if (isLoading || !user || autoClaimed.current) return;
    if (searchParams.get('claim') === '1') {
      autoClaimed.current = true;
      const carried = ballot ? preselectedOption(searchParams.get('o'), ballot.options) : null;
      if (carried) setSelected(carried);
      claim(carried);
    }
  }, [isLoading, user, searchParams, claim, ballot]);

  const handleCta = () => {
    if (claiming) return;
    if (ballotMode && !selected) {
      setError('Tap a choice first, then press the gold button.');
      return;
    }
    if (user) {
      claim(ballotMode ? selected : null);
    } else {
      const next = ballotMode && selected ? `${claimBase}&o=${selected}` : claimBase;
      router.push(`/signup?next=${encodeURIComponent(next)}`);
    }
  };

  const signInNext = ballotMode && selected ? `${claimBase}&o=${selected}` : claimBase;

  /* ── Confirmation screen (ballot mode only) ── */
  if (done) {
    const primaryHref = done.rewardPath ?? done.destination;
    const primaryLabel = done.rewardPath
      ? `See what ${artistName} left for you`
      : 'See how the vote is going';
    return (
      <div className="min-h-screen bg-crwn-bg flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-md text-center page-fade-in">
          <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-crwn-gold flex items-center justify-center">
            <Check className="w-9 h-9 text-crwn-bg" strokeWidth={3} aria-hidden />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-crwn-text mb-4">
            {done.voted ? 'Your vote is in' : "You're in"}
          </h1>
          {!done.voted ? (
            <p className="text-lg text-crwn-text-secondary mb-3">
              We could not count this vote (it may have just closed), but your spot is saved.
            </p>
          ) : null}
          <p className="text-lg text-crwn-text-secondary mb-8">
            {`You're in ${artistName}'s free fan community. ${artistName} can now send you the results and news about upcoming shows.`}
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-crwn-bg flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md text-center page-fade-in">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={artistName}
            width={72}
            height={72}
            className="rounded-full mx-auto mb-4 object-cover ring-2 ring-crwn-gold/60"
          />
        ) : null}
        <p className="text-sm font-semibold tracking-widest uppercase text-crwn-gold mb-3">
          {artistName}
        </p>

        {ballotMode ? (
          <>
            <h1 className="text-3xl sm:text-4xl font-bold text-crwn-text leading-tight mb-2">
              {ballot!.question}
            </h1>
            <p className="text-lg text-crwn-text-secondary mb-6">Tap one:</p>

            <div role="radiogroup" aria-label={ballot!.question} className="space-y-3 mb-6">
              {ballot!.options.map((o) => {
                const isSelected = selected === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => { setSelected(o.id); setError(null); }}
                    className={`w-full min-h-[64px] px-5 py-4 rounded-2xl text-xl font-semibold text-left flex items-center justify-between gap-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-crwn-gold ${
                      isSelected
                        ? 'bg-crwn-gold/15 text-crwn-text ring-2 ring-crwn-gold'
                        : 'bg-crwn-surface text-crwn-text ring-1 ring-white/10 hover:ring-white/25'
                    }`}
                  >
                    <span>{o.label}</span>
                    {isSelected ? <Check className="w-6 h-6 shrink-0 text-crwn-gold" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl sm:text-4xl font-bold text-crwn-text uppercase leading-tight mb-4">
              {headline}
            </h1>
            {description ? (
              <p className="text-base text-crwn-text-secondary mb-6 whitespace-pre-line">{description}</p>
            ) : null}
            <p className="text-sm text-crwn-text-secondary mb-6">
              Free. No card, ever.
            </p>
          </>
        )}

        <button
          onClick={handleCta}
          disabled={claiming || isLoading}
          className={`w-full rounded-full bg-crwn-gold text-crwn-bg font-bold hover:bg-crwn-gold/90 active:scale-[0.98] transition disabled:opacity-60 ${
            ballotMode ? 'py-5 text-xl' : 'py-4 text-lg'
          }`}
        >
          {claiming ? 'One moment...' : ballotMode ? ballotCtaLabel(ctaLabel) : ctaLabel}
        </button>

        {ballotMode ? (
          <p className="mt-4 text-base text-crwn-text-secondary leading-relaxed">
            {`By voting, you also join ${artistName}'s free fan community, so ${artistName} can send you the results and upcoming shows. Free. No card, ever.`}
          </p>
        ) : null}

        {error ? <p className="mt-4 text-base text-red-400" role="alert">{error}</p> : null}

        {!user && !isLoading ? (
          <p className={`mt-5 text-crwn-text-secondary ${ballotMode ? 'text-base' : 'text-sm'}`}>
            {`Already with ${artistName}? `}
            <a
              href={`/login?next=${encodeURIComponent(signInNext)}`}
              className="text-crwn-gold hover:underline"
            >
              Sign in
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
