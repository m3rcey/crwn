'use client';

// The artist's live scoreboard, for a phone on a music stand.
//
// Built for someone who is not comfortable with technology and is busy performing. So:
//   * ONE screen. No menu, no tabs, no buttons, nothing that can be pressed by accident.
//   * Numbers large enough to read at arm's length on a dim stage.
//   * The show that is open right now comes FIRST, so nobody has to scroll to find it.
//   * Plain words: "Voting open", "In the lead", "14 votes". No CRWN vocabulary.
//   * It refreshes by itself and, where the phone allows, keeps the screen from locking, so
//     it is still showing the room when he looks down between songs.
//
// It holds no authority. Every refresh re-presents the token to /api/song-lab/scoreboard,
// which verifies it server-side and returns aggregate counts only.

import { useCallback, useEffect, useRef, useState } from 'react';

interface Option { id: string; label: string; votes: number; percent: number }
interface Show {
  id: string;
  stageLabel: string;
  status: string;
  votes: number;
  closesAt: string | null;
  options: Option[];
}

interface LiveScoreboardProps {
  artistSlug: string;
  token: string;
  artistName: string;
  initialShows: Show[];
  initialUpdatedAt: string;
}

const REFRESH_MS = 15_000;

const STATUS_WORDS: Record<string, string> = {
  open: 'Voting open',
  scheduled: 'Opens soon',
  closed: 'Voting closed',
};

/** Open shows first (that is the one on stage), then the rest in schedule order. */
function orderShows(shows: Show[]): Show[] {
  return [...shows].sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open'));
}

export function LiveScoreboard({ artistSlug, token, artistName, initialShows, initialUpdatedAt }: LiveScoreboardProps) {
  const [shows, setShows] = useState<Show[]>(initialShows);
  const [updatedAt, setUpdatedAt] = useState<Date>(new Date(initialUpdatedAt));
  const [offline, setOffline] = useState(false);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/song-lab/scoreboard?artist=${encodeURIComponent(artistSlug)}&token=${encodeURIComponent(token)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setShows(Array.isArray(data.shows) ? data.shows : []);
      setUpdatedAt(new Date(data.updatedAt || Date.now()));
      setOffline(false);
    } catch {
      // Keep the last good numbers on screen. A blank scoreboard mid-show helps nobody.
      setOffline(true);
    }
  }, [artistSlug, token]);

  // Refresh on a timer while visible, and immediately when the screen comes back.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // Keep the screen awake where the browser supports it. The lock is dropped whenever the
  // page is hidden, so it is requested again each time the page comes back. Silent if the
  // phone does not support it: the page still works, the screen just locks as normal.
  useEffect(() => {
    let cancelled = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const acquire = async () => {
      if (!nav.wakeLock || document.visibilityState !== 'visible') return;
      try {
        const lock = await nav.wakeLock.request('screen');
        if (cancelled) { lock.release().catch(() => {}); return; }
        wakeLock.current = lock;
      } catch { /* unsupported or refused: nothing to do */ }
    };
    acquire();
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
    };
  }, []);

  const ordered = orderShows(shows);
  const time = updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <main className="min-h-screen bg-crwn-bg px-5 py-8">
      <div className="w-full max-w-xl mx-auto">
        {artistName ? (
          <p className="text-lg font-semibold tracking-widest uppercase text-crwn-gold text-center mb-2">
            {artistName}
          </p>
        ) : null}
        <h1 className="text-4xl font-bold text-crwn-text text-center mb-8">Live results</h1>

        {ordered.length === 0 ? (
          <p className="text-2xl text-crwn-text-secondary text-center leading-relaxed">
            No votes yet. This page updates by itself.
          </p>
        ) : (
          <div className="space-y-10">
            {ordered.map((show) => {
              const top = Math.max(0, ...show.options.map((o) => o.votes));
              const leaders = show.options.filter((o) => o.votes === top && top > 0);
              return (
                <section key={show.id} aria-label={show.stageLabel}>
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <h2 className="text-3xl font-bold text-crwn-text">{show.stageLabel}</h2>
                    <span className={`text-lg font-bold px-4 py-1.5 rounded-full ${
                      show.status === 'open'
                        ? 'bg-crwn-gold text-crwn-bg'
                        : 'bg-crwn-surface text-crwn-text-secondary'
                    }`}>
                      {STATUS_WORDS[show.status] ?? show.status}
                    </span>
                  </div>

                  {show.votes === 0 ? (
                    <p className="text-2xl text-crwn-text-secondary">No votes yet</p>
                  ) : (
                    <div className="space-y-7">
                      {show.options.map((o) => {
                        const leading = leaders.length === 1 && leaders[0].id === o.id;
                        return (
                          <div key={o.id}>
                            <p className={`text-2xl leading-snug mb-2 ${leading ? 'font-bold text-crwn-text' : 'text-crwn-text'}`}>
                              {o.label}
                            </p>
                            <div className="flex items-baseline justify-between gap-3 mb-2">
                              <span className="text-5xl font-bold text-crwn-gold tabular-nums">{o.percent}%</span>
                              <span className="text-xl text-crwn-text-secondary tabular-nums">
                                {o.votes === 1 ? '1 vote' : `${o.votes} votes`}
                              </span>
                            </div>
                            <div className="h-5 rounded-full bg-crwn-surface overflow-hidden" role="presentation">
                              <div className="h-full rounded-full bg-crwn-gold transition-all duration-700" style={{ width: `${o.percent}%` }} />
                            </div>
                            {leading ? (
                              <p className="mt-2 text-lg font-bold text-crwn-gold">In the lead</p>
                            ) : null}
                          </div>
                        );
                      })}
                      {leaders.length > 1 ? (
                        <p className="text-lg font-bold text-crwn-gold">It is a tie</p>
                      ) : null}
                      <p className="text-xl text-crwn-text-secondary">
                        {show.votes === 1 ? '1 vote in this show' : `${show.votes} votes in this show`}
                      </p>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <p className="mt-12 text-lg text-crwn-text-secondary text-center" aria-live="polite">
          {offline
            ? `Trying to reconnect. Showing results from ${time}.`
            : `Updates by itself. Last checked ${time}.`}
        </p>
      </div>
    </main>
  );
}
