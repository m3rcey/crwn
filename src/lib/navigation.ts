// Smart back navigation. A page-level back arrow should return to the ACTUAL
// previous in-app page (so Rise Mode -> Offers -> Back lands on Rise Mode, not a
// hardcoded /studio). When there is no in-app history — the page was deep-linked,
// opened in a fresh tab, or is the first entry — fall back to a sensible route so
// the user is never dumped off the app.
//
// Uses the browser history length as the "did we navigate here in-app?" signal:
// length > 1 means there's somewhere to go back to. Router (not window.location)
// preserves the persistent audio player.

type MinimalRouter = { back: () => void; push: (href: string) => void };

export function smartBack(router: MinimalRouter, fallback: string): void {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
  } else {
    router.push(fallback);
  }
}
