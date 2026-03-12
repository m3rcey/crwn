'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { usePlayer } from '@/hooks/usePlayer';
import { hapticMedium } from '@/lib/haptics';
import { TrackShareButton } from '@/components/shared/TrackShareButton';
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
  Minimize2,
  ListMusic,
  Heart
} from 'lucide-react';

export function FullScreenPlayer() {
  const { 
    currentTrack, 
    isPlaying, 
    isExpanded,
    toggleExpanded,
    togglePlay, 
    next, 
    previous,
    currentTime,
    duration,
    seek,
    volume,
    setVolume,
    shuffle,
    toggleShuffle,
    repeat,
    toggleRepeat,
    queue,
    currentIndex,
    isFavorite,
    toggleFavorite,
  } = usePlayer();

  if (!currentTrack || !isExpanded) return null;

  const isTrackFavorite = isFavorite(currentTrack.id);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);

  const formatTime = (seconds: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const displayProgress = isDragging ? (dragTime / duration) * 100 : (duration ? (currentTime / duration) * 100 : 0);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
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

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!duration || !progressRef.current) return;
    e.preventDefault();
    setIsDragging(true);
    const touch = e.touches[0];
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    setDragTime(percent * duration);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging || !duration || !progressRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    setDragTime(percent * duration);
  };

  const handleTouchEnd = () => {
    if (isDragging && duration) {
      seek(dragTime);
      setIsDragging(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-crwn-bg z-[100] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <button 
          onClick={toggleExpanded}
          className="neu-icon-button p-2"
        >
          <Minimize2 size={24} />
        </button>
        <span className="text-sm text-crwn-text-secondary">Now Playing</span>
        <button className="neu-icon-button p-2">
          <ListMusic size={24} />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex flex-col items-center px-8 pt-4 pb-8 overflow-y-auto">
        {/* Album Art */}
        <div className="relative w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 rounded-2xl overflow-hidden shadow-2xl mb-8 flex-shrink-0" style={{ boxShadow: '8px 8px 16px rgba(0, 0, 0, 0.4), -8px -8px 16px rgba(255, 255, 255, 0.03)' }}>
          {currentTrack.album_art_url ? (
            <Image
              src={currentTrack.album_art_url}
              alt={currentTrack.title}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="w-full h-full neu-raised flex items-center justify-center text-6xl">
              🎵
            </div>
          )}
        </div>

        {/* Track Info */}
        <div className="text-center mb-6 w-full">
          <div className="flex items-center justify-center gap-2 mb-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-crwn-text">
              {currentTrack.title}
            </h2>
            {currentTrack.artist?.slug && (
              <TrackShareButton
                trackId={currentTrack.id}
                trackTitle={currentTrack.title}
                artistSlug={currentTrack.artist.slug}
                artistName={currentTrack.artist_name || currentTrack.artist?.profile?.display_name || 'Artist'}
                size="md"
              />
            )}
          </div>
          <p className="text-lg text-crwn-text-secondary">{currentTrack.artist_name || currentTrack.artist?.profile?.display_name || 'Unknown Artist'}</p>
        </div>

        {/* Progress - larger touch target */}
        <div className="w-full max-w-md mb-6">
          <div 
            ref={progressRef}
            className="py-3 cursor-pointer"
            onClick={handleProgressClick}
            onMouseDown={handleDragStart}
            onMouseMove={handleDragMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Track background */}
            <div className="h-2 bg-[#2A2A2A] rounded-full overflow-hidden">
              {/* Progress fill */}
              <div 
                className="h-full bg-crwn-gold rounded-full relative transition-all"
                style={{ width: `${displayProgress}%` }}
              >
                {/* Thumb - always visible */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-crwn-gold rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex justify-between text-sm text-crwn-text-secondary">
            <span>{formatTime(isDragging ? dragTime : currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6 mb-6">
          <button 
            onClick={toggleShuffle}
            className={`neu-icon-button p-2 ${
              shuffle ? 'text-crwn-gold' : ''
            }`}
          >
            <Shuffle size={20} />
          </button>
          <button 
            onClick={previous}
            className="neu-icon-button p-2"
          >
            <SkipBack size={32} fill="currentColor" />
          </button>
          <button 
            onClick={togglePlay}
            className="neu-icon-button w-16 h-16 flex items-center justify-center"
          >
            {isPlaying ? (
              <Pause size={32} fill="currentColor" />
            ) : (
              <Play size={32} fill="currentColor" className="ml-1" />
            )}
          </button>
          <button 
            onClick={next}
            className="neu-icon-button p-2"
          >
            <SkipForward size={32} fill="currentColor" />
          </button>
          <button 
            onClick={toggleRepeat}
            className={`neu-icon-button p-2 ${
              repeat !== 'off' ? 'text-crwn-gold' : ''
            }`}
          >
            {repeat === 'one' ? (
              <Repeat1 size={20} />
            ) : (
              <Repeat size={20} />
            )}
          </button>
        </div>

        {/* Volume (desktop only - iOS doesn't support programmatic volume) */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => toggleFavorite(currentTrack.id)}
            className={`neu-icon-button p-3 ${
              isTrackFavorite ? 'text-crwn-gold' : ''
            }`}
          >
            <Heart size={24} fill={isTrackFavorite ? 'currentColor' : 'none'} />
          </button>

          {/* Volume slider - desktop only */}
          <div className="hidden md:flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-24 h-2 bg-[#2A2A2A] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-crwn-gold [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>
        </div>

        {/* Up Next */}
        {queue.length > 1 && (
          <div className="w-full max-w-md mt-8">
            <h3 className="text-sm font-medium text-crwn-text-secondary mb-3">Up Next</h3>
            <div className="space-y-2">
              {queue.slice(currentIndex + 1, currentIndex + 10).map((track) => (
                <div 
                  key={track.id}
                  className="flex items-center gap-3 p-2 neu-inset rounded-lg"
                >
                  <div className="w-10 h-10 rounded bg-crwn-elevated overflow-hidden relative flex-shrink-0">
                    {track.album_art_url ? (
                      <Image src={track.album_art_url} alt={track.title} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs">🎵</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-crwn-text truncate">{track.title}</p>
                    <p className="text-xs text-crwn-text-secondary truncate">{track.artist_name || track.artist?.profile?.display_name || 'Unknown Artist'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
