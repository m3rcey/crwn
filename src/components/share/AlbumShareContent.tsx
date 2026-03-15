'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { ShareButtons } from '@/components/shared/ShareButtons';
import { Lock } from 'lucide-react';
import { GatedTrackPlayer } from '@/components/gating';

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
  tiers: { id: string; name: string; price: number }[];
}

export function AlbumShareContent({ album, tracks, artist, tiers }: AlbumShareContentProps) {
  const { user } = useAuth();
  const { tierId } = useSubscription(artist.id);

  const isFree = album.is_free !== false;
  const hasAccess = isFree || (tierId && album.allowed_tier_ids?.includes(tierId));
  const shareUrl = `https://thecrwn.app/artist/${artist.slug}/album/${album.id}`;
  const lowestTier = tiers[0];
  const coverUrl = album.album_art_url || album.cover_art_url || null;
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-crwn-bg stagger-fade-in">
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
        <Link
          href={`/artist/${artist.slug}`}
          className="inline-flex items-center gap-2 text-crwn-text-secondary hover:text-crwn-text mb-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm"
        >
          ← Back to {artist.displayName}
        </Link>

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
          <div className="neu-raised rounded-xl p-4 mb-6 text-center">
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

        {/* Track List */}
        {tracks.length > 0 ? (
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
