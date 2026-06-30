'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSubscription } from '@/hooks/useSubscription';
import { LiveSession } from '@/types/live';
import { Radio, Video, Download, Loader2, Lock, Calendar } from 'lucide-react';
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

  const download = async (s: LiveSession) => {
    setBusyId(s.id);
    setErrorId(null);
    try {
      const res = await fetch(`/api/live/vod?sessionId=${s.id}`);
      if (!res.ok) throw new Error('vod fetch failed');
      const { url } = await res.json();
      if (url) window.open(url, '_blank'); // external R2 signed URL — not internal nav
    } catch (err) {
      console.error('Error downloading recording:', err);
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
          <div className="space-y-3">
            {recordings.map((s) => {
              const access = hasAccess(s);
              const duration = fmtDuration(s.vod_duration_seconds);
              const isPrerecorded = s.source_type === 'prerecorded';
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 py-3 border-b border-crwn-elevated/50">
                  <div className="min-w-0">
                    <p className="text-crwn-text font-medium truncate">{s.title}</p>
                    <p className="text-crwn-text-secondary text-sm flex flex-wrap items-center gap-x-2">
                      <span>{fmtDate(s.ended_at || s.vod_ready_at || s.created_at)}</span>
                      {duration && (<><span>·</span><span>{duration}</span></>)}
                      {!s.is_free && (<><span>·</span><span>Subscribers</span></>)}
                      {errorId === s.id && <span className="text-crwn-error">· Couldn&apos;t fetch download</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 text-crwn-text-dim animate-spin" />
                    ) : access ? (
                      <>
                        {isPrerecorded && (
                          <Link
                            href={`/${artistSlug}/live/${s.id}`}
                            className="neu-button px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5"
                          >
                            <Video className="w-4 h-4" /> Watch
                          </Link>
                        )}
                        <button
                          onClick={() => download(s)}
                          disabled={busyId === s.id}
                          className="neu-button-accent px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {busyId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          Download
                        </button>
                      </>
                    ) : (
                      <span className="text-crwn-text-dim text-sm flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" /> Subscribers only
                      </span>
                    )}
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
