'use client';

import { useState } from 'react';
import { Track } from '@/types';
import { Lock, Play } from 'lucide-react';

interface TrackListProps {
  tracks: Track[];
  artistSlug: string;
}

export function TrackList({ tracks, artistSlug }: TrackListProps) {
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getAccessBadge = (accessLevel: string) => {
    switch (accessLevel) {
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

  return (
    <div className="space-y-2">
      {tracks.map((track, index) => (
        <div
          key={track.id}
          className="flex items-center gap-4 p-3 bg-crwn-surface rounded-lg hover:bg-crwn-elevated transition-colors group"
        >
          {/* Track Number / Play Button */}
          <div className="w-8 text-center">
            <span className="text-crwn-text-secondary group-hover:hidden">
              {index + 1}
            </span>
            <button
              className="hidden group-hover:block text-crwn-gold"
              onClick={() => setPlayingTrack(track.id)}
            >
              <Play size={20} fill="currentColor" />
            </button>
          </div>

          {/* Album Art */}
          <div className="w-12 h-12 bg-crwn-elevated rounded overflow-hidden flex-shrink-0">
            {track.album_art_url ? (
              <img
                src={track.album_art_url}
                alt={track.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary">
                🎵
              </div>
            )}
          </div>

          {/* Track Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-crwn-text truncate">{track.title}</h3>
            <div className="flex items-center gap-3 mt-1">
              {getAccessBadge(track.access_level)}
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

          {/* Price (if purchase-only) */}
          {track.access_level === 'purchase' && track.price && (
            <div className="text-crwn-gold font-medium">
              ${(track.price / 100).toFixed(2)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
