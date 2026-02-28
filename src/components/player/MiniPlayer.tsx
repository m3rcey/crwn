'use client';

import Image from 'next/image';
import { usePlayer } from '@/hooks/usePlayer';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Repeat, 
  Repeat1, 
  Shuffle,
  Maximize2,
  ListMusic,
  Heart
} from 'lucide-react';

export function MiniPlayer() {
  const { 
    currentTrack, 
    isPlaying, 
    togglePlay, 
    next, 
    previous,
    volume,
    setVolume,
    toggleExpanded,
    isFavorite,
    toggleFavorite,
  } = usePlayer();

  if (!currentTrack) return null;

  const isTrackFavorite = isFavorite(currentTrack.id);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-crwn-surface border-t border-crwn-elevated z-50">
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-crwn-elevated cursor-pointer group">
        <div 
          className="h-full bg-crwn-gold relative"
          style={{ width: '45%' }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-crwn-gold rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <div className="flex items-center gap-4 px-4 py-3">
        {/* Track Info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div 
            className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0 cursor-pointer"
            onClick={toggleExpanded}
          >
            {currentTrack.album_art_url ? (
              <Image
                src={currentTrack.album_art_url}
                alt={currentTrack.title}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-crwn-elevated flex items-center justify-center text-crwn-text-secondary">
                🎵
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 
              className="text-sm font-medium text-crwn-text truncate cursor-pointer hover:underline"
              onClick={toggleExpanded}
            >
              {currentTrack.title}
            </h4>
            <p className="text-xs text-crwn-text-secondary truncate">Artist Name</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button 
            onClick={previous}
            className="p-2 text-crwn-text-secondary hover:text-crwn-text transition-colors"
          >
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button 
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-crwn-gold text-crwn-bg flex items-center justify-center hover:bg-crwn-gold-hover transition-colors"
          >
            {isPlaying ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          <button 
            onClick={next}
            className="p-2 text-crwn-text-secondary hover:text-crwn-text transition-colors"
          >
            <SkipForward size={20} fill="currentColor" />
          </button>
        </div>

        {/* Volume & Actions */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => toggleFavorite(currentTrack.id)}
            className={`p-2 transition-colors ${
              isTrackFavorite ? 'text-crwn-gold' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Heart size={20} fill={isTrackFavorite ? 'currentColor' : 'none'} />
          </button>
          <button className="p-2 text-crwn-text-secondary hover:text-crwn-text transition-colors">
            <ListMusic size={20} />
          </button>
          <button 
            onClick={toggleExpanded}
            className="p-2 text-crwn-text-secondary hover:text-crwn-text transition-colors"
          >
            <Maximize2 size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
