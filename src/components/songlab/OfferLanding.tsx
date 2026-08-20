'use client';

// The lead-magnet landing client. One job: the shortest possible path from an Instagram
// tap to the promised benefit. Anonymous visitors read the offer and hit ONE gold CTA;
// signup preserves this page as the return destination (?claim=1) so the claim fires the
// moment they come back authenticated. Existing members skip signup entirely.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';

interface OfferLandingProps {
  artistSlug: string;
  artistName: string;
  avatarUrl: string | null;
  offerSlug: string;
  headline: string;
  description: string | null;
  ctaLabel: string;
}

export function OfferLanding({
  artistSlug,
  artistName,
  avatarUrl,
  offerSlug,
  headline,
  description,
  ctaLabel,
}: OfferLandingProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoClaimed = useRef(false);

  const claimPath = `/${artistSlug}/join/${offerSlug}?claim=1`;

  const claim = useCallback(async () => {
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch('/api/song-lab/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistSlug, offerSlug }),
      });
      const data = await res.json();
      if (res.ok && data.destination) {
        router.push(data.destination);
        return;
      }
      setError(data.error || 'Something went wrong. Please try again.');
      setClaiming(false);
    } catch {
      setError('Something went wrong. Please try again.');
      setClaiming(false);
    }
  }, [artistSlug, offerSlug, router]);

  // Back from signup/login with ?claim=1: finish the claim without another tap.
  useEffect(() => {
    if (isLoading || !user || autoClaimed.current) return;
    if (searchParams.get('claim') === '1') {
      autoClaimed.current = true;
      claim();
    }
  }, [isLoading, user, searchParams, claim]);

  const handleCta = () => {
    if (claiming) return;
    if (user) {
      claim();
    } else {
      router.push(`/signup?next=${encodeURIComponent(claimPath)}`);
    }
  };

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
        <h1 className="text-3xl sm:text-4xl font-bold text-crwn-text uppercase leading-tight mb-4">
          {headline}
        </h1>
        {description ? (
          <p className="text-base text-crwn-text-secondary mb-6 whitespace-pre-line">{description}</p>
        ) : null}

        <p className="text-sm text-crwn-text-secondary mb-6">
          Free. No card, ever.
        </p>

        <button
          onClick={handleCta}
          disabled={claiming || isLoading}
          className="w-full py-4 rounded-full bg-crwn-gold text-crwn-bg text-lg font-bold hover:bg-crwn-gold/90 active:scale-[0.98] transition disabled:opacity-60"
        >
          {claiming ? 'One moment...' : ctaLabel}
        </button>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

        {!user && !isLoading ? (
          <p className="mt-5 text-sm text-crwn-text-secondary">
            Already with {artistName}?{' '}
            <a
              href={`/login?next=${encodeURIComponent(claimPath)}`}
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
