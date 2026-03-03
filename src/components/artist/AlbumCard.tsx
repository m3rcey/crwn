'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase/client';
import { Album, Track } from '@/types';
import Image from 'next/image';
import { Play, Pause, Lock, Check, Loader2 } from 'lucide-react';
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

  const loadTracks = useCallback(async () => {
    if (!isExpanded) return;
    setIsLoading(true);

    const { data } = await supabase
      .from('album_tracks')
      .select('*, track:tracks(*)')
      .eq('album_id', album.id)
      .order('position');

    if (data) {
      const albumTracks = data
        .filter((at) => at.track)
        .map((at) => ({ ...at.track, position: at.position }));
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
  const hasAccess = album.access_level === 'free';

  return (
    <div className="bg-crwn-surface rounded-xl border border-crwn-elevated overflow-hidden">
      {/* Album Header */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-crwn-elevated/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="w-16 h-16 rounded-lg bg-crwn-elevated overflow-hidden flex-shrink-0 relative">
          {album.album_art_url ? (
            <Image src={album.album_art_url} alt={album.title} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">🎵</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-crwn-text truncate">{album.title}</h3>
            {!hasAccess && <Lock className="w-4 h-4 text-crwn-text-secondary flex-shrink-0" />}
          </div>
          <p className="text-sm text-crwn-text-secondary">
            {album.track_count || 0} tracks • {album.release_date}
          </p>
        </div>
      </div>

      {/* Expanded Track List */}
      {isExpanded && (
        <div className="border-t border-crwn-elevated">
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
            <div className="divide-y divide-crwn-elevated">
              {tracks.map((track, index) => (
                <Link
                  key={track.id}
                  href={`/artist/${artistSlug}`}
                  className="flex items-center gap-3 p-3 hover:bg-crwn-elevated/50 transition-colors"
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
                  <Play className="w-4 h-4 text-crwn-text-secondary" />
                </Link>
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
      <div className="space-y-2">
        {albums.map((album) => (
          <AlbumCard key={album.id} album={album} artistSlug={artistSlug} />
        ))}
      </div>
    </section>
  );
}
