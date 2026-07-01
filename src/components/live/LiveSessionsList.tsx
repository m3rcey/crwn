'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSubscription } from '@/hooks/useSubscription';
import { LiveSession } from '@/types/live';
import { Radio, Download, Loader2, Lock, Calendar, Play } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

interface LiveSessionsListProps {
  sessions: LiveSession[];
  artistId: string;
  artistSlug: string;
}

export function LiveSessionsList({ sessions, artistId, artistSlug }: LiveSessionsListProps) {
  const { tierId, isLoading } = useSubscription(artistId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [playId, setPlayId] = useState<string | null>(null);
  const [playUrl, setPlayUrl] = useState<string | null>(null);

  // A fan can watch/download if the session is free, or they hold one of its tiers.
  const hasAccess = (s: LiveSession) =>
    s.is_free || (!!tierId && Array.isArray(s.allowed_tier_ids) && s.allowed_tier_ids.includes(tierId));

  const liveNow = sessions.filter((s) => s.status === 'live');
  const upcoming = sessions.filter((s) => s.source_type === 'live' && s.status === 'scheduled');
  // Anything with a finished recording is downloadable (ended live VODs + uploads).
  const recordings = sessions.filter((s) => s.vod_status === 'ready' && s.status !== 'live');

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const fmtDuration = (secs: number | null) => {
    if (!secs || secs <= 0) return null;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };
  const fmtAgo = (iso: string | null) => {
    if (!iso) return '';
    const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    const d = Math.floor(secs / 86400);
    if (d >= 365) return `${Math.floor(d / 365)}y ago`;
    if (d >= 30) return `${Math.floor(d / 30)}mo ago`;
    if (d >= 1) return `${d} day${d > 1 ? 's' : ''} ago`;
    const h = Math.floor(secs / 3600);
    if (h >= 1) return `${h}h ago`;
    const m = Math.floor(secs / 60);
    if (m >= 1) return `${m}m ago`;
    return 'just now';
  };

  const download = async (s: LiveSession) => {
    setBusyId(s.id);
    setErrorId(null);
    try {
      const res = await fetch(`/api/live/vod?sessionId=${s.id}&download=1`);
      if (!res.ok) throw new Error('vod fetch failed');
      const { url } = await res.json();
      if (url) {
        // URL carries Content-Disposition: attachment, so this saves the file
        // instead of navigating away to play it.
        const a = document.createElement('a');
        a.href = url;
        a.rel = 'noopener';
        a.click();
      }
    } catch (err) {
      console.error('Error downloading recording:', err);
      setErrorId(s.id);
    } finally {
      setBusyId(null);
    }
  };

  // Play a recording inline: fetch the same access-gated signed URL the download
  // uses, then swap the card's cover for a <video>. Works for live + uploaded VODs.
  const play = async (s: LiveSession) => {
    setBusyId(s.id);
    setErrorId(null);
    try {
      const res = await fetch(`/api/live/vod?sessionId=${s.id}`);
      if (!res.ok) throw new Error('vod fetch failed');
      const { url } = await res.json();
      if (url) { setPlayUrl(url); setPlayId(s.id); }
    } catch (err) {
      console.error('Error playing recording:', err);
      setErrorId(s.id);
    } finally {
      setBusyId(null);
    }
  };

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon="📡"
        title="No Live Sessions Yet"
        description="When this artist goes live, it'll show up here — and recordings stay available to watch and download afterward."
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Live now */}
      {liveNow.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-crwn-text mb-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> Live Now
          </h2>
          <div className="space-y-3">
            {liveNow.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-3 border-b border-crwn-elevated/50">
                <div className="min-w-0">
                  <p className="text-crwn-text font-medium truncate">{s.title}</p>
                  <p className="text-crwn-text-secondary text-sm">
                    {s.is_free ? 'Free for all' : 'Subscribers'}
                  </p>
                </div>
                <Link
                  href={`/${artistSlug}/live/${s.id}`}
                  className="neu-button-accent px-5 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5 flex-shrink-0"
                >
                  <Radio className="w-4 h-4" /> Join
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-crwn-text mb-4">Upcoming</h2>
          <div className="space-y-3">
            {upcoming.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-3 border-b border-crwn-elevated/50">
                <div className="min-w-0">
                  <p className="text-crwn-text font-medium truncate">{s.title}</p>
                  <p className="text-crwn-text-secondary text-sm flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : 'Time TBA'}
                  </p>
                </div>
                <span className="text-crwn-gold text-sm font-medium flex-shrink-0">Scheduled</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recordings */}
      {recordings.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-crwn-text mb-4">Recordings</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recordings.map((s) => {
              const access = hasAccess(s);
              const duration = fmtDuration(s.vod_duration_seconds);
              const ago = fmtAgo(s.ended_at || s.vod_ready_at || s.created_at);

              const isPlaying = playId === s.id && !!playUrl;

              const cover = (
                <div
                  className="relative aspect-video flex items-center justify-center bg-gradient-to-br from-crwn-elevated to-crwn-bg bg-cover bg-center"
                  style={s.vod_thumbnail_url ? { backgroundImage: `url(/api/live/thumbnail?sessionId=${s.id})` } : undefined}
                >
                  {/* scrim so overlays stay legible over a photo cover */}
                  {s.vod_thumbnail_url && <span className="absolute inset-0 bg-black/25" />}
                  {access ? (
                    busyId === s.id ? (
                      <span className="relative w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      </span>
                    ) : (
                      <span className="relative w-14 h-14 rounded-full bg-crwn-gold/90 flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
                        <Play className="w-6 h-6 text-black fill-black ml-0.5" />
                      </span>
                    )
                  ) : (
                    <span className="relative w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
                      <Lock className="w-6 h-6 text-white/70" />
                    </span>
                  )}
                  {duration && (
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-xs font-semibold">
                      {duration}
                    </span>
                  )}
                  {ago && (
                    <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-xs font-medium">
                      {ago}
                    </span>
                  )}
                  {!s.is_free && (
                    <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 text-crwn-gold text-xs font-semibold">
                      Subscribers
                    </span>
                  )}
                </div>
              );

              return (
                <div key={s.id} className="group flex flex-col rounded-2xl overflow-hidden bg-crwn-surface border border-crwn-elevated/50">
                  {isPlaying ? (
                    <div className="aspect-video bg-black">
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <video src={playUrl!} controls autoPlay playsInline className="w-full h-full object-contain" />
                    </div>
                  ) : access ? (
                    <button
                      onClick={() => play(s)}
                      disabled={busyId === s.id}
                      className="block w-full text-left disabled:opacity-70"
                      aria-label={`Play ${s.title}`}
                    >
                      {cover}
                    </button>
                  ) : (
                    cover
                  )}

                  <div className="flex flex-col flex-1 gap-2 p-3">
                    <div className="min-w-0">
                      <p className="text-crwn-text font-semibold leading-snug line-clamp-2">{s.title}</p>
                      <p className="text-crwn-text-secondary text-xs mt-0.5 flex flex-wrap items-center gap-x-1.5">
                        <span>{fmtDate(s.ended_at || s.vod_ready_at || s.created_at)}</span>
                        {errorId === s.id && <span className="text-crwn-error">· Couldn&apos;t load recording</span>}
                      </p>
                    </div>
                    <div className="mt-auto flex items-center gap-2">
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 text-crwn-text-secondary animate-spin" />
                      ) : access ? (
                        <button
                          onClick={() => download(s)}
                          disabled={busyId === s.id}
                          className="neu-button px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {busyId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          Download
                        </button>
                      ) : (
                        <span className="text-crwn-text-secondary text-xs flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" /> Subscribers only
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* All categories empty but sessions exist (e.g. only ended sessions with no ready VOD) */}
      {liveNow.length === 0 && upcoming.length === 0 && recordings.length === 0 && (
        <EmptyState
          icon="📡"
          title="Nothing to show yet"
          description="No live session is running and no recordings are ready. Check back soon."
        />
      )}
    </div>
  );
}
