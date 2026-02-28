'use client';

import { Track } from '@/types';
import { Lock, Play, Pause, Heart, MoreHorizontal } from 'lucide-react';
import Image from 'next/image';
import { usePlayer } from '@/hooks/usePlayer';

interface TrackListProps {
  tracks: Track[];
}

export function TrackList({ tracks }: TrackListProps) {
  const { play, pause, currentTrack, isPlaying, isFavorite, toggleFavorite, addToQueue, canPlayTrack } = usePlayer();

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getAccessBadge = (track: Track) => {
    const { canPlay } = canPlayTrack(track);
    
    if (!canPlay) {
      return <span className="text-xs text-crwn-gold-muted flex items-center gap-1"><Lock size={12} /> Preview</span>;
    }
    
    switch (track.access_level) {
      case 'free':
        return <span className="text-xs text-crwn-success">Free</span>;
      case 'subscriber':
        return <span className="text-xs text-crwn-gold flex items-center gap-1"><Lock size={12} /> Subscriber</span>;
      case 'purchase':
        return <span className="text-xs text-crwn-text-secondary flex items-center gap-1"><Lock size={12} /> Purchase</span>;
      default:
        return null;
    }
  };

  const handlePlay = (track: Track) => {
    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        pause();
      } else {
        play(track);
      }
    } else {
      play(track);
    }
  };

  return (
    <div className="space-y-2">
      {tracks.map((track, index) => {
        const isCurrentTrack = currentTrack?.id === track.id;
        const isTrackPlaying = isCurrentTrack && isPlaying;
        const trackIsFavorite = isFavorite(track.id);
        
        return (
          <div
            key={track.id}
            className={`flex items-center gap-4 p-3 rounded-lg transition-colors group ${
              isCurrentTrack ? 'bg-crwn-elevated' : 'bg-crwn-surface hover:bg-crwn-elevated'
            }`}
          >
            {/* Track Number / Play Button */}
            <div className="w-8 text-center">
              {isTrackPlaying ? (
                <div className="flex items-end justify-center gap-0.5 h-4">
                  <div className="w-1 bg-crwn-gold animate-[bounce_1s_ease-in-out_infinite]" style={{ height: '60%' }} />
                  <div className="w-1 bg-crwn-gold animate-[bounce_1s_ease-in-out_infinite_0.1s]" style={{ height: '100%' }} />
                  <div className="w-1 bg-crwn-gold animate-[bounce_1s_ease-in-out_infinite_0.2s]" style={{ height: '40%' }} />
                </div>
              ) : (
                <>
                  <span className="text-crwn-text-secondary group-hover:hidden">
                    {index + 1}
                  </span>
                  <button
                    className="hidden group-hover:block text-crwn-gold"
                    onClick={() => handlePlay(track)}
                  >
                    <Play size={20} fill="currentColor" />
                  </button>
                </>
              )}
            </div>

            {/* Album Art */}
            <div 
              className="relative w-12 h-12 bg-crwn-elevated rounded overflow-hidden flex-shrink-0 cursor-pointer"
              onClick={() => handlePlay(track)}
            >
              {track.album_art_url ? (
                <Image
                  src={track.album_art_url}
                  alt={track.title}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary">
                  🎵
                </div>
              )}
              {isCurrentTrack && isPlaying && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Pause size={20} className="text-white" fill="currentColor" />
                </div>
              )}
            </div>

            {/* Track Info */}
            <div className="flex-1 min-w-0">
              <h3 className={`font-medium truncate ${isCurrentTrack ? 'text-crwn-gold' : 'text-crwn-text'}`}>
                {track.title}
              </h3>
              <div className="flex items-center gap-3 mt-1">
                {getAccessBadge(track)}
                <span className="text-xs text-crwn-text-secondary">
                  {formatDuration(track.duration)}
                </span>
                {track.play_count > 0 && (
                  <span className="text-xs text-crwn-text-secondary">
                    {track.play_count.toLocaleString()} plays
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => toggleFavorite(track.id)}
                className={`p-2 transition-colors ${
                  trackIsFavorite ? 'text-crwn-gold' : 'text-crwn-text-secondary hover:text-crwn-text'
                }`}
              >
                <Heart size={18} fill={trackIsFavorite ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={() => addToQueue(track)}
                className="p-2 text-crwn-text-secondary hover:text-crwn-text transition-colors"
                title="Add to queue"
              >
                <MoreHorizontal size={18} />
              </button>
            </div>

            {/* Price (if purchase-only) */}
            {track.access_level === 'purchase' && track.price && (
              <div className="text-crwn-gold font-medium">
                ${(track.price / 100).toFixed(2)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
