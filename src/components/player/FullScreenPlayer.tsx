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
  Heart,
  X
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
          className="p-2 text-crwn-text-secondary hover:text-crwn-text transition-colors"
        >
          <Minimize2 size={24} />
        </button>
        <span className="text-sm text-crwn-text-secondary">Now Playing</span>
        <button className="p-2 text-crwn-text-secondary hover:text-crwn-text transition-colors">
          <ListMusic size={24} />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 pb-8">
        {/* Album Art */}
        <div className="relative w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-2xl overflow-hidden shadow-2xl mb-8">
          {currentTrack.album_art_url ? (
            <Image
              src={currentTrack.album_art_url}
              alt={currentTrack.title}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="w-full h-full bg-crwn-surface flex items-center justify-center text-6xl">
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
            className="h-2 bg-crwn-elevated rounded-full cursor-pointer mb-2"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              seek(percent * duration);
            }}
          >
            <div 
              className="h-full bg-crwn-gold rounded-full transition-all"
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
            className={`p-2 transition-colors ${
              shuffle ? 'text-crwn-gold' : 'text-crwn-text-secondary'
            }`}
          >
            <Shuffle size={20} />
          </button>
          <button 
            onClick={previous}
            className="p-2 text-crwn-text hover:text-crwn-gold transition-colors"
          >
            <SkipBack size={32} fill="currentColor" />
          </button>
          <button 
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-crwn-gold text-crwn-bg flex items-center justify-center hover:bg-crwn-gold-hover transition-colors"
          >
            {isPlaying ? (
              <Pause size={32} fill="currentColor" />
            ) : (
              <Play size={32} fill="currentColor" className="ml-1" />
            )}
          </button>
          <button 
            onClick={next}
            className="p-2 text-crwn-text hover:text-crwn-gold transition-colors"
          >
            <SkipForward size={32} fill="currentColor" />
          </button>
          <button 
            onClick={toggleRepeat}
            className={`p-2 transition-colors ${
              repeat !== 'off' ? 'text-crwn-gold' : 'text-crwn-text-secondary'
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
            className={`p-3 rounded-full transition-colors ${
              isTrackFavorite 
                ? 'text-crwn-gold bg-crwn-gold/10' 
                : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Heart size={24} fill={isTrackFavorite ? 'currentColor' : 'none'} />
          </button>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
              className="p-2 text-crwn-text-secondary"
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
              className="w-24 h-1 bg-crwn-elevated rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-crwn-gold [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>
        </div>

        {/* Up Next */}
        {queue.length > 1 && (
          <div className="w-full max-w-md mt-8">
            <h3 className="text-sm font-medium text-crwn-text-secondary mb-3">Up Next</h3>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {queue.slice(currentIndex + 1, currentIndex + 4).map((track, idx) => (
                <div 
                  key={track.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-crwn-surface/50"
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
