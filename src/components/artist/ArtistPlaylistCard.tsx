'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { supabase } from '@/lib/supabase/client';
import { Playlist, Track } from '@/types';
import Image from 'next/image';
import { Play, Lock, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface ArtistPlaylistCardProps {
  playlist: Playlist;
  artistSlug: string;
}

export function ArtistPlaylistCard({ playlist, artistSlug }: ArtistPlaylistCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  const loadTracks = useCallback(async () => {
    if (!isExpanded) return;
    setIsLoading(true);

    const { data } = await supabase
      .from('playlist_tracks')
      .select('*, track:tracks(*)')
      .eq('playlist_id', playlist.id)
      .order('position');

    if (data) {
      const playlistTracks = data
        .filter((pt) => pt.track)
        .map((pt) => ({ ...pt.track, position: pt.position }));
      setTracks(playlistTracks as Track[]);
    }
    setIsLoading(false);
  }, [isExpanded, playlist.id]);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Check if user has access to this playlist
  const { tierId } = useSubscription(playlist.artist_id || '');
  const hasAccess = playlist.is_free === true || (tierId && playlist.allowed_tier_ids?.includes(tierId));

  return (
    <div className="neu-raised neu-card-hover overflow-hidden">
      {/* Playlist Header - Click to navigate to full playlist */}
      <Link
        href={`/artist/${artistSlug}/playlist/${playlist.id}`}
        className="flex items-center gap-4 p-4 hover:bg-crwn-elevated/30"
      >
        <div className="w-16 h-16 rounded-lg bg-crwn-elevated overflow-hidden flex-shrink-0 relative shadow-inner">
          {playlist.cover_url ? (
            <Image src={playlist.cover_url} alt={playlist.title} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">🎶</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-crwn-text truncate">{playlist.title}</h3>
            {!hasAccess && <Lock className="w-4 h-4 text-crwn-gold flex-shrink-0" />}
          </div>
          <p className="text-sm text-crwn-text-secondary">
            {playlist.track_count || 0} tracks
          </p>
          {playlist.description && (
            <p className="text-xs text-crwn-text-secondary truncate mt-1">
              {playlist.description}
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}

interface ArtistPlaylistsSectionProps {
  playlists: Playlist[];
  artistSlug: string;
}

export function ArtistPlaylistsSection({ playlists, artistSlug }: ArtistPlaylistsSectionProps) {
  if (playlists.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-crwn-text mb-4">Playlists</h2>
      <div className="space-y-4">
        {playlists.map((playlist) => (
          <ArtistPlaylistCard 
            key={playlist.id} 
            playlist={playlist} 
            artistSlug={artistSlug} 
          />
        ))}
      </div>
    </section>
  );
}
