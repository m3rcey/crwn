'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Album, Track } from '@/types';
import Image from 'next/image';
import { Play, Pause, Lock, Check } from 'lucide-react';
import { usePlayer } from '@/hooks/usePlayer';

interface AlbumCardProps {
  album: Album;
  artistId: string;
  artistSlug: string;
  hasAccess: boolean;
}

export function AlbumCard({ album, artistId, artistSlug, hasAccess }: AlbumCardProps) {
  const supabase = createBrowserSupabaseClient();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { play, currentTrack, isPlaying, togglePlay } = usePlayer();

  useEffect(() => {
    async function loadTracks() {
      if (!isExpanded) return;
      
      const { data } = await supabase
        .from('album_tracks')
        .select('track_id, track_number, tracks(*)')
        .eq('album_id', album.id)
        .order('track_number');
      
      if (data) {
        setTracks(data.map((d: any) => d.tracks as Track));
      }
    }
    
    loadTracks();
  }, [isExpanded, album.id, supabase]);

  const handlePlayAll = async () => {
    if (!hasAccess) return;
    
    if (tracks.length === 0) {
      const { data } = await supabase
        .from('album_tracks')
        .select('track_id, tracks(*)')
        .eq('album_id', album.id)
        .order('track_number');
      
      if (data) {
        const albumTracks = data.map((d: any) => d.tracks as Track);
        if (albumTracks.length > 0) {
          play(albumTracks[0]);
          // Queue rest of tracks
          for (let i = 1; i < albumTracks.length; i++) {
            // Add to queue - would need queue functionality
          }
        }
      }
    } else {
      play(tracks[0]);
    }
  };

  const isAlbumPlaying = tracks.length > 0 && tracks.some(t => currentTrack?.id === t.id) && isPlaying;

  return (
    <div className="bg-crwn-surface rounded-xl border border-crwn-elevated overflow-hidden">
      {/* Album Header */}
      <div 
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-crwn-elevated/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="w-16 h-16 rounded-lg bg-crwn-elevated overflow-hidden flex-shrink-0 relative">
          {album.album_art_url ? (
            <Image src={album.album_art_url} alt={album.title} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">🎵</div>
          )}
          {hasAccess && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePlayAll();
              }}
              className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
            >
              {isAlbumPlaying ? (
                <Pause className="w-6 h-6 text-white" />
              ) : (
                <Play className="w-6 h-6 text-white" />
              )}
            </button>
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
          ) : tracks.length > 0 ? (
            <div className="divide-y divide-crwn-elevated">
              {tracks.map((track, index) => {
                const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
                return (
                  <button
                    key={track.id}
                    onClick={() => play(track)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-crwn-elevated/50 transition-colors text-left"
                  >
                    <span className="w-6 text-center text-crwn-text-secondary text-sm">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${isTrackPlaying ? 'text-crwn-gold' : 'text-crwn-text'}`}>
                        {track.title}
                      </p>
                      <p className="text-xs text-crwn-text-secondary">
                        {Math.floor((track.duration || 0) / 60)}:{(track.duration || 0) % 60}
                      </p>
                    </div>
                    {isTrackPlaying ? (
                      <Pause className="w-4 h-4 text-crwn-gold" />
                    ) : (
                      <Play className="w-4 h-4 text-crwn-text-secondary" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center text-crwn-text-secondary">
              Loading tracks...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AlbumsSectionProps {
  albums: Album[];
  artistId: string;
  artistSlug: string;
  hasAccess: boolean;
}

export function AlbumsSection({ albums, artistId, artistSlug, hasAccess }: AlbumsSectionProps) {
  if (albums.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-crwn-text mb-4">Albums</h2>
      <div className="space-y-2">
        {albums.map(album => (
          <AlbumCard
            key={album.id}
            album={album}
            artistId={artistId}
            artistSlug={artistSlug}
            hasAccess={hasAccess}
          />
        ))}
      </div>
    </section>
  );
}
