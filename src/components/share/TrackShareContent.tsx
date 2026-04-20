'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { usePlayer } from '@/hooks/usePlayer';
import { useToast } from '@/components/shared/Toast';
import { ShareButtons } from '@/components/shared/ShareButtons';
import { ShareEarnWrapper } from '@/components/shared/ShareEarnWrapper';
import { Play, Lock, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { BackgroundImage } from '@/components/ui/BackgroundImage';
import { hapticMedium, hapticSuccess, hapticError } from '@/lib/haptics';

interface TierData {
  id: string;
  name: string;
  price: number;
  description?: string | null;
  benefits?: string[];
}

interface TrackShareContentProps {
  track: {
    id: string;
    title: string;
    album_art_url: string | null;
    audio_url_128: string | null;
    duration: number;
    is_free: boolean;
    allowed_tier_ids: string[] | null;
    price: number | null;
    artist_id: string;
  };
  artist: {
    id: string;
    slug: string;
    displayName: string;
    avatarUrl: string | null;
  };
  tiers: TierData[];
}

export function TrackShareContent({ track, artist, tiers }: TrackShareContentProps) {
  const { user } = useAuth();
  const { tierId, isSubscribed } = useSubscription(artist.id);
  const { play } = usePlayer();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [justSubscribed, setJustSubscribed] = useState(false);

  const isFree = track.is_free !== false;
  const hasAccess = isFree || justSubscribed || (tierId && track.allowed_tier_ids?.includes(tierId));
  const shareUrl = `https://thecrwn.app/${artist.slug}/track/${track.id}`;

  // Filter tiers to only those that unlock this track
  const relevantTiers = track.allowed_tier_ids?.length
    ? tiers.filter(t => track.allowed_tier_ids!.includes(t.id))
    : tiers;

  // Check for subscription=success in URL (returning from Stripe checkout)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscription') === 'success') {
      setJustSubscribed(true);
      hapticSuccess();
      showToast('Subscribed! Enjoy the track.', 'success');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [showToast]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSubscribe = async (tier: TierData) => {
    hapticMedium();

    if (!user) {
      // Redirect to login, then back here
      window.location.href = '/login';
      return;
    }

    setIsLoading(tier.id);

    try {
      if (tier.price === 0) {
        // Free tier — subscribe instantly
        const res = await fetch('/api/stripe/free-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tierId: tier.id }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          setJustSubscribed(true);
          hapticSuccess();
          showToast('Subscribed! Enjoy the track.', 'success');
        } else if (res.status === 409) {
          // Already subscribed
          setJustSubscribed(true);
          showToast('You\'re already subscribed!', 'success');
        } else {
          hapticError();
          showToast(data.error || 'Failed to subscribe', 'error');
        }
      } else {
        // Paid tier — Stripe checkout with return to this page
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tierId: tier.id,
            artistSlug: artist.slug,
            returnUrl: `/${artist.slug}/track/${track.id}`,
            interval: 'month',
          }),
        });
        const data = await res.json();

        if (data.url) {
          window.location.href = data.url;
        } else {
          hapticError();
          showToast(data.error || 'Failed to start checkout', 'error');
        }
      }
    } catch {
      hapticError();
      showToast('Something went wrong. Please try again.', 'error');
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="relative min-h-screen">
      <BackgroundImage src={track.album_art_url || '/backgrounds/bg-home.jpg'} overlayOpacity="bg-black/80" />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Back to artist */}
          <Link
            href={`/${artist.slug}`}
            className="flex items-center gap-2 text-crwn-text-secondary hover:text-crwn-gold text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{artist.displayName}</span>
          </Link>

          {/* Album Art */}
          <div className="neu-raised rounded-2xl overflow-hidden mb-6 aspect-square relative">
            {track.album_art_url ? (
              <Image
                src={track.album_art_url}
                alt={track.title}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-crwn-elevated flex items-center justify-center text-6xl">
                🎵
              </div>
            )}
            {!hasAccess && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Lock className="w-12 h-12 text-crwn-gold/70" />
              </div>
            )}
          </div>

          {/* Track Info */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-crwn-text">{track.title}</h1>
            <Link
              href={`/${artist.slug}`}
              className="text-crwn-gold hover:underline text-sm"
            >
              {artist.displayName}
            </Link>
            <p className="text-crwn-text-secondary text-xs mt-1">
              {formatDuration(track.duration)}
            </p>
          </div>

          {/* Play or Subscribe */}
          {hasAccess ? (
            <button
              onClick={() => play(track as never)}
              className="neu-button-accent w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 mb-4"
            >
              <Play className="w-5 h-5" fill="currentColor" />
              Play Now
            </button>
          ) : relevantTiers.length === 0 ? (
            <div className="mb-4 neu-raised rounded-xl p-4 text-center">
              <p className="text-crwn-text text-sm">
                This track isn&apos;t available yet.
              </p>
              <p className="text-crwn-text-secondary text-xs mt-1">
                {artist.displayName} hasn&apos;t set up access for it.
              </p>
            </div>
          ) : (
            <div className="mb-4">
              <p className="text-crwn-text-secondary text-sm text-center mb-4">
                Subscribe to {artist.displayName} to unlock this track
              </p>
              <div className="space-y-3">
                {relevantTiers.map((tier) => (
                  <button
                    key={tier.id}
                    onClick={() => handleSubscribe(tier)}
                    disabled={isLoading !== null}
                    className="w-full neu-raised rounded-xl p-4 flex items-center justify-between gap-3 hover:ring-1 hover:ring-crwn-gold/50 transition-all disabled:opacity-50 active:scale-[0.98]"
                  >
                    <div className="text-left">
                      <p className="text-crwn-text font-semibold">{tier.name}</p>
                      {tier.description && (
                        <p className="text-crwn-text-secondary text-xs mt-0.5 line-clamp-1">{tier.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isLoading === tier.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-crwn-gold" />
                      ) : (
                        <span className="neu-button-accent px-4 py-1.5 rounded-full text-crwn-bg text-sm font-semibold">
                          {tier.price === 0 ? 'Join Free' : `$${(tier.price / 100).toFixed(2)}/mo`}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {!user && (
                <p className="text-crwn-text-secondary text-xs text-center mt-3">
                  You&apos;ll need to sign up or log in first
                </p>
              )}
            </div>
          )}

          {/* Share */}
          <div className="flex justify-center">
            <ShareButtons
              url={shareUrl}
              title={`${track.title} — ${artist.displayName}`}
              description={`Listen on CRWN`}
            />
          </div>
          {isSubscribed && (
            <div className="flex justify-center mt-3">
              <ShareEarnWrapper
                artistSlug={artist.slug}
                artistId={artist.id}
                commissionRate={10}
                sharePath={`/${artist.slug}/track/${track.id}`}
                isSubscribedOverride={true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
