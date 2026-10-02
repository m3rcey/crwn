/**
 * The playback engine: ONE per browser tab, outside React.
 *
 * WHY IT LIVES OUTSIDE REACT (2026-10-02 playback audit)
 * ------------------------------------------------------
 * The old player kept its queue in React state and re-bound the `ended` listener on every
 * render, so "what plays next" was a closure that could be a render behind, and the
 * PROVIDER's unmount cleanup paused the audio. The engine is a plain object created once per
 * document (`getPlayerEngine` in browserEnv.ts). React subscribes to it; no route, layout or
 * component owns the media element, and no re-render can restart, recreate or pause it.
 *
 * HOW A TRACK CHANGE STAYS INSIDE THE LATENCY BUDGET
 * --------------------------------------------------
 * Measured before this existed (scripts/probe-playback.mjs, production, fast desktop link):
 * `ended` -> next track audible took 0.56 to 1.21s, ALL of it a cold, uncached Storage
 * request for the next file (cf-cache-status MISS, 0.7-1.0s to first byte) that nothing had
 * started before the song ended. On a phone, or when the page's pre-signed urls were older
 * than 50 minutes (one more serverless round trip), the same gap grew to many seconds.
 *
 * So the next track is PREPARED while the current one plays: its stream url is resolved
 * through the same entitlement path as always, then the whole file is fetched into memory and
 * held as a blob: url. At `ended` the engine swaps `src` to that in-memory copy and calls
 * play() SYNCHRONOUSLY in the event handler. Nothing between the end of one song and the
 * start of the next waits on the network, a timer, React, or an animation frame.
 *
 * ONE ELEMENT, NOT TWO, ON PURPOSE
 * --------------------------------
 * iOS runs the `ended` handler with the screen locked and lets the SAME element that the
 * listener unlocked by a tap take a new `src` and play() from there (WebKit 261554, fixed in
 * iOS 17.5). A standby element that was never played inside a gesture is not unlocked and
 * cannot start from the background. Reliability first: one element, the next track's bytes
 * already local. Web Audio and MediaSource were considered and rejected: Web Audio contexts
 * are suspended in the background on iOS, and MediaSource only exists on iPhone as
 * ManagedMediaSource (17.1+), which would add a second playback path for no measured gain.
 *
 * ENTITLEMENT IS UNCHANGED
 * ------------------------
 * The engine never decides access. A track with no `audio_url_128` (tracks_public withheld
 * it) is refused before anything is requested. A url comes only from a page's server-side
 * pre-sign (freshStreamUrl) or from /api/tracks/[id]/stream, which re-reads tracks_public as
 * the caller. Preparing the next track uses exactly those two sources, so nothing a listener
 * could not already play is ever fetched, and the blob: url is local to this document.
 */

import type { Track } from '@/types';
import { freshStreamUrl, STREAM_URL_FRESH_MARGIN_MS } from '@/lib/storage/streamUrl';
import {
  indexAfterMove,
  isPlayable,
  moveItem,
  nextIndex,
  previousIndex,
  shuffleAround,
  type RepeatMode,
} from './queue';

export type { RepeatMode };

/** The subset of HTMLMediaElement the engine touches. Lets tests drive a fake one. */
export interface MediaLike {
  src: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  readonly buffered: { length: number; start(i: number): number; end(i: number): number };
  volume: number;
  preload: string;
  play(): Promise<void> | undefined;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: () => void): void;
}

export interface MediaSessionLike {
  metadata: unknown;
  playbackState: 'none' | 'paused' | 'playing';
  setActionHandler(action: string, handler: ((details: { seekTime?: number; seekOffset?: number }) => void) | null): void;
  setPositionState?(state: { duration: number; position: number; playbackRate: number }): void;
}

export interface ResolvedUrl {
  url: string;
  /** Epoch ms at which the url stops resolving. */
  expiresAt: number;
}

export interface EngineEnv {
  createMedia(): MediaLike;
  /** Mint a stream url through the server gate (/api/tracks/[id]/stream). Null = refused. */
  resolveUrl(trackId: string, signal: AbortSignal): Promise<ResolvedUrl | null>;
  /** Fetch a whole file into memory and return a blob: url, or null (too big, failed). */
  fetchBlobUrl?(url: string, signal: AbortSignal): Promise<string | null>;
  revokeBlobUrl?(url: string): void;
  /** Epoch ms. */
  now(): number;
  /** High-resolution ms for latency traces (performance.now in a browser). */
  perfNow(): number;
  storage?: { read(): string | null; write(value: string): void; clear(): void } | null;
  mediaSession?: MediaSessionLike | null;
  makeMetadata?(init: { title: string; artist: string; album: string; artwork?: { src: string }[] }): unknown;
  /** Instrumentation only: report the instant the media clock first advances. */
  watchAdvance?(media: MediaLike, from: number, done: () => void): void;
  log?(line: string, data?: unknown): void;
}

export interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  currentIndex: number;
  /** The listener's intent: true from the moment a track is asked to play until a pause. */
  isPlaying: boolean;
  /** Asked to play, no audio yet (loading or re-buffering). */
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export type EngineEvent =
  /** The track has no grant for this listener; nothing was requested. */
  | { type: 'locked'; track: Track }
  /** A track could not be loaded and the engine gave up on it. */
  | { type: 'failed'; track: Track; userInitiated: boolean }
  /** A listen ended (track change, queue end, reset). Drives play_history. */
  | { type: 'listen'; track: Track; startedAt: number; duration: number }
  /** The browser refused play() without a gesture (a restored session after a reload). */
  | { type: 'blocked'; track: Track };

/** One latency trace: request -> audible, with every stage in between. */
export interface PlaybackTrace {
  gen: number;
  reason: 'tap' | 'ended' | 'next' | 'previous' | 'restore' | 'retry' | 'skip';
  trackId: string;
  title: string;
  source?: 'memory' | 'prepared-url' | 'presigned' | 'route';
  /** ms after the request. */
  marks: Record<string, number>;
}

/** Start preparing the next track once this little of the current one remains, at the latest.
 *  An 8 MB file on a weak (1.4 Mbps) link takes about 45s, so 60 leaves room. */
export const PREPARE_REMAINING_S = 60;
/** ...as long as at least this much of the current song is already buffered ahead. */
export const PREPARE_MIN_AHEAD_S = 15;
/** Inside the last seconds, prepare regardless. */
export const PREPARE_FORCE_S = 20;
/** Two back presses this close together mean "previous track", not "restart". */
export const BACK_DOUBLE_PRESS_MS = 3000;
/** A saved session this recent that was playing is a continuation (a forced reload), so it resumes. */
export const RESUME_WINDOW_MS = 20_000;
/** Saved sessions older than this are not restored at all. */
export const RESTORE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** How many in-memory tracks to keep (current, next, and the one before). */
export const MEMORY_TRACKS = 3;
const SAVE_EVERY_MS = 5000;
const MAX_SAVED_QUEUE = 200;
const TRACE_KEEP = 30;

const INITIAL: PlayerState = {
  currentTrack: null,
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  isBuffering: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  shuffle: false,
  repeat: 'off',
};

export const INITIAL_PLAYER_STATE: PlayerState = INITIAL;

interface Saved {
  v: 1;
  /** The account that saved it (null = signed out). Restored only for the same account. */
  owner: string | null;
  queue: Track[];
  originalQueue: Track[];
  index: number;
  time: number;
  playing: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  savedAt: number;
}

interface Prep {
  trackId: string;
  abort: AbortController;
  url: ResolvedUrl | null;
}

interface LoadOpts {
  autoplay: boolean;
  reason: PlaybackTrace['reason'];
  startTime?: number;
  /** perfNow() of the triggering event, when the caller has it (a tap's event.timeStamp). */
  at?: number;
  /** Skip every cached source and go to the server (a retry after a failed url). */
  forceRoute?: boolean;
  /** The listener picked this track (tap, restore). A failure then stops with a message
   *  instead of skipping ahead. Carried through a retry. */
  user?: boolean;
}

function isUserLoad(o: LoadOpts): boolean {
  return o.user ?? (o.reason === 'tap' || o.reason === 'restore');
}

export class PlaybackEngine {
  readonly media: MediaLike;
  private state: PlayerState = INITIAL;
  private originalQueue: Track[] = [];
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: EngineEvent) => void>();

  /** Bumped by every load. Async work for an older generation is discarded. */
  private gen = 0;
  private srcGen = 0;
  private pendingStart = false;
  private retriedGen = -1;
  private lastLoad: LoadOpts | null = null;
  private consecutiveFailures = 0;
  private resolveAbort: AbortController | null = null;

  /** Signed urls already minted this session, by track id. */
  private urls = new Map<string, ResolvedUrl>();
  /** In-memory copies (blob: urls) by track id, oldest first. */
  private memory = new Map<string, string>();
  private prep: Prep | null = null;

  private listenStartedAt: number | null = null;
  private lastSaveAt = 0;
  private lastBackPress = 0;
  private restored = false;
  private owner: string | null = null;
  private traces: PlaybackTrace[] = [];
  private activeTrace: { trace: PlaybackTrace; t0: number } | null = null;

  constructor(private env: EngineEnv) {
    this.media = env.createMedia();
    this.media.preload = 'auto';
    this.media.volume = INITIAL.volume;
    this.bindMedia();
    this.bindMediaSession();
  }

  // ---------------------------------------------------------------------------------------
  // Subscription (React reads through useSyncExternalStore)
  // ---------------------------------------------------------------------------------------

  getState = (): PlayerState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  onEvent(fn: (e: EngineEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  getTraces(): PlaybackTrace[] {
    return [...this.traces];
  }

  private set(patch: Partial<PlayerState>) {
    let changed = false;
    for (const k of Object.keys(patch) as (keyof PlayerState)[]) {
      if (this.state[k] !== patch[k]) { changed = true; break; }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  private emit(e: EngineEvent) {
    for (const fn of this.eventListeners) {
      try { fn(e); } catch { /* a listener never breaks playback */ }
    }
  }

  // ---------------------------------------------------------------------------------------
  // Public controls
  // ---------------------------------------------------------------------------------------

  /** Play `track`, making `list` the queue when one is given. `at` = the tap's timestamp. */
  play(track: Track, list?: Track[], at?: number) {
    if (!isPlayable(track)) {
      this.emit({ type: 'locked', track });
      return;
    }
    if (list && list.length > 0) {
      const start = Math.max(0, list.findIndex((t) => t.id === track.id));
      this.originalQueue = [...list];
      const queue = this.state.shuffle ? shuffleAround(list, start) : [...list];
      this.set({ queue, currentIndex: start });
    }
    const { queue, currentTrack } = this.state;
    if (currentTrack?.id === track.id && this.media.src) {
      this.resume();
      return;
    }
    let index = queue.findIndex((t) => t.id === track.id);
    if (index < 0) {
      // Played on its own, outside the queue: slot it in right after what is playing.
      const at2 = queue.length ? this.state.currentIndex + 1 : 0;
      const q = [...queue];
      q.splice(at2, 0, track);
      this.originalQueue = [...this.originalQueue];
      this.originalQueue.splice(Math.min(at2, this.originalQueue.length), 0, track);
      this.set({ queue: q });
      index = at2;
    }
    this.load(index, { autoplay: true, reason: 'tap', at });
  }

  playAll(list: Track[], startIndex = 0, at?: number) {
    const track = list[startIndex];
    if (!track) return;
    this.play(track, list, at);
  }

  resume() {
    const { currentTrack, currentIndex } = this.state;
    if (!currentTrack) return;
    if (!this.media.src) {
      this.load(currentIndex, { autoplay: true, reason: 'tap', startTime: this.state.currentTime });
      return;
    }
    this.set({ isPlaying: true });
    if (this.listenStartedAt === null) this.listenStartedAt = this.env.now();
    const gen = this.gen;
    this.callPlay(gen);
    this.save(true);
  }

  pause() {
    this.media.pause();
    this.pendingStart = false;
    this.set({ isPlaying: false, isBuffering: false });
    this.syncSessionState();
    this.save(true);
  }

  togglePlay() {
    if (this.state.isPlaying) this.pause();
    else this.resume();
  }

  next() {
    const i = nextIndex(this.state.queue, this.state.currentIndex, this.state.repeat === 'one' ? 'off' : this.state.repeat);
    if (i === null) return;
    this.load(i, { autoplay: true, reason: 'next' });
  }

  /**
   * Back. ONE press restarts the song; a SECOND press within BACK_DOUBLE_PRESS_MS goes to the
   * previous track (founder decision 2026-09-08). At the first track it restarts.
   */
  previous() {
    const now = this.env.now();
    const double = now - this.lastBackPress < BACK_DOUBLE_PRESS_MS;
    this.lastBackPress = now;
    const i = double ? previousIndex(this.state.queue, this.state.currentIndex, this.state.repeat) : null;
    if (i === null) {
      this.seek(0);
      return;
    }
    this.lastBackPress = 0;
    this.load(i, { autoplay: true, reason: 'previous' });
  }

  seek(time: number) {
    const t = Math.max(0, time);
    try { this.media.currentTime = t; } catch { /* not seekable yet */ }
    this.set({ currentTime: t });
    this.syncSessionPosition();
    this.save(true);
  }

  setVolume(v: number) {
    const vol = Math.max(0, Math.min(1, v));
    this.media.volume = vol;
    this.set({ volume: vol });
  }

  toggleShuffle() {
    const { shuffle, queue, currentIndex, currentTrack } = this.state;
    if (!shuffle) {
      this.set({ shuffle: true, queue: shuffleAround(queue, currentIndex) });
    } else {
      const restored = this.originalQueue.length ? [...this.originalQueue] : queue;
      const idx = currentTrack ? restored.findIndex((t) => t.id === currentTrack.id) : -1;
      this.set({ shuffle: false, queue: restored, currentIndex: idx >= 0 ? idx : currentIndex });
    }
    this.reprepare();
    this.save(true);
  }

  toggleRepeat() {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    this.set({ repeat: modes[(modes.indexOf(this.state.repeat) + 1) % modes.length] });
    this.reprepare();
    this.save(true);
  }

  addToQueue(track: Track) {
    this.originalQueue = [...this.originalQueue, track];
    this.set({ queue: [...this.state.queue, track] });
    this.reprepare();
  }

  playNext(track: Track) {
    const q = [...this.state.queue];
    q.splice(this.state.currentIndex + 1, 0, track);
    const cur = this.state.currentTrack;
    const oi = cur ? this.originalQueue.findIndex((t) => t.id === cur.id) : -1;
    this.originalQueue = [...this.originalQueue];
    this.originalQueue.splice(oi + 1, 0, track);
    this.set({ queue: q });
    this.reprepare();
  }

  removeFromQueue(index: number) {
    const { queue, currentIndex } = this.state;
    if (index < 0 || index >= queue.length) return;
    const removed = queue[index];
    const q = queue.filter((_, i) => i !== index);
    // Removing the playing entry keeps the song going; "next" becomes what now sits at its slot.
    const ci = index < currentIndex ? currentIndex - 1 : index === currentIndex ? currentIndex - 1 : currentIndex;
    const oi = this.originalQueue.findIndex((t) => t.id === removed.id);
    if (oi >= 0) this.originalQueue = this.originalQueue.filter((_, i) => i !== oi);
    this.set({ queue: q, currentIndex: Math.max(-1, ci) });
    this.reprepare();
  }

  clearQueue() {
    this.originalQueue = [];
    this.set({ queue: [], currentIndex: 0 });
    this.reprepare();
  }

  reorderQueue(from: number, to: number) {
    const { queue, currentIndex } = this.state;
    if (from < 0 || from >= queue.length || to < 0 || to >= queue.length) return;
    this.set({ queue: moveItem(queue, from, to), currentIndex: indexAfterMove(currentIndex, from, to) });
    this.reprepare();
  }

  /** Display metadata arrived for a track (artist name/link). Never touches the source. */
  patchTrack(id: string, patch: Partial<Track>) {
    const apply = (t: Track) => (t.id === id ? ({ ...t, ...patch } as Track) : t);
    const cur = this.state.currentTrack;
    this.set({
      currentTrack: cur && cur.id === id ? apply(cur) : cur,
      queue: this.state.queue.map(apply),
    });
    if (cur && cur.id === id) this.syncSessionMetadata();
  }

  /** Sign-out / account change: stop, forget the queue, and forget the saved session. */
  reset() {
    this.finishListen();
    this.gen++;
    this.resolveAbort?.abort();
    this.prep?.abort.abort();
    this.prep = null;
    this.pendingStart = false;
    this.media.pause();
    this.media.removeAttribute('src');
    try { this.media.load(); } catch { /* releases the old resource */ }
    for (const url of this.memory.values()) this.env.revokeBlobUrl?.(url);
    this.memory.clear();
    this.urls.clear();
    this.originalQueue = [];
    this.state = { ...INITIAL, volume: this.state.volume };
    for (const fn of this.listeners) fn();
    this.env.storage?.clear();
    if (this.env.mediaSession) {
      this.env.mediaSession.metadata = null;
      this.env.mediaSession.playbackState = 'none';
    }
  }

  // ---------------------------------------------------------------------------------------
  // Loading a track
  // ---------------------------------------------------------------------------------------

  private load(index: number, o: LoadOpts) {
    const track = this.state.queue[index];
    if (!track) return;
    this.finishListen();
    const gen = ++this.gen;
    this.lastLoad = o;
    this.resolveAbort?.abort();
    this.resolveAbort = null;
    const t0 = o.at ?? this.env.perfNow();
    this.beginTrace(gen, o.reason, track, t0);

    this.set({
      currentIndex: index,
      currentTrack: track,
      currentTime: o.startTime ?? 0,
      duration: track.duration ?? 0,
      isPlaying: o.autoplay,
      isBuffering: o.autoplay,
    });
    if (o.autoplay) this.listenStartedAt = this.env.now();
    this.syncSessionMetadata();

    const ready = o.forceRoute ? null : this.syncSourceFor(track);
    if (ready) {
      this.startSource(ready.url, ready.source, gen, o);
    } else if (o.autoplay) {
      this.resolveThenStart(track, gen, o);
    } else {
      // Restored paused with no fresh url: resolve only when the listener presses play.
      this.pendingStart = false;
      this.media.pause();
      this.media.removeAttribute('src');
    }
    // A loaded track may already be the prepared one. If its in-memory copy is still
    // downloading, cancel it: the listener is waiting on the stream now, and our own prefetch of
    // the same file would halve its bandwidth (measured: 2.7-7.7s to first byte on 4G).
    if (this.prep && this.prep.trackId === track.id) {
      if (!this.memory.has(track.id)) this.prep.abort.abort();
      this.prep = null;
    }
    this.reprepare();
    this.save(true);
  }

  /** A source that needs no network round trip before play(), best first. */
  private syncSourceFor(track: Track): { url: string; source: NonNullable<PlaybackTrace['source']> } | null {
    const mem = this.memory.get(track.id);
    if (mem) {
      this.touchMemory(track.id);
      return { url: mem, source: 'memory' };
    }
    const known = this.urls.get(track.id);
    if (known && this.env.now() < known.expiresAt - STREAM_URL_FRESH_MARGIN_MS) {
      return { url: known.url, source: 'prepared-url' };
    }
    const pre = freshStreamUrl(track, this.env.now());
    if (pre) return { url: pre, source: 'presigned' };
    return null;
  }

  private resolveThenStart(track: Track, gen: number, o: LoadOpts) {
    // Stop the old song now rather than letting it play on behind a network wait.
    this.pendingStart = true;
    this.media.pause();
    const ac = new AbortController();
    this.resolveAbort = ac;
    this.mark(gen, 'resolve-start');
    this.env.resolveUrl(track.id, ac.signal).then(
      (res) => {
        if (gen !== this.gen || ac.signal.aborted) return;
        if (!res) {
          this.fail(gen, track, o, true);
          return;
        }
        this.urls.set(track.id, res);
        this.mark(gen, 'url-resolved');
        this.startSource(res.url, 'route', gen, o);
      },
      () => {
        if (gen !== this.gen || ac.signal.aborted) return;
        this.fail(gen, track, o, true);
      },
    );
  }

  private startSource(url: string, source: NonNullable<PlaybackTrace['source']>, gen: number, o: LoadOpts) {
    if (gen !== this.gen) return;
    if (this.activeTrace?.trace.gen === gen) this.activeTrace.trace.source = source;
    this.srcGen = gen;
    this.pendingStart = o.autoplay;
    this.media.src = url;
    this.mark(gen, 'src-set');
    if (o.startTime) {
      try { this.media.currentTime = o.startTime; } catch { /* applied on loadedmetadata */ }
    }
    if (o.autoplay) this.callPlay(gen);
  }

  private callPlay(gen: number) {
    this.pendingStart = true;
    this.mark(gen, 'play-call');
    let p: Promise<void> | undefined;
    try {
      p = this.media.play();
    } catch (err) {
      this.onPlayRejected(gen, err);
      return;
    }
    p?.catch((err) => this.onPlayRejected(gen, err));
  }

  private onPlayRejected(gen: number, err: unknown) {
    if (gen !== this.gen) return; // superseded: the AbortError of a replaced source
    const name = (err as { name?: string } | null)?.name;
    if (name === 'AbortError') return;
    this.pendingStart = false;
    if (name === 'NotAllowedError') {
      // No gesture behind this play() (a restored session). Keep the track and position so
      // one tap resumes exactly here.
      this.set({ isPlaying: false, isBuffering: false });
      this.listenStartedAt = null;
      const t = this.state.currentTrack;
      if (t) this.emit({ type: 'blocked', track: t });
      this.syncSessionState();
      return;
    }
    // NotSupportedError and friends surface through the element's `error` event as well;
    // let that single path decide, so a failure is never handled twice.
  }

  /**
   * A source failed. First failure of a cached or pre-signed url retries once through the
   * server (the url may simply have expired while paused). After that: a track the listener
   * chose stops with a message; an automatic advance skips to the next playable track, bounded
   * by the queue length so a queue of dead files cannot spin.
   */
  private fail(gen: number, track: Track, o: LoadOpts, fromRoute = false) {
    if (gen !== this.gen) return;
    if (!fromRoute && this.retriedGen !== gen) {
      this.retriedGen = gen;
      this.urls.delete(track.id);
      this.dropMemory(track.id);
      const at = this.media.currentTime || this.state.currentTime;
      this.listenStartedAt = null;
      this.load(this.state.currentIndex, { ...o, user: isUserLoad(o), autoplay: o.autoplay || this.state.isPlaying, reason: 'retry', startTime: at, forceRoute: true });
      this.retriedGen = this.gen;
      return;
    }
    this.pendingStart = false;
    this.listenStartedAt = null;
    this.consecutiveFailures++;
    const userInitiated = isUserLoad(o);
    this.emit({ type: 'failed', track, userInitiated });
    this.mark(gen, 'failed');
    if (!userInitiated && this.consecutiveFailures < Math.max(1, this.state.queue.length)) {
      const i = nextIndex(this.state.queue, this.state.currentIndex, this.state.repeat === 'one' ? 'off' : this.state.repeat);
      if (i !== null && i !== this.state.currentIndex) {
        this.load(i, { autoplay: true, reason: 'skip' });
        return;
      }
    }
    this.set({ isPlaying: false, isBuffering: false });
    this.listenStartedAt = null;
    this.syncSessionState();
  }

  // ---------------------------------------------------------------------------------------
  // Media element events: the ONLY things that move playback forward
  // ---------------------------------------------------------------------------------------

  private bindMedia() {
    const m = this.media;
    m.addEventListener('playing', () => {
      this.pendingStart = false;
      this.consecutiveFailures = 0;
      this.set({ isPlaying: true, isBuffering: false });
      const gen = this.gen;
      this.mark(gen, 'playing');
      const from = m.currentTime;
      if (this.env.watchAdvance && this.activeTrace?.trace.gen === gen && this.activeTrace.trace.marks.audible === undefined) {
        this.env.watchAdvance(m, from, () => this.mark(gen, 'audible'));
      }
      this.syncSessionState();
      this.syncSessionPosition();
    });
    m.addEventListener('waiting', () => {
      if (this.state.isPlaying) this.set({ isBuffering: true });
    });
    m.addEventListener('pause', () => {
      // Fired before `ended`, and while a source is being replaced: neither is a pause.
      if (m.ended || this.pendingStart) return;
      this.set({ isPlaying: false, isBuffering: false });
      this.syncSessionState();
      this.save(true);
    });
    m.addEventListener('timeupdate', () => this.onTimeUpdate());
    // `suspend`: the browser stopped fetching this file because it has buffered enough. A
    // streamed track often never reads as fully buffered (the browser buffers a window, not the
    // file), so this is the earliest moment the network is idle and the next track can load
    // without competing with the one playing.
    m.addEventListener('suspend', () => {
      if (!this.prep && this.state.isPlaying && m.currentTime > 0) this.maybePrepare(true);
    });
    m.addEventListener('loadedmetadata', () => {
      const d = m.duration;
      if (Number.isFinite(d) && d > 0) this.set({ duration: d });
      this.syncSessionPosition();
    });
    m.addEventListener('durationchange', () => {
      const d = m.duration;
      if (Number.isFinite(d) && d > 0) this.set({ duration: d });
    });
    m.addEventListener('ended', () => this.onEnded());
    m.addEventListener('error', () => {
      const gen = this.gen;
      if (this.srcGen !== gen || !m.src) return; // an old source, or a deliberate unload
      const track = this.state.currentTrack;
      if (!track) return;
      this.fail(gen, track, this.lastLoad ?? { autoplay: this.state.isPlaying, reason: 'skip' });
    });
  }

  private onEnded() {
    const { repeat, queue, currentIndex } = this.state;
    if (repeat === 'one') {
      this.finishListen();
      this.listenStartedAt = this.env.now();
      this.media.currentTime = 0;
      this.callPlay(this.gen);
      return;
    }
    const i = nextIndex(queue, currentIndex, repeat);
    if (i === null) {
      this.finishListen();
      this.pendingStart = false;
      this.set({ isPlaying: false, isBuffering: false, currentTime: 0 });
      try { this.media.currentTime = 0; } catch { /* ignore */ }
      this.syncSessionState();
      this.save(true);
      return;
    }
    // Synchronous on purpose: the prepared next track starts inside this event handler.
    this.load(i, { autoplay: true, reason: 'ended' });
  }

  private onTimeUpdate() {
    const m = this.media;
    if (this.srcGen !== this.gen) return; // the old source, while the new one's url resolves
    this.set({ currentTime: m.currentTime });
    if (!this.prep) this.maybePrepare(false);
    if (this.env.now() - this.lastSaveAt >= SAVE_EVERY_MS) this.save(true);
  }

  /**
   * Prepare the next track only when that cannot starve the song playing now: the browser
   * says its network is idle (`suspend`), the file is fully buffered, or the end is near and
   * enough is buffered ahead. In the last PREPARE_FORCE_S it prepares regardless.
   */
  private maybePrepare(networkIdle: boolean) {
    const m = this.media;
    const d = Number.isFinite(m.duration) ? m.duration : this.state.duration;
    if (!(d > 0) || this.srcGen !== this.gen || this.pendingStart) return;
    const remaining = d - m.currentTime;
    const ahead = this.bufferedAhead();
    if (
      networkIdle ||
      ahead >= remaining - 0.5 ||
      remaining <= PREPARE_FORCE_S ||
      (remaining <= PREPARE_REMAINING_S && ahead >= Math.min(remaining, PREPARE_MIN_AHEAD_S))
    ) {
      this.prepareNext();
    }
  }

  /** Seconds buffered beyond the playhead (0 when unknown). */
  private bufferedAhead(): number {
    const b = this.media.buffered;
    const t = this.media.currentTime;
    try {
      for (let i = 0; i < b.length; i++) {
        if (b.start(i) <= t + 0.25 && b.end(i) >= t) return b.end(i) - t;
      }
    } catch { /* ignore */ }
    return 0;
  }

  // ---------------------------------------------------------------------------------------
  // Preparing the next track
  // ---------------------------------------------------------------------------------------

  /** The queue or its order changed: whatever was being prepared may no longer be next. */
  private reprepare() {
    const upcoming = this.upcoming();
    if (this.prep && upcoming && this.prep.trackId === upcoming.id) return;
    this.prep?.abort.abort();
    this.prep = null;
    // Re-arms on the next timeupdate under the same rule.
  }

  private upcoming(): Track | null {
    const { queue, currentIndex, repeat } = this.state;
    const i = nextIndex(queue, currentIndex, repeat === 'one' ? 'off' : repeat);
    return i === null ? null : queue[i] ?? null;
  }

  /** Exposed for tests and the probe; normally driven by timeupdate. */
  prepareNext() {
    const track = this.upcoming();
    if (!track || track.id === this.state.currentTrack?.id) return;
    if (this.prep?.trackId === track.id) return;
    this.prep?.abort.abort();
    const ac = new AbortController();
    const prep: Prep = { trackId: track.id, abort: ac, url: null };
    this.prep = prep;
    if (this.memory.has(track.id)) return; // already in memory
    void this.runPrep(track, prep).catch(() => { /* preparation is best effort */ });
  }

  private async runPrep(track: Track, prep: Prep) {
    const { signal } = prep.abort;
    let url: ResolvedUrl | null = null;
    const known = this.urls.get(track.id);
    if (known && this.env.now() < known.expiresAt - STREAM_URL_FRESH_MARGIN_MS) url = known;
    if (!url) {
      const pre = freshStreamUrl(track, this.env.now());
      if (pre && typeof track.stream_url_expires_at === 'number') url = { url: pre, expiresAt: track.stream_url_expires_at };
    }
    if (!url) url = await this.env.resolveUrl(track.id, signal);
    if (signal.aborted || !url) return;
    this.urls.set(track.id, url);
    prep.url = url;
    if (!this.env.fetchBlobUrl) return;
    const blobUrl = await this.env.fetchBlobUrl(url.url, signal);
    if (!blobUrl) return;
    if (signal.aborted) {
      this.env.revokeBlobUrl?.(blobUrl);
      return;
    }
    this.memory.set(track.id, blobUrl);
    this.evictMemory();
  }

  private touchMemory(id: string) {
    const url = this.memory.get(id);
    if (!url) return;
    this.memory.delete(id);
    this.memory.set(id, url);
  }

  private dropMemory(id: string) {
    const url = this.memory.get(id);
    if (!url) return;
    this.memory.delete(id);
    if (this.media.src !== url) this.env.revokeBlobUrl?.(url);
  }

  private evictMemory() {
    while (this.memory.size > MEMORY_TRACKS) {
      const victim = [...this.memory.entries()].find(([, u]) => u !== this.media.src);
      if (!victim) return;
      this.memory.delete(victim[0]);
      this.env.revokeBlobUrl?.(victim[1]);
    }
  }

  // ---------------------------------------------------------------------------------------
  // Listening history
  // ---------------------------------------------------------------------------------------

  private finishListen() {
    const track = this.state.currentTrack;
    if (track && this.listenStartedAt !== null) {
      this.emit({ type: 'listen', track, startedAt: this.listenStartedAt, duration: this.state.duration });
    }
    this.listenStartedAt = null;
  }

  // ---------------------------------------------------------------------------------------
  // Surviving a forced reload (a deploy makes Next.js hard-navigate; Hobby has no skew protection)
  // ---------------------------------------------------------------------------------------

  /** Called on pagehide / hidden, and on every state change worth keeping. */
  save(force = false) {
    const s = this.env.storage;
    if (!s) return;
    const now = this.env.now();
    if (!force && now - this.lastSaveAt < SAVE_EVERY_MS) return;
    this.lastSaveAt = now;
    const { queue, currentIndex, currentTrack, shuffle, repeat, volume, isPlaying } = this.state;
    if (!currentTrack) return;
    const data: Saved = {
      v: 1,
      owner: this.owner,
      queue: queue.slice(0, MAX_SAVED_QUEUE),
      originalQueue: this.originalQueue.slice(0, MAX_SAVED_QUEUE),
      index: currentIndex,
      time: Number.isFinite(this.media.currentTime) && this.media.src ? this.media.currentTime : this.state.currentTime,
      playing: isPlaying,
      shuffle,
      repeat,
      volume,
      savedAt: now,
    };
    try { s.write(JSON.stringify(data)); } catch { /* quota or blocked storage */ }
  }

  /** Who is signed in. Stamped on the saved session so it never restores for someone else. */
  setOwner(id: string | null) {
    this.owner = id;
  }

  /**
   * Restore this tab's last session once, after auth has resolved.
   * Only the account that saved it gets it back: a hard sign-out keeps sessionStorage, and the
   * next person at a shared device must not inherit the last one's queue. A session saved moments ago while
   * playing is the same listen interrupted by a reload, so it resumes where it was. Older or
   * paused sessions come back paused at their position. Entitlement is re-checked as always:
   * a stale url goes back through the server before a byte is fetched.
   */
  restore(owner: string | null) {
    if (this.restored) return;
    this.restored = true;
    this.owner = owner;
    const s = this.env.storage;
    if (!s || this.state.currentTrack) return;
    let data: Saved | null = null;
    try { data = JSON.parse(s.read() || 'null'); } catch { data = null; }
    if (!data || data.v !== 1 || !Array.isArray(data.queue)) return;
    if ((data.owner ?? null) !== owner) {
      s.clear();
      return;
    }
    const age = this.env.now() - data.savedAt;
    if (!(age >= 0 && age < RESTORE_MAX_AGE_MS)) return;
    const track = data.queue[data.index];
    if (!track || !isPlayable(track)) return;
    this.originalQueue = Array.isArray(data.originalQueue) ? data.originalQueue : data.queue;
    this.setVolume(typeof data.volume === 'number' ? data.volume : INITIAL.volume);
    this.set({ queue: data.queue, shuffle: !!data.shuffle, repeat: data.repeat ?? 'off' });
    const resume = !!data.playing && age < RESUME_WINDOW_MS;
    this.load(data.index, { autoplay: resume, reason: 'restore', startTime: Math.max(0, data.time || 0) });
  }

  /** The tab came back to the foreground: read the truth off the element. */
  syncFromMedia() {
    const m = this.media;
    if (!this.state.currentTrack) return;
    const playing = !m.paused || this.pendingStart;
    this.set({ isPlaying: playing, currentTime: m.src ? m.currentTime : this.state.currentTime });
    this.syncSessionState();
  }

  // ---------------------------------------------------------------------------------------
  // Media Session: lock screen / headset / OS controls. An enhancement, never the mechanism.
  // ---------------------------------------------------------------------------------------

  private bindMediaSession() {
    const ms = this.env.mediaSession;
    if (!ms) return;
    const set = (a: string, h: ((d: { seekTime?: number; seekOffset?: number }) => void) | null) => {
      try { ms.setActionHandler(a, h); } catch { /* action unsupported on this platform */ }
    };
    set('play', () => this.resume());
    set('pause', () => this.pause());
    set('nexttrack', () => this.next());
    set('previoustrack', () => this.previous());
    set('seekto', (d) => { if (typeof d.seekTime === 'number') this.seek(d.seekTime); });
    // No seekbackward/seekforward on purpose: iOS then shows +/-10s buttons on the lock screen
    // INSTEAD of previous/next track, and for a music queue the track buttons are the controls.
    set('stop', () => this.pause());
  }

  private syncSessionMetadata() {
    const ms = this.env.mediaSession;
    const t = this.state.currentTrack;
    if (!ms || !t || !this.env.makeMetadata) return;
    try {
      ms.metadata = this.env.makeMetadata({
        title: t.title,
        artist: t.artist_name || t.artist?.profile?.display_name || '',
        album: '',
        artwork: t.album_art_url ? [{ src: t.album_art_url }] : undefined,
      });
    } catch { /* ignore */ }
  }

  private syncSessionState() {
    const ms = this.env.mediaSession;
    if (!ms) return;
    try { ms.playbackState = this.state.currentTrack ? (this.state.isPlaying ? 'playing' : 'paused') : 'none'; } catch { /* ignore */ }
  }

  private syncSessionPosition() {
    const ms = this.env.mediaSession;
    if (!ms?.setPositionState) return;
    const d = this.media.duration;
    const p = this.media.currentTime;
    if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(p)) return;
    try { ms.setPositionState({ duration: d, position: Math.min(p, d), playbackRate: 1 }); } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------------------------------
  // Latency trace: request -> src -> play() -> playing -> audible, per load
  // ---------------------------------------------------------------------------------------

  private beginTrace(gen: number, reason: PlaybackTrace['reason'], track: Track, t0: number) {
    const trace: PlaybackTrace = { gen, reason, trackId: track.id, title: track.title, marks: {} };
    this.activeTrace = { trace, t0 };
    this.traces.push(trace);
    if (this.traces.length > TRACE_KEEP) this.traces.shift();
    const lag = this.env.perfNow() - t0;
    if (lag > 0.05) trace.marks.request = +lag.toFixed(1);
  }

  private mark(gen: number, name: string) {
    const a = this.activeTrace;
    if (!a || a.trace.gen !== gen || a.trace.marks[name] !== undefined) return;
    a.trace.marks[name] = +(this.env.perfNow() - a.t0).toFixed(1);
    if (name === 'audible' || name === 'failed') this.env.log?.(`[player] ${a.trace.reason} -> ${name}`, a.trace);
  }
}
