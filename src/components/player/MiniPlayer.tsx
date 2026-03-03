'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { usePlayer } from '@/hooks/usePlayer';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward,
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
    toggleExpanded,
    isFavorite,
    toggleFavorite,
    currentTime,
    duration,
    seek,
  } = usePlayer();

  if (!currentTrack) return null;

  const isTrackFavorite = isFavorite(currentTrack.id);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);
  
  const displayProgress = isDragging && duration ? (dragTime / duration) * 100 : (duration > 0 ? (currentTime / duration) * 100 : 0);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(percent * duration);
  };

  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    setIsDragging(true);
    const rect = progressRef.current?.getBoundingClientRect();
    if (rect) {
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setDragTime(percent * duration);
    }
  };

  const handleDragMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !duration || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setDragTime(percent * duration);
  };

  const handleDragEnd = () => {
    if (isDragging && duration) {
      seek(dragTime);
      setIsDragging(false);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 neu-raised z-50" style={{ borderRadius: '16px 16px 0 0' }}>
      {/* Progress bar */}
      <div 
        ref={progressRef}
        className="absolute top-0 left-0 right-0 h-1.5 neu-progress-track cursor-pointer rounded-none"
        onClick={handleProgressClick}
        onMouseDown={handleDragStart}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        <div 
          className="h-full neu-progress-fill relative transition-all"
          style={{ width: `${displayProgress}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 neu-toggle-thumb rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <div className="flex items-center gap-4 px-4 py-3">
        {/* Track Info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div 
            className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer shadow-inner"
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
            className="neu-icon-button p-2"
          >
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button 
            onClick={togglePlay}
            className="neu-icon-button w-10 h-10 flex items-center justify-center"
          >
            {isPlaying ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          <button 
            onClick={next}
            className="neu-icon-button p-2"
          >
            <SkipForward size={20} fill="currentColor" />
          </button>
        </div>

        {/* Volume & Actions */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => toggleFavorite(currentTrack.id)}
            className={`neu-icon-button p-2 ${
              isTrackFavorite ? 'text-crwn-gold' : ''
            }`}
          >
            <Heart size={20} fill={isTrackFavorite ? 'currentColor' : 'none'} />
          </button>
          <button className="neu-icon-button p-2">
            <ListMusic size={20} />
          </button>
          <button 
            onClick={toggleExpanded}
            className="neu-icon-button p-2"
          >
            <Maximize2 size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
