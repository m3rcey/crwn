'use client';

import { useState, useRef, useEffect } from 'react';

interface EmbedPlayerProps {
  title: string;
  artistName: string;
  albumArtUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  trackUrl: string;
}

export function EmbedPlayer({ title, artistName, albumArtUrl, audioUrl, duration, trackUrl }: EmbedPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setAudioDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audioDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * audioDuration;
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px',
      background: '#1A1A1A',
      borderRadius: '12px',
      fontFamily: 'Inter, -apple-system, sans-serif',
      height: '80px',
      boxSizing: 'border-box',
      maxWidth: '100%',
      overflow: 'hidden',
    }}>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      {/* Album Art */}
      <div style={{
        width: '56px',
        height: '56px',
        borderRadius: '8px',
        overflow: 'hidden',
        flexShrink: 0,
        background: '#2A2A2A',
      }}>
        {albumArtUrl ? (
          <img
            src={albumArtUrl}
            alt={title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#666', fontSize: '20px',
          }}>
            ♪
          </div>
        )}
      </div>

      {/* Info + Controls */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            disabled={!audioUrl}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#D4AF37',
              border: 'none',
              cursor: audioUrl ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              opacity: audioUrl ? 1 : 0.4,
            }}
          >
            {isPlaying ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#0D0D0D">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#0D0D0D">
                <polygon points="8,5 20,12 8,19" />
              </svg>
            )}
          </button>

          {/* Track Info */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#FFFFFF',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {title}
            </div>
            <div style={{
              fontSize: '11px',
              color: '#999',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {artistName}
            </div>
          </div>

          {/* CRWN link */}
          <a
            href={trackUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '9px',
              fontWeight: 600,
              color: '#D4AF37',
              textDecoration: 'none',
              letterSpacing: '0.5px',
              flexShrink: 0,
            }}
          >
            CRWN
          </a>
        </div>

        {/* Progress Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', color: '#666', width: '32px', textAlign: 'right' }}>
            {formatTime(currentTime)}
          </span>
          <div
            onClick={handleSeek}
            style={{
              flex: 1,
              height: '4px',
              background: '#2A2A2A',
              borderRadius: '2px',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: '#D4AF37',
              borderRadius: '2px',
              transition: 'width 0.1s linear',
            }} />
          </div>
          <span style={{ fontSize: '10px', color: '#666', width: '32px' }}>
            {formatTime(audioDuration)}
          </span>
        </div>
      </div>
    </div>
  );
}
