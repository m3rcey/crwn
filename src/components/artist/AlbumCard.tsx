'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useFavorites } from '@/hooks/useFavorites';
import { supabase } from '@/lib/supabase/client';
import { Album, Track } from '@/types';
import Image from 'next/image';
import { TrackActionButtons } from '@/components/shared/TrackActionButtons';
import { TrackShareButton } from '@/components/shared/TrackShareButton';
import { Play, Pause, Lock, Check, Loader2, Link2 } from 'lucide-react';
import Link from 'next/link';

interface AlbumCardProps {
  album: Album;
  artistSlug: string;
}

export function AlbumCard({ album, artistSlug }: AlbumCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { isLiked, toggleFavorite } = useFavorites();

  const loadTracks = useCallback(async () => {
    if (!isExpanded) return;
    setIsLoading(true);

    const { data } = await supabase
      .from('album_tracks')
      .select('*, track:tracks(*)')
      .eq('album_id', album.id)
      .order('track_number');

    if (data) {
      const albumTracks = data
        .filter((at) => at.track && (at.track as any).is_active !== false)
        .map((at) => ({ ...at.track, position: at.track_number }));
      setTracks(albumTracks as Track[]);
    }
    setIsLoading(false);
  }, [isExpanded, album.id]);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Check if user has access to this album
  const { tierId } = useSubscription(album.artist_id);
  const hasAccess = album.is_free || (tierId && album.allowed_tier_ids?.includes(tierId));

  return (
    <div className="neu-raised neu-card-hover overflow-hidden">
      {/* Album Header - Click to navigate to full album */}
      <Link
        href={`/artist/${artistSlug}/album/${album.id}`}
        className="flex items-center gap-4 p-4 hover:bg-crwn-elevated/30"
      >
        <div className="w-16 h-16 rounded-lg bg-crwn-elevated overflow-hidden flex-shrink-0 relative shadow-inner">
          {album.album_art_url ? (
            <Image src={album.album_art_url} alt={album.title} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">🎵</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-crwn-text truncate">{album.title}</h3>
            {!hasAccess && <Lock className="w-4 h-4 text-crwn-gold flex-shrink-0" />}
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(`https://crwn-mauve.vercel.app/artist/${artistSlug}/album/${album.id}`);
              }}
              className="text-crwn-text-secondary hover:text-crwn-gold transition-colors p-1"
              title="Copy share link"
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-sm text-crwn-text-secondary">
            {album.track_count || 0} tracks • {album.release_date}
          </p>
        </div>
      </Link>

      {/* Expanded Track List */}
      {isExpanded && (
        <div className="neu-inset mx-4 mb-4 p-2">
          {!hasAccess ? (
            <div className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-crwn-gold mb-2">
                <Lock className="w-4 h-4" />
                <span>Subscribe to listen</span>
              </div>
              <p className="text-sm text-crwn-text-secondary">
                This album is available for subscribers only
              </p>
            </div>
          ) : isLoading ? (
            <div className="p-4 flex justify-center">
              <Loader2 className="w-6 h-6 text-crwn-gold animate-spin" />
            </div>
          ) : tracks.length > 0 ? (
            <div className="space-y-1">
              {tracks.map((track, index) => (
                <div
                  key={track.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-crwn-elevated/50 transition-colors group"
                >
                  <span className="w-6 text-center text-crwn-text-secondary text-sm">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-crwn-text truncate">{track.title}</p>
                    <p className="text-xs text-crwn-text-secondary">
                      {formatDuration(track.duration)}
                    </p>
                  </div>
                  <TrackActionButtons 
                    trackId={track.id} 
                    size="sm" 
                    isLiked={isLiked(track.id)}
                    onToggleLike={() => toggleFavorite(track.id)}
                  />
                  <TrackShareButton
                    trackId={track.id}
                    trackTitle={track.title}
                    artistSlug={artistSlug}
                    size="sm"
                  />
                  <button
                    onClick={() => {
                      // Play the track - would need to integrate with player
                    }}
                    className="p-1 text-crwn-text-secondary hover:text-crwn-gold opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-4 text-center text-crwn-text-secondary">
              No tracks in this album
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface AlbumsSectionProps {
  albums: Album[];
  artistSlug: string;
}

export function AlbumsSection({ albums, artistSlug }: AlbumsSectionProps) {
  if (albums.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-crwn-text mb-4">Albums</h2>
      <div className="space-y-4">
        {albums.map((album) => (
          <AlbumCard key={album.id} album={album} artistSlug={artistSlug} />
        ))}
      </div>
    </section>
  );
}
