'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { usePlayer } from '@/hooks/usePlayer';
import { ShareButtons } from '@/components/shared/ShareButtons';
import { Play, Lock, ArrowLeft, Music } from 'lucide-react';
import { BackgroundImage } from '@/components/ui/BackgroundImage';

interface AlbumShareContentProps {
  album: {
    id: string;
    title: string;
    cover_art_url: string | null;
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
  tiers: { id: string; name: string; price: number }[];
}

export function AlbumShareContent({ album, tracks, artist, tiers }: AlbumShareContentProps) {
  const { user } = useAuth();
  const { tierId } = useSubscription(artist.id);
  const { play } = usePlayer();

  const isFree = album.is_free !== false; // null or true = free
  const hasAccess = isFree || (tierId && album.allowed_tier_ids?.includes(tierId));
  const shareUrl = `https://crwn-mauve.vercel.app/artist/${artist.slug}/album/${album.id}`;
  const lowestTier = tiers[0];

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative min-h-screen">
      <BackgroundImage src={album.cover_art_url || '/backgrounds/bg-home.jpg'} overlayOpacity="bg-black/80" />
      <div className="relative z-10 min-h-screen p-4 pt-8">
        <div className="w-full max-w-lg mx-auto">
          {/* Back to artist */}
          <Link
            href={`/artist/${artist.slug}`}
            className="flex items-center gap-2 text-crwn-text-secondary hover:text-crwn-gold text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{artist.displayName}</span>
          </Link>

          {/* Album Header */}
          <div className="flex gap-4 mb-6">
            <div className="w-32 h-32 neu-raised rounded-xl overflow-hidden flex-shrink-0 relative">
              {album.cover_art_url ? (
                <Image src={album.cover_art_url} alt={album.title} fill className="object-cover" />
              ) : (
                <div className="w-full h-full bg-crwn-elevated flex items-center justify-center text-4xl">💿</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-crwn-text">{album.title}</h1>
              <Link href={`/artist/${artist.slug}`} className="text-crwn-gold hover:underline text-sm">
                {artist.displayName}
              </Link>
              <p className="text-crwn-text-secondary text-xs mt-1">
                {tracks.length} track{tracks.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Subscribe CTA if gated */}
          {!hasAccess && (
            <div className="neu-raised rounded-xl p-4 mb-4 text-center">
              <Lock className="w-6 h-6 text-crwn-gold/70 mx-auto mb-2" />
              <p className="text-crwn-text text-sm font-medium mb-1">Exclusive Album</p>
              <p className="text-crwn-text-secondary text-xs mb-3">
                Subscribe to {artist.displayName} to unlock.
              </p>
              {lowestTier && (
                <Link
                  href={`/artist/${artist.slug}`}
                  className="neu-button-accent inline-block px-6 py-2 rounded-lg text-sm font-semibold"
                >
                  Subscribe from ${(lowestTier.price / 100).toFixed(2)}/mo
                </Link>
              )}
            </div>
          )}

          {/* Tracklist */}
          <div className="neu-raised rounded-xl overflow-hidden mb-6">
            {tracks.map((track, i) => {
              const trackAccessible = track.is_free || hasAccess;
              return (
                <div
                  key={track.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    i < tracks.length - 1 ? 'border-b border-crwn-elevated' : ''
                  } ${trackAccessible ? 'cursor-pointer hover:bg-crwn-elevated/30' : 'opacity-60'}`}
                  onClick={() => trackAccessible && play(track as never)}
                >
                  <span className="text-crwn-text-secondary text-xs w-5 text-right">{i + 1}</span>
                  {trackAccessible ? (
                    <Play className="w-4 h-4 text-crwn-gold flex-shrink-0" />
                  ) : (
                    <Lock className="w-4 h-4 text-crwn-text-secondary flex-shrink-0" />
                  )}
                  <span className={`flex-1 text-sm truncate ${trackAccessible ? 'text-crwn-text' : 'text-crwn-text-secondary'}`}>
                    {track.title}
                  </span>
                  <span className="text-xs text-crwn-text-secondary">{formatDuration(track.duration)}</span>
                </div>
              );
            })}
          </div>

          {/* Share */}
          <div className="flex justify-center">
            <ShareButtons
              url={shareUrl}
              title={`${album.title} — ${artist.displayName}`}
              description={`${tracks.length} tracks on CRWN`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
