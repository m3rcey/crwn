// Recovery for stale-deploy chunk errors — the root cause of an installed PWA
// (added to the iOS home screen) showing "Something went wrong" after a deploy.
//
// After we deploy, Next.js emits new content-hashed JS chunks and removes old ones.
// A long-lived home-screen PWA can still be holding HTML that references the OLD
// chunk names; loading one 404s and throws a ChunkLoadError. The fix is simply to
// hard-reload once so the browser fetches the fresh HTML + chunks. A fresh browser
// tab never hits this because it loads fresh HTML from the start.

export function isChunkLoadError(err: unknown): boolean {
  const s =
    err instanceof Error ? `${err.name} ${err.message}` : String((err as { message?: string })?.message ?? err ?? '');
  return (
    /ChunkLoadError/i.test(s) ||
    /Loading chunk [\w-]+ failed/i.test(s) ||
    /Failed to fetch dynamically imported module/i.test(s) ||
    /error loading dynamically imported module/i.test(s) ||
    /Importing a module script failed/i.test(s) // Safari wording
  );
}

// Reload at most once per short window so we never get stuck in a reload loop
// (e.g. if something other than a stale chunk is genuinely broken).
export function reloadOnceForChunkError(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const KEY = 'crwn_chunk_reload_at';
    const last = Number(window.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 10000) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // sessionStorage can be unavailable (private mode / blocked); fall through and
    // reload anyway — a single reload without the guard is still better than a
    // permanently broken screen.
  }
  window.location.reload();
  return true;
}
