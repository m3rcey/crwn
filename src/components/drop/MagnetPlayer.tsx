'use client';

// The drop funnel's song, as a record player card: the cover art large, a soft glow of the art
// behind it, the title and where it is from, and a transport. The SAME card renders twice: LOCKED
// on the first screen (no audio at all, the play control is a lock that points the fan at the
// email field), and UNLOCKED once the claim returns a short-lived signed URL.
//
// A standalone player on purpose, like InlineAudioPlayer: the drop funnel sits outside the app's
// PlayerProvider entitlement flow, and whoever passes `src` has already decided the listener may
// hear it (the claim route). Locked means no `src` exists in the page at all, so nothing can play.

import { useEffect, useRef, useState } from 'react';
import { Loader2, Lock, Music, Pause, Play } from 'lucide-react';

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function MagnetPlayer({
  title,
  artistName,
  project,
  coverUrl,
  durationSec,
  src,
  onLockedTap,
}: {
  title: string;
  artistName: string;
  project?: string | null;
  coverUrl?: string | null;
  durationSec?: number | null;
  /** The signed URL. Absent means LOCKED: nothing in the page can play. */
  src?: string | null;
  onLockedTap?: () => void;
}) {
  const locked = !src;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSec || 0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => setDuration(a.duration || durationSec || 0);
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
  }, [src, durationSec]);

  const toggle = () => {
    if (locked) { onLockedTap?.(); return; }
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
    if (locked || !a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setCurrent(a.currentTime);
  };

  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div className="relative w-full max-w-sm mx-auto">
      {src ? <audio ref={audioRef} src={src} preload="metadata" /> : null}

      {/* The art, with a soft glow of itself behind it. */}
      <div className="relative mx-auto w-full max-w-[300px] aspect-square">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" aria-hidden className="absolute inset-4 w-[calc(100%-2rem)] h-[calc(100%-2rem)] object-cover rounded-3xl blur-2xl opacity-50 scale-110" />
        ) : null}
        <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-crwn-elevated">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt={`${project || title} cover`} className="w-full h-full object-cover" />
          ) : (
            <Music className="absolute inset-0 m-auto w-14 h-14 text-crwn-text-secondary" aria-hidden />
          )}
          {locked ? (
            <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-crwn-bg/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-crwn-gold">
              <Lock className="w-3 h-3" aria-hidden /> Locked
            </span>
          ) : null}
        </div>
      </div>

      {/* Title, artist, project. */}
      <div className="mt-5 text-center">
        <p className="text-xl font-bold text-crwn-text leading-tight">{title}</p>
        <p className="mt-1 text-sm text-crwn-text-secondary">
          {artistName}{project ? ` · ${project}` : ''}
        </p>
      </div>

      {/* Transport. */}
      <div className="mt-4 px-1">
        <div
          role="slider"
          aria-label={`Seek ${title}`}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          aria-disabled={locked}
          tabIndex={locked ? -1 : 0}
          onClick={seek}
          onKeyDown={(e) => {
            const a = audioRef.current;
            if (locked || !a) return;
            if (e.key === 'ArrowRight') a.currentTime = Math.min(duration, a.currentTime + 5);
            if (e.key === 'ArrowLeft') a.currentTime = Math.max(0, a.currentTime - 5);
          }}
          className={`h-5 flex items-center ${locked ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <div className="relative w-full h-1.5 rounded-full bg-white/10">
            <div className="absolute inset-y-0 left-0 rounded-full bg-crwn-gold" style={{ width: `${pct}%` }} />
            {!locked ? (
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-crwn-gold shadow" style={{ left: `${pct}%` }} />
            ) : null}
          </div>
        </div>
        <div className="flex justify-between text-[11px] text-crwn-text-secondary tabular-nums">
          <span>{fmt(current)}</span>
          <span>{duration ? fmt(duration) : '--:--'}</span>
        </div>
      </div>

      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={toggle}
          aria-label={locked ? `${title} is locked. Enter your email below to unlock it` : playing ? `Pause ${title}` : `Play ${title}`}
          className={`w-16 h-16 rounded-full flex items-center justify-center press-scale shadow-lg ${
            locked ? 'bg-crwn-elevated ring-2 ring-crwn-gold text-crwn-gold' : 'bg-crwn-gold text-crwn-bg'
          }`}
        >
          {locked ? (
            <Lock className="w-6 h-6" />
          ) : loading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : playing ? (
            <Pause className="w-7 h-7" fill="currentColor" />
          ) : (
            <Play className="w-7 h-7 ml-1" fill="currentColor" />
          )}
        </button>
      </div>
      {locked ? (
        <p className="mt-3 text-xs text-center text-crwn-text-secondary">Enter your email below to unlock the full song.</p>
      ) : null}
    </div>
  );
}
