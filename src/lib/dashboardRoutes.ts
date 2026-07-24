// The artist dashboard used to be one page with a 16-tab horizontal scroll strip
// at /profile/artist?tab=<id>. Every tab is now its own route, so each screen
// ships only its own chunk and the browser can prefetch it before you tap.
//
// This map is the single source of truth for that translation. It exists because
// there were 102 internal links to ?tab= across the codebase, plus links already
// out in emails and pop-ups, and rewriting them all in one pass would have
// guaranteed dead links. /profile/artist now reads this table and redirects, so
// every old link keeps working forever.
//
// It also fixes a real bug it inherited: the old page only honored SEVEN of the
// sixteen ?tab= values from the URL and silently fell through to Rise Mode for
// the rest. ?tab=payouts (15 links, including the account menu's own "Payouts and
// tax") landed an artist on Rise Mode instead of their money. Aliases that were
// linked but never existed as tabs (live, community, bookings, upgrade) are
// mapped here too, so they now go somewhere real.
//
// Rise Mode is the one screen that stays at /profile/artist. It is a bottom-nav
// destination, so it keeps the route the tab bar already points at.

export const RISE_ROUTE = '/profile/artist';

export const TAB_ROUTES: Record<string, string> = {
  // Manage the business. Reached from the hamburger account hub.
  profile: '/account/profile',
  payouts: '/account/payouts',
  billing: '/account/billing',
  upgrade: '/account/billing',
  tiers: '/account/tiers',
  referrals: '/account/referrals',

  // Do the work. Reached from Studio.
  tracks: '/studio/music',
  music: '/studio/music',
  albums: '/studio/albums',
  shop: '/studio/shop',
  livestreams: '/studio/live',
  live: '/studio/live',
  analytics: '/studio/analytics',
  'ai-manager': '/studio/manager',
  sync: '/studio/sync',
  team: '/studio/team',
  promise: '/studio/promise',
  audience: '/studio/fans',
  community: '/studio/fans',
  bookings: '/studio',

  // Stays put.
  rise: RISE_ROUTE,
};

/**
 * Resolve an old ?tab= value to its route, preserving any extra query string the
 * caller sent (Stripe's ?stripe=success, the plan upgrade's ?upgrade=success).
 * Returns null when the tab is already Rise Mode, meaning "do not redirect".
 */
export function resolveTabRoute(tab: string | null, extraQuery?: string): string | null {
  if (!tab) return null;
  const target = TAB_ROUTES[tab];
  if (!target || target === RISE_ROUTE) return null;
  return extraQuery ? `${target}?${extraQuery}` : target;
}
