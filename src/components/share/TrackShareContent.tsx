'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { usePlayer } from '@/hooks/usePlayer';
import { ShareButtons } from '@/components/shared/ShareButtons';
import { Play, Lock, ArrowLeft } from 'lucide-react';
import { BackgroundImage } from '@/components/ui/BackgroundImage';

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
  tiers: { id: string; name: string; price: number }[];
}

export function TrackShareContent({ track, artist, tiers }: TrackShareContentProps) {
  const { user } = useAuth();
  const { tierId } = useSubscription(artist.id);
  const { play } = usePlayer();

  const isFree = track.is_free !== false; // null or true = free
  const hasAccess = isFree || (tierId && track.allowed_tier_ids?.includes(tierId));
  const shareUrl = `https://crwn-mauve.vercel.app/artist/${artist.slug}/track/${track.id}`;

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const lowestTier = tiers[0];

  return (
    <div className="relative min-h-screen">
      <BackgroundImage src={track.album_art_url || '/backgrounds/bg-home.jpg'} overlayOpacity="bg-black/80" />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Back to artist */}
          <Link
            href={`/artist/${artist.slug}`}
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
              href={`/artist/${artist.slug}`}
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
          ) : (
            <div className="neu-raised rounded-xl p-6 mb-4 text-center">
              <p className="text-crwn-text font-medium mb-2">This track is exclusive</p>
              <p className="text-crwn-text-secondary text-sm mb-4">
                Subscribe to {artist.displayName} to unlock this track and more.
              </p>
              {lowestTier && (
                <Link
                  href={`/artist/${artist.slug}`}
                  className="neu-button-accent inline-block px-8 py-3 rounded-xl font-semibold"
                >
                  Subscribe from ${(lowestTier.price / 100).toFixed(2)}/mo
                </Link>
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
        </div>
      </div>
    </div>
  );
}
