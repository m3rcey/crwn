'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/components/shared/Toast';
import { ShareButtons } from '@/components/shared/ShareButtons';
import { Lock, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { GatedTrackPlayer } from '@/components/gating';
import { hapticMedium, hapticSuccess, hapticError } from '@/lib/haptics';

interface TierData {
  id: string;
  name: string;
  price: number;
  description?: string | null;
  benefits?: string[];
}

interface AlbumShareContentProps {
  album: {
    id: string;
    title: string;
    album_art_url?: string | null;
    cover_art_url?: string | null;
    description?: string | null;
    is_free: boolean;
    allowed_tier_ids: string[] | null;
    price: number | null;
    artist_id: string;
  };
  tracks: {
    id: string;
    title: string;
    duration: number;
    album_art_url: string | null;
    audio_url_128: string | null;
    is_free: boolean;
  }[];
  artist: {
    id: string;
    slug: string;
    displayName: string;
    avatarUrl: string | null;
  };
  tiers: TierData[];
}

export function AlbumShareContent({ album, tracks, artist, tiers }: AlbumShareContentProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { tierId } = useSubscription(artist.id);
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [justSubscribed, setJustSubscribed] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchEndX.current - touchStartX.current;
    if (diff > 80) {
      router.back();
    }
  };

  const isFree = album.is_free !== false;
  const hasAccess = isFree || justSubscribed || (tierId && album.allowed_tier_ids?.includes(tierId));
  const shareUrl = `https://thecrwn.app/${artist.slug}/album/${album.id}`;
  const coverUrl = album.album_art_url || album.cover_art_url || null;
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);

  // Filter tiers to only those that unlock this album
  const relevantTiers = album.allowed_tier_ids?.length
    ? tiers.filter(t => album.allowed_tier_ids!.includes(t.id))
    : tiers;

  // Check for subscription=success in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscription') === 'success') {
      setJustSubscribed(true);
      hapticSuccess();
      showToast('Subscribed! Enjoy the album.', 'success');
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
      window.location.href = '/login';
      return;
    }

    setIsLoading(tier.id);

    try {
      if (tier.price === 0) {
        const res = await fetch('/api/stripe/free-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tierId: tier.id }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          setJustSubscribed(true);
          hapticSuccess();
          showToast('Subscribed! Enjoy the album.', 'success');
        } else if (res.status === 409) {
          setJustSubscribed(true);
          showToast('You\'re already subscribed!', 'success');
        } else {
          hapticError();
          showToast(data.error || 'Failed to subscribe', 'error');
        }
      } else {
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tierId: tier.id,
            artistSlug: artist.slug,
            returnUrl: `/${artist.slug}/album/${album.id}`,
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
    <div className="min-h-screen bg-crwn-bg stagger-fade-in" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Header */}
      <div className="relative h-48 sm:h-64 md:h-80 w-full">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={album.title}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-crwn-elevated to-crwn-bg" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-crwn-bg via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 -mt-16 relative z-10">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-crwn-text-secondary hover:text-crwn-text mb-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm"
        >
          ← Back to {artist.displayName}
        </button>

        {/* Album Info */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 sm:gap-6 mb-8">
          <div className="w-40 h-40 rounded-xl bg-crwn-elevated overflow-hidden flex-shrink-0 shadow-xl">
            {coverUrl ? (
              <Image
                src={coverUrl}
                alt={album.title}
                width={160}
                height={160}
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-5xl">
                💿
              </div>
            )}
          </div>
          <div>
            <p className="text-crwn-text-secondary text-sm uppercase tracking-wide">Album</p>
            <h1 className="text-3xl sm:text-4xl font-bold text-crwn-text mt-1">
              {album.title}
            </h1>
            {album.description && (
              <p className="text-crwn-text-secondary mt-2 max-w-xl">
                {album.description}
              </p>
            )}
            <p className="text-crwn-text-secondary mt-2">
              {tracks.length} track{tracks.length !== 1 ? 's' : ''} • {formatDuration(totalDuration)}
            </p>
          </div>
        </div>

        {/* Subscribe CTA if gated */}
        {!hasAccess && (
          <div className="mb-6">
            <p className="text-crwn-text-secondary text-sm text-center mb-4">
              <Lock className="w-4 h-4 inline-block mr-1 -mt-0.5 text-crwn-gold" />
              Subscribe to {artist.displayName} to unlock this album
            </p>
            <div className="space-y-3 max-w-md mx-auto">
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

        {/* Track List */}
        {(hasAccess && tracks.length > 0) ? (
          <div className="mb-8">
            {tracks.map((track) => (
              <GatedTrackPlayer
                key={track.id}
                track={track as any}
                artistId={artist.id}
                artistSlug={artist.slug}
                trackList={tracks as any}
              />
            ))}
          </div>
        ) : !hasAccess ? (
          <div className="mb-8 text-center py-6">
            <p className="text-crwn-text-secondary text-sm">
              {tracks.length} track{tracks.length !== 1 ? 's' : ''} waiting to be unlocked
            </p>
          </div>
        ) : (
          <p className="text-crwn-text-secondary mb-8">No tracks in this album.</p>
        )}

        {/* Share */}
        <div className="flex justify-center mb-8">
          <ShareButtons
            url={shareUrl}
            title={`${album.title} — ${artist.displayName}`}
            description={`${tracks.length} tracks on CRWN`}
          />
        </div>
      </div>
    </div>
  );
}
