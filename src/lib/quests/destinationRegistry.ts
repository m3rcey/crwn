// Typed destination registry.
//
// Why this exists: Claude returns `recommendedRiseModeStep`. Without a registry, that is a
// model-controlled string that eventually becomes part of a URL. That is an open redirect
// with extra steps.
//
// So destinations are IDs, not routes. Claude picks an ID from an allowlist; CRWN maps the
// ID to a route. A hallucinated destination fails the allowlist check and we fall back.
//
// This complements src/components/quests/questRoutes.ts (which maps quest templates to CTAs
// for the Rise Mode UI). That file serves the logged-in dashboard. This one serves the
// acquisition engine, where the caller is untrusted.

export interface Destination {
  id: string;
  label: string;
  route: string;
  /** Must the artist be logged in with an artist_profiles row? */
  requiresArtist: boolean;
  /** Gated behind a dark-launched flag? If the flag is off, we use `fallbackRoute`. */
  requiresFlag?: 'quest_engine';
  /** Where to send them when the flag is off or a prerequisite fails. */
  fallbackRoute: string;
  /** Should the flow return here when done? (CLAUDE.md: Rise Mode flows honor ?returnTo) */
  returnTo?: string;
}

const RISE_MODE_ROUTE = '/profile/artist';

export const DESTINATIONS: Record<string, Destination> = {
  // The default landing spot for a claimed artist. Rise Mode is DARK-LAUNCHED, so this
  // deliberately falls back to the artist dashboard rather than auto-enabling the flag.
  // Brief §15: "Do not automatically enable the dark-launched Quest Engine."
  rise_mode: {
    id: 'rise_mode',
    label: 'Rise Mode',
    route: RISE_MODE_ROUTE,
    requiresArtist: true,
    requiresFlag: 'quest_engine',
    fallbackRoute: '/profile/artist',
  },
  setup: {
    id: 'setup',
    label: 'Finish setup',
    route: '/setup',
    requiresArtist: true,
    fallbackRoute: '/setup',
  },
  setup_monetize: {
    id: 'setup_monetize',
    label: 'Set up your first tier',
    route: '/setup',
    requiresArtist: true,
    fallbackRoute: '/setup',
  },
  proof_of_demand: {
    id: 'proof_of_demand',
    label: 'Run a demand test',
    route: '/proof-of-demand/new',
    requiresArtist: true,
    fallbackRoute: '/profile/artist',
    returnTo: RISE_MODE_ROUTE,
  },
  missions: {
    id: 'missions',
    label: 'Launch a fan mission',
    route: '/missions/new',
    requiresArtist: true,
    fallbackRoute: '/profile/artist',
    returnTo: RISE_MODE_ROUTE,
  },
  bounties: {
    id: 'bounties',
    label: 'Launch a clip campaign',
    route: '/bounties/new',
    requiresArtist: true,
    fallbackRoute: '/profile/artist',
    returnTo: RISE_MODE_ROUTE,
  },
  dashboard: {
    id: 'dashboard',
    label: 'Your dashboard',
    route: '/profile/artist',
    requiresArtist: true,
    fallbackRoute: '/home',
  },
};

export const DESTINATION_IDS = Object.keys(DESTINATIONS);

export function getDestination(id: string | null | undefined): Destination | null {
  if (!id) return null;
  return Object.prototype.hasOwnProperty.call(DESTINATIONS, id) ? DESTINATIONS[id] : null;
}

export interface ResolveDestinationInput {
  destinationId: string | null;
  isArtist: boolean;
  questEngineEnabled: boolean;
  /** Setup not finished? Setup wins over everything. An artist with no track has nothing to Rise with. */
  setupComplete: boolean;
}

/**
 * Turn a destination id into an actual, safe route.
 *
 * Ordering is deliberate and is a product decision, not just a safety one: an artist who
 * has not uploaded a track cannot meaningfully do a Rise Mode mission. Setup always wins.
 */
export function resolveDestination(input: ResolveDestinationInput): string {
  const dest = getDestination(input.destinationId) ?? DESTINATIONS.dashboard;

  if (dest.requiresArtist && !input.isArtist) return '/setup';

  // The hard gate in src/app/(main)/layout.tsx would bounce them here anyway. Sending them
  // straight to /setup avoids a pointless redirect bounce.
  if (!input.setupComplete) return '/setup';

  if (dest.requiresFlag === 'quest_engine' && !input.questEngineEnabled) {
    return dest.fallbackRoute;
  }

  if (dest.returnTo) {
    const sep = dest.route.includes('?') ? '&' : '?';
    return `${dest.route}${sep}returnTo=${encodeURIComponent(dest.returnTo)}`;
  }

  return dest.route;
}
