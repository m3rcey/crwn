'use client';

// A small, self-contained CRWN-branded audio player for one URL.
//
// Exists because the native <audio controls> renders the browser's own white chrome,
// which reads as another product entirely on a dark gold page. The global player
// (MiniPlayer / FullScreenPlayer) is bound to PlayerProvider and the entitlement flow,
// which public surfaces like the drop funnel deliberately sit outside of, so this is the
// standalone: gold play circle, seekable progress, time readout, nothing else.
//
// It takes a URL and plays it. No entitlement logic lives here; whoever hands it a URL
// has already decided the listener may hear it.

import { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function InlineAudioPlayer({ src, title }: { src: string; title: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onEnd = () => setPlaying(false);
    const onWait = () => setLoading(true);
    const onCan = () => setLoading(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    a.addEventListener('ended', onEnd);
    a.addEventListener('waiting', onWait);
    a.addEventListener('canplay', onCan);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('waiting', onWait);
      a.removeEventListener('canplay', onCan);
    };
  }, [src]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      setLoading(a.readyState < 3);
      void a.play().then(() => setPlaying(true)).catch(() => setLoading(false));
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setCurrent(a.currentTime);
  };

  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div className="w-full rounded-xl bg-crwn-elevated px-4 py-3 text-left">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          aria-label={playing ? `Pause ${title}` : `Play ${title}`}
          className="w-11 h-11 rounded-full bg-crwn-gold text-crwn-bg flex items-center justify-center press-scale shrink-0"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : playing ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5 ml-0.5" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div
            role="slider"
            aria-label={`Seek ${title}`}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            tabIndex={0}
            onClick={seek}
            onKeyDown={(e) => {
              const a = audioRef.current;
              if (!a) return;
              if (e.key === 'ArrowRight') a.currentTime = Math.min(duration, a.currentTime + 5);
              if (e.key === 'ArrowLeft') a.currentTime = Math.max(0, a.currentTime - 5);
            }}
            className="h-6 flex items-center cursor-pointer group"
          >
            <div className="w-full h-1.5 rounded-full bg-crwn-card overflow-hidden">
              <div className="h-full bg-crwn-gold rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="flex justify-between text-[11px] text-crwn-text-secondary tabular-nums">
            <span>{fmt(current)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
