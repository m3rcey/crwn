/**
 * The browser half of the playback engine: the real <audio>, the server url gate, the
 * in-memory prefetch, Media Session, page lifecycle, and the ONE engine per tab.
 *
 * `getPlayerEngine()` creates the engine the first time anything asks for it and returns the
 * same instance forever after. It is module state, not React state, so a route change, a
 * layout re-render, or even the root layout being swapped out by an error boundary cannot
 * create a second element or pause the first.
 */

import { PlaybackEngine, type EngineEnv, type MediaLike } from './engine';

/** Files above this are streamed as before instead of held in memory (a lossless master). */
export const MAX_MEMORY_BYTES = 32 * 1024 * 1024;
const STORAGE_KEY = 'crwn_player_session_v1';

const EXT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
  flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', webm: 'audio/webm', aiff: 'audio/aiff', aif: 'audio/aiff',
};

/** The audio MIME for a stored file, from its extension. Old uploads were stored as text/plain. */
export function audioTypeFor(url: string, served: string | null): string {
  if (served && served.startsWith('audio/')) return served;
  let ext = '';
  try { ext = new URL(url).pathname.split('.').pop()?.toLowerCase() || ''; } catch { /* ignore */ }
  return EXT_TYPES[ext] || 'audio/mpeg';
}

async function resolveUrl(trackId: string, signal: AbortSignal) {
  const res = await fetch(`/api/tracks/${encodeURIComponent(trackId)}/stream`, { cache: 'no-store', signal });
  if (!res.ok) return null;
  const body = (await res.json()) as { url?: string; expiresIn?: number };
  if (!body.url) return null;
  return { url: body.url, expiresAt: Date.now() + (body.expiresIn ?? 3600) * 1000 };
}

/**
 * Fetch a whole (already authorized) file into memory. Storage answers with
 * Access-Control-Allow-Origin: *, and no credentials are sent. The blob: url this returns is
 * local to this document: nothing about it is shareable or outlives the tab.
 */
async function fetchBlobUrl(url: string, signal: AbortSignal): Promise<string | null> {
  const res = await fetch(url, { signal, credentials: 'omit' });
  if (!res.ok) return null;
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_MEMORY_BYTES) {
    try { await res.body?.cancel(); } catch { /* ignore */ }
    return null;
  }
  const raw = await res.blob();
  if (!raw.size || raw.size > MAX_MEMORY_BYTES) return null;
  const type = audioTypeFor(url, res.headers.get('content-type'));
  const blob = raw.type === type ? raw : new Blob([raw], { type });
  return URL.createObjectURL(blob);
}

function sessionStore(): EngineEnv['storage'] {
  try {
    const s = window.sessionStorage;
    const probe = '__crwn_probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return {
      read: () => { try { return s.getItem(STORAGE_KEY); } catch { return null; } },
      write: (v) => { try { s.setItem(STORAGE_KEY, v); } catch { /* quota */ } },
      clear: () => { try { s.removeItem(STORAGE_KEY); } catch { /* ignore */ } },
    };
  } catch {
    return null; // blocked storage: the player still works, it just cannot survive a reload
  }
}

function debugEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  try { return window.localStorage.getItem('crwn_player_debug') === '1'; } catch { return false; }
}

/**
 * Instrumentation only. Reports the first animation frame on which the media clock has moved,
 * which is the closest in-page proxy for "sound is coming out". Hidden tabs get no frames, so
 * there it falls back to the next timeupdate. Playback never waits on this.
 */
function watchAdvance(media: MediaLike, from: number, done: () => void) {
  let frames = 0;
  const check = () => media.currentTime > from + 0.02;
  if (typeof document === 'undefined' || document.visibilityState !== 'visible' || typeof requestAnimationFrame !== 'function') {
    const el = media as unknown as HTMLMediaElement;
    const on = () => { if (check()) { el.removeEventListener('timeupdate', on); done(); } };
    el.addEventListener('timeupdate', on);
    return;
  }
  const tick = () => {
    if (check()) { done(); return; }
    if (++frames < 600) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function browserEnv(): EngineEnv {
  const ms = typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null;
  const debug = debugEnabled();
  return {
    createMedia: () => {
      const el = new Audio();
      el.setAttribute('playsinline', '');
      return el as unknown as MediaLike;
    },
    resolveUrl,
    fetchBlobUrl,
    revokeBlobUrl: (u) => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } },
    now: () => Date.now(),
    perfNow: () => performance.now(),
    storage: sessionStore(),
    mediaSession: ms as unknown as EngineEnv['mediaSession'],
    makeMetadata: typeof MediaMetadata === 'function' ? (init) => new MediaMetadata(init) : undefined,
    watchAdvance,
    log: debug ? (line, data) => console.info(line, data) : undefined,
  };
}

declare global {
  interface Window {
    __crwnPlayerEngine?: PlaybackEngine;
  }
}

/** The one engine for this tab. Client only. */
export function getPlayerEngine(): PlaybackEngine {
  // Kept on window as well as in module scope so a hot-reloaded module (dev) or a duplicated
  // chunk can never create a second <audio> playing over the first.
  if (window.__crwnPlayerEngine) return window.__crwnPlayerEngine;
  const engine = new PlaybackEngine(browserEnv());
  window.__crwnPlayerEngine = engine;

  // Keep the saved session current at the moments a page can disappear, and re-read the
  // element when the tab returns so the UI shows what kept playing while it was away.
  const persist = () => engine.save(true);
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
    else engine.syncFromMedia();
  });
  window.addEventListener('pageshow', () => engine.syncFromMedia());
  return engine;
}
