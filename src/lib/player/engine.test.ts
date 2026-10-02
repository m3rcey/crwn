import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/types';
import { PlaybackEngine, RESUME_WINDOW_MS, type EngineEnv, type EngineEvent, type MediaLike, type ResolvedUrl } from './engine';

// ---------------------------------------------------------------------------------------------
// A media element whose events the test fires by hand, so every transition is deterministic.
// ---------------------------------------------------------------------------------------------
class FakeMedia implements MediaLike {
  private _src = '';
  currentTime = 0;
  duration = NaN;
  paused = true;
  ended = false;
  volume = 1;
  preload = '';
  bufferedEnd = 0;
  playCalls: string[] = [];
  /** What the next play() does. */
  playResult: 'ok' | 'NotAllowedError' = 'ok';
  private handlers = new Map<string, (() => void)[]>();
  get buffered() {
    const end = this.bufferedEnd;
    return { length: end > 0 ? 1 : 0, start: () => 0, end: () => end };
  }
  get src() { return this._src; }
  set src(v: string) {
    this._src = v;
    this.currentTime = 0;
    this.ended = false;
    this.duration = NaN;
    this.bufferedEnd = 0;
  }
  play() {
    this.playCalls.push(this._src);
    if (this.playResult !== 'ok') {
      const e = Object.assign(new Error('blocked'), { name: this.playResult });
      return Promise.reject(e);
    }
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.emit('pause');
  }
  load() {}
  removeAttribute(name: string) { if (name === 'src') this._src = ''; }
  addEventListener(type: string, fn: () => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  emit(type: string) { for (const fn of this.handlers.get(type) ?? []) fn(); }
  // --- test helpers ---
  /** The browser loaded metadata and audio started. */
  start(duration = 180) {
    this.duration = duration;
    this.emit('loadedmetadata');
    this.emit('playing');
  }
  /** Advance the clock; optionally mark the whole file as buffered. */
  tick(time: number, fullyBuffered = false) {
    this.currentTime = time;
    if (fullyBuffered) this.bufferedEnd = this.duration;
    this.emit('timeupdate');
  }
  /** Reach the end of the file, firing what a browser fires, in its order. */
  finish() {
    this.currentTime = this.duration;
    this.ended = true;
    this.paused = true;
    this.emit('pause');
    this.emit('ended');
  }
}

const HOUR = 3600_000;
let clock = 1_000_000;

function track(id: string, opts: { presigned?: boolean; locked?: boolean; duration?: number } = {}): Track {
  return {
    id,
    artist_id: 'artist',
    title: `Song ${id}`,
    audio_url_128: opts.locked ? null : `https://x.supabase.co/storage/v1/object/public/audio/${id}.mp3`,
    audio_url_320: null,
    stream_url: opts.presigned ? `https://signed/${id}?token=pre` : undefined,
    stream_url_expires_at: opts.presigned ? clock + HOUR : undefined,
    duration: opts.duration ?? 180,
    album_art_url: null,
  } as unknown as Track;
}

interface Harness {
  engine: PlaybackEngine;
  media: FakeMedia;
  env: EngineEnv;
  resolves: { id: string; resolve: (v: ResolvedUrl | null) => void; signal: AbortSignal }[];
  blobs: { url: string; resolve: (v: string | null) => void; signal: AbortSignal }[];
  events: EngineEvent[];
  store: { value: string | null };
  session: { handlers: Map<string, (d: { seekTime?: number }) => void>; metadata: unknown; playbackState: string };
  created: number;
}

function harness(opts: { store?: { value: string | null }; autoBlob?: boolean } = {}): Harness {
  const media = new FakeMedia();
  const resolves: Harness['resolves'] = [];
  const blobs: Harness['blobs'] = [];
  const store = opts.store ?? { value: null };
  const session = {
    handlers: new Map<string, (d: { seekTime?: number }) => void>(),
    metadata: null as unknown,
    playbackState: 'none',
    setActionHandler(a: string, h: ((d: { seekTime?: number }) => void) | null) { if (h) this.handlers.set(a, h); },
  };
  const h = { created: 0 } as Harness;
  const env: EngineEnv = {
    createMedia: () => { h.created++; return media; },
    resolveUrl: (id, signal) => new Promise((resolve) => resolves.push({ id, resolve, signal })),
    fetchBlobUrl: (url, signal) =>
      opts.autoBlob
        ? Promise.resolve(`blob:${url}`)
        : new Promise((resolve) => blobs.push({ url, resolve, signal })),
    revokeBlobUrl: vi.fn(),
    now: () => clock,
    perfNow: () => clock,
    storage: { read: () => store.value, write: (v) => { store.value = v; }, clear: () => { store.value = null; } },
    mediaSession: session as unknown as EngineEnv['mediaSession'],
    makeMetadata: (init) => ({ ...init }),
  };
  const engine = new PlaybackEngine(env);
  const events: EngineEvent[] = [];
  engine.onEvent((e) => events.push(e));
  return Object.assign(h, { engine, media, env, resolves, blobs, events, store, session });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { clock = 1_000_000; });

describe('tap -> play', () => {
  it('a pre-signed track starts in the same call: src set and play() called before any await', () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b', { presigned: true })];
    h.engine.play(list[0], list);
    expect(h.media.src).toBe('https://signed/a?token=pre');
    expect(h.media.playCalls).toHaveLength(1);
    expect(h.resolves).toHaveLength(0);
    expect(h.engine.getState()).toMatchObject({ currentIndex: 0, isPlaying: true, isBuffering: true });
  });

  it('without a pre-signed url it asks the server gate once, then plays', async () => {
    const h = harness();
    const list = [track('a'), track('b')];
    h.engine.play(list[0], list);
    expect(h.media.playCalls).toHaveLength(0);
    expect(h.resolves.map((r) => r.id)).toEqual(['a']);
    h.resolves[0].resolve({ url: 'https://signed/a?route', expiresAt: clock + HOUR });
    await flush();
    expect(h.media.src).toBe('https://signed/a?route');
    expect(h.media.playCalls).toEqual(['https://signed/a?route']);
  });

  it('a locked track is refused before anything is requested', () => {
    const h = harness();
    const locked = track('x', { locked: true });
    h.engine.play(locked, [locked]);
    expect(h.events).toEqual([{ type: 'locked', track: locked }]);
    expect(h.media.src).toBe('');
    expect(h.resolves).toHaveLength(0);
  });

  it('rapid taps: a stale url that resolves late never starts the older selection', async () => {
    const h = harness();
    const list = [track('a'), track('b'), track('c')];
    h.engine.play(list[0], list);
    h.engine.play(list[1], list);
    h.engine.play(list[2], list);
    expect(h.resolves[0].signal.aborted).toBe(true);
    expect(h.resolves[1].signal.aborted).toBe(true);
    // Newest first, then the stale ones arrive late.
    h.resolves[2].resolve({ url: 'https://signed/c', expiresAt: clock + HOUR });
    h.resolves[0].resolve({ url: 'https://signed/a', expiresAt: clock + HOUR });
    h.resolves[1].resolve({ url: 'https://signed/b', expiresAt: clock + HOUR });
    await flush();
    expect(h.media.src).toBe('https://signed/c');
    expect(h.media.playCalls).toEqual(['https://signed/c']);
    expect(h.engine.getState().currentTrack?.id).toBe('c');
  });

  it('tapping the current track resumes it without reloading the source', () => {
    const h = harness();
    const list = [track('a', { presigned: true })];
    h.engine.play(list[0], list);
    h.media.start();
    h.engine.pause();
    expect(h.engine.getState().isPlaying).toBe(false);
    h.engine.play(list[0], list);
    expect(h.media.src).toBe('https://signed/a?token=pre');
    expect(h.media.playCalls).toHaveLength(2);
    expect(h.engine.getState().isPlaying).toBe(true);
  });
});

describe('track end -> next track', () => {
  it('prepares the next track while this one plays, then starts it synchronously from memory at `ended`', async () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b', { presigned: true }), track('c')];
    h.engine.play(list[0], list);
    h.media.start(180);
    h.media.tick(10); // not buffered, plenty remaining: no preparation yet (bandwidth stays with the song)
    expect(h.blobs).toHaveLength(0);
    h.media.tick(12, true); // fully buffered: network idle, prepare now
    await flush();
    expect(h.blobs.map((b) => b.url)).toEqual(['https://signed/b?token=pre']);
    h.blobs[0].resolve('blob:b');
    await flush();

    const resolvesBefore = h.resolves.length;
    h.media.finish();
    // Inside the `ended` handler: new source and play() already issued, no network involved.
    expect(h.media.src).toBe('blob:b');
    expect(h.media.playCalls.at(-1)).toBe('blob:b');
    expect(h.resolves.length).toBe(resolvesBefore);
    expect(h.engine.getState()).toMatchObject({ currentIndex: 1, isPlaying: true });
    expect(h.engine.getTraces().at(-1)).toMatchObject({ reason: 'ended', source: 'memory', trackId: 'b' });
  });

  it('a streamed track that never reads as fully buffered prepares when the browser goes idle (`suspend`)', async () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b', { presigned: true })];
    h.engine.play(list[0], list);
    h.media.start(240);
    h.media.tick(5); // a window buffered, not the file
    expect(h.blobs).toHaveLength(0);
    h.media.emit('suspend');
    await flush();
    expect(h.blobs.map((b) => b.url)).toEqual(['https://signed/b?token=pre']);
  });

  it('prepares through the server gate when the next track has no pre-signed url', async () => {
    const h = harness({ autoBlob: true });
    const list = [track('a', { presigned: true }), track('b')];
    h.engine.play(list[0], list);
    h.media.start(30);
    h.media.tick(1, true); // a short file, fully buffered at once
    expect(h.resolves.map((r) => r.id)).toEqual(['b']);
    h.resolves[0].resolve({ url: 'https://signed/b?route', expiresAt: clock + HOUR });
    await flush();
    h.media.finish();
    expect(h.media.src).toBe('blob:https://signed/b?route');
  });

  it('falls back to the prepared url synchronously when the bytes are not in memory yet', async () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b')];
    h.engine.play(list[0], list);
    h.media.start(30);
    h.media.tick(1, true);
    h.resolves[0].resolve({ url: 'https://signed/b?route', expiresAt: clock + HOUR });
    await flush(); // url known, blob still downloading
    h.media.finish();
    expect(h.media.src).toBe('https://signed/b?route');
    expect(h.media.playCalls.at(-1)).toBe('https://signed/b?route');
    // The unfinished in-memory copy is cancelled so the stream gets the whole link.
    expect(h.blobs[0].signal.aborted).toBe(true);
  });

  it('does not start preparing while the current song is barely buffered (it would starve it)', async () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b', { presigned: true })];
    h.engine.play(list[0], list);
    h.media.start(50);
    h.media.bufferedEnd = 3; // 3s buffered of a 50s song, 50s remaining
    h.media.tick(0.5);
    expect(h.blobs).toHaveLength(0);
    h.media.bufferedEnd = 25; // 24.5s ahead, within 60s of the end: safe now
    h.media.tick(0.5);
    await flush();
    expect(h.blobs.map((b) => b.url)).toEqual(['https://signed/b?token=pre']);
  });

  it('prepares regardless in the last 20 seconds', async () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b', { presigned: true })];
    h.engine.play(list[0], list);
    h.media.start(200);
    h.media.tick(181); // nothing buffered ahead, 19s left
    await flush();
    expect(h.blobs.map((b) => b.url)).toEqual(['https://signed/b?token=pre']);
  });

  it('skips locked tracks when advancing, and stops cleanly at the end of the queue', () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('x', { locked: true }), track('c', { presigned: true })];
    h.engine.play(list[0], list);
    h.media.start();
    h.media.finish();
    expect(h.engine.getState().currentTrack?.id).toBe('c');
    h.media.start();
    h.media.finish();
    expect(h.engine.getState()).toMatchObject({ currentTrack: expect.objectContaining({ id: 'c' }), isPlaying: false, currentTime: 0 });
  });

  it('repeat-all wraps and repeat-one replays the same source', () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b', { presigned: true })];
    h.engine.play(list[1], list);
    h.engine.toggleRepeat(); // all
    h.media.start();
    h.media.finish();
    expect(h.engine.getState().currentTrack?.id).toBe('a');
    h.engine.toggleRepeat(); // one
    h.media.start();
    const calls = h.media.playCalls.length;
    h.media.finish();
    expect(h.engine.getState().currentTrack?.id).toBe('a');
    expect(h.media.playCalls.length).toBe(calls + 1);
  });

  it('the `pause` a browser fires right before `ended` does not stop the queue', () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b', { presigned: true })];
    h.engine.play(list[0], list);
    h.media.start();
    const seen: boolean[] = [];
    const sessionStates: string[] = [];
    h.engine.subscribe(() => { seen.push(h.engine.getState().isPlaying); sessionStates.push(h.session.playbackState); });
    h.media.finish();
    // Never a paused frame between songs: not in the UI, not on the lock screen.
    expect(seen).not.toContain(false);
    expect(sessionStates).not.toContain('paused');
    expect(h.engine.getState().isPlaying).toBe(true);
  });

  it('a queue change re-targets preparation: a track that is no longer next is aborted', async () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b'), track('c')];
    h.engine.play(list[0], list);
    h.media.start(30);
    h.media.tick(1, true);
    expect(h.resolves.map((r) => r.id)).toEqual(['b']);
    h.engine.playNext(track('z', { presigned: true }));
    expect(h.resolves[0].signal.aborted).toBe(true);
    h.media.tick(2, true);
    await flush();
    expect(h.blobs.map((b) => b.url)).toEqual(['https://signed/z?token=pre']);
  });
});

describe('shuffle', () => {
  it('shuffles around the playing track, then "next" is the next slot (known in advance)', () => {
    const h = harness();
    const list = ['a', 'b', 'c', 'd', 'e'].map((id) => track(id, { presigned: true }));
    h.engine.play(list[2], list);
    h.engine.toggleShuffle();
    const s = h.engine.getState();
    expect(s.queue[2].id).toBe('c');
    const expectedNext = s.queue[3].id;
    h.media.start();
    h.media.finish();
    expect(h.engine.getState().currentTrack?.id).toBe(expectedNext);
    h.engine.toggleShuffle();
    expect(h.engine.getState().queue.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(h.engine.getState().currentIndex).toBe(['a', 'b', 'c', 'd', 'e'].indexOf(expectedNext));
  });
});

describe('failures', () => {
  it('a failed pre-signed url retries once through the server at the same position', async () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b', { presigned: true })];
    h.engine.play(list[0], list);
    h.media.start();
    h.media.currentTime = 42;
    h.media.emit('error');
    expect(h.resolves.map((r) => r.id)).toEqual(['a']);
    h.resolves[0].resolve({ url: 'https://signed/a?fresh', expiresAt: clock + HOUR });
    await flush();
    expect(h.media.src).toBe('https://signed/a?fresh');
    expect(h.engine.getState().currentTrack?.id).toBe('a');
    expect(h.events.some((e) => e.type === 'failed')).toBe(false);
  });

  it('a track the listener tapped that cannot load stops with a message, player still usable', async () => {
    const h = harness();
    const list = [track('a'), track('b', { presigned: true })];
    h.engine.play(list[0], list);
    h.resolves[0].resolve(null); // 403 from the gate
    await flush();
    expect(h.events.at(-1)).toMatchObject({ type: 'failed', userInitiated: true });
    expect(h.engine.getState()).toMatchObject({ isPlaying: false, isBuffering: false });
    h.engine.next();
    expect(h.media.src).toBe('https://signed/b?token=pre');
  });

  it('an automatic advance onto a dead file skips ahead instead of stalling', async () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b'), track('c', { presigned: true })];
    h.engine.play(list[0], list);
    h.media.start(600);
    h.media.finish();
    expect(h.resolves.map((r) => r.id)).toEqual(['b']);
    h.resolves[0].resolve(null);
    await flush();
    expect(h.events.at(-1)).toMatchObject({ type: 'failed', userInitiated: false });
    expect(h.engine.getState().currentTrack?.id).toBe('c');
    expect(h.media.src).toBe('https://signed/c?token=pre');
  });

  it('errors from a replaced source are ignored', async () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b')];
    h.engine.play(list[0], list);
    h.engine.play(list[1], list); // resolving b, old element source still a
    h.media.emit('error');
    expect(h.resolves.map((r) => r.id)).toEqual(['b']);
    expect(h.events.filter((e) => e.type !== 'listen')).toEqual([]);
  });
});

describe('pause semantics', () => {
  it('a pause during a source swap is not a pause; a real one is', () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b', { presigned: true })];
    h.engine.play(list[0], list);
    h.media.start();
    h.engine.next(); // swaps src while playing
    h.media.emit('pause');
    expect(h.engine.getState().isPlaying).toBe(true);
    h.media.start();
    h.media.pause(); // e.g. headphones unplugged / OS interruption
    expect(h.engine.getState().isPlaying).toBe(false);
  });
});

describe('survives a forced reload (deploy skew)', () => {
  it('a session saved moments ago while playing resumes at its position', () => {
    const store = { value: null as string | null };
    const a = harness({ store });
    const list = [track('a', { presigned: true }), track('b', { presigned: true })];
    a.engine.play(list[1], list);
    a.media.start();
    a.media.tick(73.5);
    a.engine.save(true);

    clock += 2000; // the reload
    const b = harness({ store });
    b.engine.restore(null);
    expect(b.engine.getState()).toMatchObject({ currentIndex: 1, isPlaying: true });
    expect(b.media.src).toBe('https://signed/b?token=pre');
    expect(b.media.currentTime).toBe(73.5);
    expect(b.media.playCalls).toHaveLength(1);
  });

  it('when the browser blocks play() without a gesture it waits, paused, at the same spot', async () => {
    const store = { value: null as string | null };
    const a = harness({ store });
    const list = [track('a', { presigned: true })];
    a.engine.play(list[0], list);
    a.media.start();
    a.media.tick(30);
    a.engine.save(true);

    clock += 1000;
    const b = harness({ store });
    b.media.playResult = 'NotAllowedError';
    b.engine.restore(null);
    await flush();
    expect(b.engine.getState()).toMatchObject({ isPlaying: false, currentTime: 30 });
    expect(b.events.some((e) => e.type === 'blocked')).toBe(true);
    b.media.playResult = 'ok';
    b.engine.togglePlay();
    expect(b.media.playCalls).toHaveLength(2);
  });

  it('an older or paused session comes back paused, and resolves its url only on play', async () => {
    const store = { value: null as string | null };
    const a = harness({ store });
    const list = [track('a')];
    a.engine.play(list[0], list);
    a.resolves[0].resolve({ url: 'https://signed/a', expiresAt: clock + HOUR });
    await flush();
    a.media.start();
    a.media.tick(12);
    a.engine.save(true);

    clock += RESUME_WINDOW_MS + 1;
    const b = harness({ store });
    b.engine.restore(null);
    expect(b.engine.getState()).toMatchObject({ isPlaying: false, currentTrack: expect.objectContaining({ id: 'a' }) });
    expect(b.resolves).toHaveLength(0);
    b.engine.togglePlay();
    expect(b.resolves.map((r) => r.id)).toEqual(['a']);
  });

  it('a session saved by one account never restores for another, or after sign-out', () => {
    const store = { value: null as string | null };
    const a = harness({ store });
    a.engine.setOwner('user-a');
    const list = [track('a', { presigned: true })];
    a.engine.play(list[0], list);
    a.engine.save(true);
    clock += 1000;
    const anon = harness({ store });
    anon.engine.restore(null);
    expect(anon.engine.getState().currentTrack).toBeNull();
    expect(store.value).toBeNull(); // and it is gone, so nobody later gets it either

    a.engine.save(true);
    const b = harness({ store });
    b.engine.restore('user-b');
    expect(b.engine.getState().currentTrack).toBeNull();

    a.engine.save(true);
    const same = harness({ store });
    same.engine.restore('user-a');
    expect(same.engine.getState().currentTrack?.id).toBe('a');
  });

  it('reset (sign-out) forgets the queue and the saved session', () => {
    const store = { value: null as string | null };
    const a = harness({ store });
    const list = [track('a', { presigned: true })];
    a.engine.play(list[0], list);
    a.engine.save(true);
    a.engine.reset();
    expect(store.value).toBeNull();
    expect(a.engine.getState()).toMatchObject({ currentTrack: null, queue: [], isPlaying: false });
    expect(a.media.src).toBe('');
    const b = harness({ store });
    b.engine.restore(null);
    expect(b.engine.getState().currentTrack).toBeNull();
  });
});

describe('listening history', () => {
  it('reports a listen on automatic advance and on a new tap, never for a failed load', async () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b', { presigned: true }), track('c')];
    h.engine.play(list[0], list);
    h.media.start();
    clock += 180_000;
    h.media.finish();
    expect(h.events.filter((e) => e.type === 'listen').map((e) => (e as { track: Track }).track.id)).toEqual(['a']);
    h.engine.play(list[2], list); // tap c (needs the server)
    expect(h.events.filter((e) => e.type === 'listen').map((e) => (e as { track: Track }).track.id)).toEqual(['a', 'b']);
    h.resolves.at(-1)!.resolve(null);
    await flush();
    h.engine.play(list[0], list);
    expect(h.events.filter((e) => e.type === 'listen').map((e) => (e as { track: Track }).track.id)).toEqual(['a', 'b']);
  });
});

describe('one element, one owner', () => {
  it('creates exactly one media element for the life of the engine', () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b', { presigned: true })];
    h.engine.play(list[0], list);
    h.media.start();
    h.media.finish();
    h.engine.reset();
    h.engine.play(list[1], list);
    expect(h.created).toBe(1);
  });
});

describe('Media Session', () => {
  it('lock-screen actions drive the engine and metadata follows the track', () => {
    const h = harness();
    const list = [track('a', { presigned: true }), track('b', { presigned: true })];
    h.engine.play(list[0], list);
    expect(h.session.metadata).toMatchObject({ title: 'Song a' });
    h.session.handlers.get('nexttrack')!({});
    expect(h.engine.getState().currentTrack?.id).toBe('b');
    expect(h.session.metadata).toMatchObject({ title: 'Song b' });
    h.media.start();
    expect(h.session.playbackState).toBe('playing');
    h.session.handlers.get('pause')!({});
    expect(h.session.playbackState).toBe('paused');
    h.session.handlers.get('seekto')!({ seekTime: 33 });
    expect(h.media.currentTime).toBe(33);
    expect([...h.session.handlers.keys()]).toEqual(
      expect.arrayContaining(['play', 'pause', 'nexttrack', 'previoustrack', 'seekto']),
    );
    // iOS swaps the lock screen's track buttons for +/-10s when these exist.
    expect(h.session.handlers.has('seekbackward')).toBe(false);
    expect(h.session.handlers.has('seekforward')).toBe(false);
  });
});
