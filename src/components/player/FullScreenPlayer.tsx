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

  const formatTime = (seconds: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

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
      <div className="flex-1 flex flex-col items-center justify-center px-8 pb-8">
        {/* Album Art */}
        <div className="relative w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-2xl overflow-hidden shadow-2xl mb-8" style={{ boxShadow: '8px 8px 16px rgba(0, 0, 0, 0.4), -8px -8px 16px rgba(255, 255, 255, 0.03)' }}>
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
          <h2 className="text-2xl sm:text-3xl font-bold text-crwn-text mb-2">
            {currentTrack.title}
          </h2>
          <p className="text-lg text-crwn-text-secondary">Artist Name</p>
        </div>

        {/* Progress */}
        <div className="w-full max-w-md mb-6">
          <div 
            className="h-2 neu-progress-track rounded-full cursor-pointer mb-2"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              seek(percent * duration);
            }}
          >
            <div 
              className="h-full neu-progress-fill rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-crwn-text-secondary">
            <span>{formatTime(currentTime)}</span>
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

        {/* Volume & Actions */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => toggleFavorite(currentTrack.id)}
            className={`neu-icon-button p-3 ${
              isTrackFavorite ? 'text-crwn-gold' : ''
            }`}
          >
            <Heart size={24} fill={isTrackFavorite ? 'currentColor' : 'none'} />
          </button>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
              className="neu-icon-button p-2"
            >
              {volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-24 h-2 neu-progress-track rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:neu-toggle-thumb [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>
        </div>

        {/* Up Next */}
        {queue.length > 1 && (
          <div className="w-full max-w-md mt-8">
            <h3 className="text-sm font-medium text-crwn-text-secondary mb-3">Up Next</h3>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {queue.slice(currentIndex + 1, currentIndex + 4).map((track) => (
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
                    <p className="text-xs text-crwn-text-secondary truncate">Artist Name</p>
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
