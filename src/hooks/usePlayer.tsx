'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { preconnect } from 'react-dom';
import { Track } from '@/types';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { clientHasDnt } from '@/lib/analytics/doNotTrack';
import { INITIAL_PLAYER_STATE, type PlayerState, type RepeatMode, type PlaybackEngine } from '@/lib/player/engine';
import { getPlayerEngine } from '@/lib/player/browserEnv';

/**
 * React's view of the playback engine (src/lib/player/engine.ts).
 *
 * This provider OWNS NOTHING about playback. The <audio> element, the queue, the next-track
 * preparation and every transition live in one engine per tab, created outside React. This
 * file subscribes to it and forwards controls, so:
 *   - a route change, a re-render or a remount can never pause, restart or duplicate audio
 *     (the old provider paused the element in its unmount cleanup);
 *   - `ended` -> next track is decided by the engine inside the media event, never by a
 *     React effect that may be a render behind.
 * The API below is unchanged for every consumer.
 */

interface PlayerContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  /** Asked to play, no audio yet (loading or re-buffering). */
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  queue: Track[];
  currentIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
  isExpanded: boolean;
  play: (track: Track, trackList?: Track[]) => void;
  playAll: (tracks: Track[], startIndex?: number) => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (newVolume: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleExpanded: () => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  resetPlayer: () => void;
  reorderQueue: (startIndex: number, endIndex: number) => void;
  isFavorite: (trackId: string) => boolean;
  toggleFavorite: (trackId: string) => Promise<void>;
  favorites: Set<string>;
  /** True when the database handed this reader a playable audio URL. */
  canPlayTrack: (track: Track) => boolean;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

const SUPABASE_ORIGIN = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin; } catch { return null; }
})();

/** The engine, or null during server rendering. */
function useEngine(): PlaybackEngine | null {
  const [engine] = useState<PlaybackEngine | null>(() => (typeof window === 'undefined' ? null : getPlayerEngine()));
  return engine;
}

const noopSubscribe = () => () => {};
const serverSnapshot = () => INITIAL_PLAYER_STATE;

/** The timestamp of the tap that called play(), so latency traces start at the finger. */
function gestureTime(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const ev = (window as unknown as { event?: Event }).event;
  return ev && typeof ev.timeStamp === 'number' && ev.timeStamp > 0 ? ev.timeStamp : undefined;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const engine = useEngine();

  // Warm both connection pools to Storage before the first tap: the <audio> request
  // (credentialed, no-cors) and the prefetch fetch() (anonymous CORS) use different ones.
  if (SUPABASE_ORIGIN) {
    preconnect(SUPABASE_ORIGIN);
    preconnect(SUPABASE_ORIGIN, { crossOrigin: 'anonymous' });
  }

  const state: PlayerState = useSyncExternalStore(
    engine ? engine.subscribe : noopSubscribe,
    engine ? engine.getState : serverSnapshot,
    serverSnapshot,
  );

  const [isExpanded, setIsExpanded] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Load favorites on user change
  useEffect(() => {
    async function fetchFavorites() {
      if (!user) return;
      const { data } = await supabase
        .from('favorites')
        .select('track_id')
        .eq('user_id', user.id);

      if (Array.isArray(data)) {
        setFavorites(new Set(data.map(f => f.track_id)));
      }
    }
    fetchFavorites();
  }, [user?.id, supabase]);

  // A different account in this tab must never inherit the last one's queue. Sign-out paths
  // call resetPlayer themselves; this covers switching straight from one account to another.
  // Only a switch between two real ids resets: a momentary null must never stop a song.
  const lastUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (!engine || authLoading) return;
    const id = user?.id ?? null;
    const prev = lastUserRef.current;
    if (prev && id && prev !== id) engine.reset();
    if (id) lastUserRef.current = id;
    engine.setOwner(id);
  }, [user?.id, authLoading, engine]);

  // Bring back this tab's session once auth has resolved, for the same account only (a deploy
  // makes Next.js reload the document on the next navigation; the listen continues).
  useEffect(() => {
    if (engine && !authLoading) engine.restore(user?.id ?? null);
  }, [engine, authLoading, user?.id]);

  // Can play track
  //
  // The DATABASE decides, not this hook. `tracks_public` NULLs audio_url_* for any
  // reader who is not entitled (free / owner / purchaser / subscribed on an allowed
  // tier), and anon+authenticated hold no grant on those columns of `tracks`. So a
  // missing URL IS the gate, already enforced server-side. The client only reflects
  // it -- it never re-derives entitlement, which is exactly how the old leak worked.
  const canPlayTrack = useCallback((track: Track): boolean => {
    return !!track.audio_url_128;
  }, []);

  // History is written for whoever is signed in when a listen ENDS, read through a ref so the
  // engine subscription below is made once, not on every auth change.
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);
  const logPlayHistory = useCallback(async (track: Track, startedAt: number, duration: number) => {
    const u = userRef.current;
    if (!u) return;
    // Founder devices are never counted (src/lib/analytics/doNotTrack.ts): no play_history
    // row, no play_count increment. Trade-off, accepted: recently-played stops accruing on a
    // marked device, because play_history is also what artist analytics counts plays from.
    if (clientHasDnt()) return;
    const durationPlayed = Math.floor((Date.now() - startedAt) / 1000);
    const completed = duration >= 30 && durationPlayed >= duration * 0.8;
    await supabase.from('play_history').insert({
      user_id: u.id,
      track_id: track.id,
      duration_played: durationPlayed,
      completed,
    });
    // Increment play count on completed listen
    if (completed) {
      await supabase.rpc('increment_play_count', { track_id_input: track.id });
    }
  }, [supabase]);

  // Play history. The engine reports every finished listen, including automatic advances
  // and queue ends, which the old provider never logged (it only logged when a NEW track
  // was started by play()).
  useEffect(() => {
    if (!engine) return;
    return engine.onEvent((e) => {
      if (e.type === 'locked') {
        // Surfaces that render their own lock (GatedTrackPlayer) never reach here.
        showToast(e.track.price ? 'Buy this track to listen' : 'Subscribe to listen', 'info');
      } else if (e.type === 'failed') {
        if (e.userInitiated) showToast('Could not load this track', 'error');
      } else if (e.type === 'listen') {
        void logPlayHistory(e.track, e.startedAt, e.duration);
      }
    });
  }, [engine, showToast, logPlayHistory]);

  // Artist name and link are DISPLAY metadata, filled in after the track is current; nothing
  // about them sits in front of the audio request.
  const current = state.currentTrack;
  useEffect(() => {
    if (!engine || !current || current.artist?.slug || !current.artist_id) return;
    const id = current.id;
    const artistId = current.artist_id;
    let cancelled = false;
    (async () => {
      const { data: artistData } = await supabase
        .from('artist_profiles')
        .select('id, slug, profile:profiles(display_name)')
        .eq('id', artistId)
        .single();
      if (cancelled || !artistData) return;
      const profile = Array.isArray(artistData.profile) ? artistData.profile[0] : artistData.profile;
      engine.patchTrack(id, {
        artist: { ...(current.artist || {}), id: artistData.id, slug: artistData.slug, profile } as Track['artist'],
        artist_name: (profile as { display_name?: string } | null)?.display_name || 'Unknown Artist',
      });
    })();
    return () => { cancelled = true; };
  }, [engine, current?.id, current?.artist?.slug, current?.artist_id, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = useCallback((track: Track, trackList?: Track[]) => engine?.play(track, trackList, gestureTime()), [engine]);
  const playAll = useCallback((tracks: Track[], startIndex = 0) => engine?.playAll(tracks, startIndex, gestureTime()), [engine]);
  const pause = useCallback(() => engine?.pause(), [engine]);
  const togglePlay = useCallback(() => engine?.togglePlay(), [engine]);
  const next = useCallback(() => engine?.next(), [engine]);
  const previous = useCallback(() => engine?.previous(), [engine]);
  const seek = useCallback((t: number) => engine?.seek(t), [engine]);
  const setVolume = useCallback((v: number) => engine?.setVolume(v), [engine]);
  const toggleShuffle = useCallback(() => engine?.toggleShuffle(), [engine]);
  const toggleRepeat = useCallback(() => engine?.toggleRepeat(), [engine]);
  const toggleExpanded = useCallback(() => setIsExpanded(prev => !prev), []);
  const addToQueue = useCallback((t: Track) => engine?.addToQueue(t), [engine]);
  const playNext = useCallback((t: Track) => engine?.playNext(t), [engine]);
  const removeFromQueue = useCallback((i: number) => engine?.removeFromQueue(i), [engine]);
  const clearQueue = useCallback(() => engine?.clearQueue(), [engine]);
  const resetPlayer = useCallback(() => engine?.reset(), [engine]);
  const reorderQueue = useCallback((a: number, b: number) => engine?.reorderQueue(a, b), [engine]);

  // Favorites
  const isFavorite = useCallback((trackId: string) => favorites.has(trackId), [favorites]);

  const toggleFavorite = useCallback(async (trackId: string) => {
    if (!user) return;

    await supabase.rpc('toggle_favorite', {
      p_user_id: user.id,
      p_track_id: trackId,
    });

    setFavorites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(trackId)) {
        newSet.delete(trackId);
      } else {
        newSet.add(trackId);
      }
      return newSet;
    });
  }, [user, supabase]);

  return (
    <PlayerContext.Provider value={{
      currentTrack: state.currentTrack,
      isPlaying: state.isPlaying,
      isBuffering: state.isBuffering,
      currentTime: state.currentTime,
      duration: state.duration,
      volume: state.volume,
      queue: state.queue,
      currentIndex: state.currentIndex,
      shuffle: state.shuffle,
      repeat: state.repeat,
      isExpanded,
      play,
      playAll,
      pause,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      toggleShuffle,
      toggleRepeat,
      toggleExpanded,
      addToQueue,
      playNext,
      removeFromQueue,
      clearQueue,
      resetPlayer,
      reorderQueue,
      isFavorite,
      toggleFavorite,
      favorites,
      canPlayTrack,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}
