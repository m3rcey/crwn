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

// --- Returning to the account hub -------------------------------------------
//
// Screens opened from the hamburger (HubPage, carrying ?from=hub) put an X in the
// top left that goes back INTO the menu, the way the Lyft driver menu does. The
// navigation away is ordinary history, so the only thing to carry across it is
// the single bit "reopen the menu when you land".
//
// A sessionStorage flag rather than a ?hub=1 URL param on purpose: reading query
// params in Navigation would pull useSearchParams into the layout, which forces
// every statically rendered page under it into a Suspense boundary. The flag is
// written only by the X and consumed by the very next pathname change, so it can
// never leak into an unrelated navigation.

const HUB_RETURN_KEY = 'crwn:hub-return';

export function requestHubReopen(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(HUB_RETURN_KEY, '1');
  } catch {
    // Private-mode Safari can throw on sessionStorage. Losing the reopen is fine:
    // the artist lands on the previous page instead, which is where back goes.
  }
}

/** Reads and clears the flag. Returns true exactly once per requestHubReopen(). */
export function consumeHubReopen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(HUB_RETURN_KEY) !== '1') return false;
    sessionStorage.removeItem(HUB_RETURN_KEY);
    return true;
  } catch {
    return false;
  }
}
