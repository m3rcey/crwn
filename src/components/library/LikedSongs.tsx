'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePlayer } from '@/hooks/usePlayer';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Heart, Play, Loader2, Music } from 'lucide-react';
import Image from 'next/image';

interface LikedTrack {
  id: string;
  title: string;
  album_art_url: string | null;
  audio_url_128: string | null;
  duration: number;
  artist_id: string;
  artist_name?: string;
}

export function LikedSongs() {
  const { user } = useAuth();
  const { play, currentTrack, isPlaying } = usePlayer();
  const supabase = createBrowserSupabaseClient();
  const [tracks, setTracks] = useState<LikedTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function fetchLiked() {
      const { data: favorites } = await supabase
        .from('favorites')
        .select('track_id, created_at, track:tracks(id, title, album_art_url, audio_url_128, duration, artist_id)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (favorites) {
        const likedTracks: LikedTrack[] = [];
        for (const fav of favorites) {
          const track = (fav as any).track;
          if (track) {
            likedTracks.push(track);
          }
        }

        // Get artist names
        const artistIds = [...new Set(likedTracks.map(t => t.artist_id))];
        if (artistIds.length > 0) {
          const { data: artists } = await supabase
            .from('artist_profiles')
            .select('id, profile:profiles(display_name)')
            .in('id', artistIds);

          const artistMap: Record<string, string> = {};
          (artists || []).forEach((a: any) => {
            artistMap[a.id] = a.profile?.display_name || 'Artist';
          });

          likedTracks.forEach(t => {
            t.artist_name = artistMap[t.artist_id] || 'Artist';
          });
        }

        setTracks(likedTracks);
      }
      setIsLoading(false);
    }

    fetchLiked();
  }, [user, supabase]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="neu-raised rounded-xl p-8 text-center">
        <Heart className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
        <p className="text-crwn-text font-medium">No liked songs yet</p>
        <p className="text-sm text-crwn-text-secondary mt-1">
          Tap the heart icon on any track to save it here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Heart className="w-5 h-5 text-crwn-gold" fill="currentColor" />
        <span className="text-crwn-text-secondary text-sm">{tracks.length} song{tracks.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="stagger-fade-in">
        {tracks.map((track, i) => {
          const isCurrentTrack = currentTrack?.id === track.id;
          return (
            <div
              key={track.id}
              onClick={() => play(track as any, tracks as any)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-crwn-elevated/30 transition-colors ${
                i < tracks.length - 1 ? 'border-b border-crwn-elevated' : ''
              } ${isCurrentTrack ? 'bg-crwn-gold/5' : ''}`}
            >
              {/* Album Art */}
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 relative">
                {track.album_art_url ? (
                  <Image src={track.album_art_url} alt={track.title} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full bg-crwn-elevated flex items-center justify-center">
                    <Music className="w-4 h-4 text-crwn-text-secondary" />
                  </div>
                )}
              </div>

              {/* Track Info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${isCurrentTrack ? 'text-crwn-gold font-medium' : 'text-crwn-text'}`}>
                  {track.title}
                </p>
                <p className="text-xs text-crwn-text-secondary truncate">{track.artist_name}</p>
              </div>

              {/* Duration */}
              <span className="text-xs text-crwn-text-secondary flex-shrink-0">
                {formatDuration(track.duration)}
              </span>

              {/* Play indicator */}
              {isCurrentTrack && isPlaying && (
                <div className="flex gap-0.5 items-end h-4">
                  <div className="w-0.5 bg-crwn-gold animate-pulse" style={{ height: '60%' }} />
                  <div className="w-0.5 bg-crwn-gold animate-pulse" style={{ height: '100%', animationDelay: '0.2s' }} />
                  <div className="w-0.5 bg-crwn-gold animate-pulse" style={{ height: '40%', animationDelay: '0.4s' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
