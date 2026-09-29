// Which artist setup wizard screen is done, derived from live facts.
//
// ONE definition, shared by the wizard (src/app/setup/page.tsx, where it decides the resume
// screen) and the server (the founder follow-up resolver, which has to name the SAME screen the
// artist will land on when they reopen /setup). Before this it lived as a private switch inside
// the page, so a server reader could only copy it, and a copy is how two surfaces start
// disagreeing about where an artist is stuck.
//
// Pure. No client, no fetch. The caller supplies the facts from wherever it reads them
// (useArtistSetup in the browser, the service role on the server).

export const SETUP_SCREEN_ORDER = [
  'artist-name',
  'artist-link',
  'photo',
  'content-plan',
  'track-audio',
  'track-title',
  'ladder',
  'promises',
  'stripe',
  'product-type',
  'product-title',
  'product-price',
] as const;

export type SetupScreenKey = (typeof SETUP_SCREEN_ORDER)[number];

export interface SetupFacts {
  artistId: string | null;
  hasAvatar: boolean;
  hasMusic: boolean;
  /** Any ACTIVE tier, the free Bronze rung included. */
  hasTier: boolean;
  /** Stripe confirmed charges (the stripe_connected activation milestone). */
  stripeConnected: boolean;
  hasProduct: boolean;
}

export function setupScreenDone(key: string, f: SetupFacts): boolean {
  switch (key) {
    case 'artist-name':
    case 'artist-link':
      // Identity is saved the moment the artist page exists (an artist who
      // onboarded through the old /welcome page resumes past these screens).
      return !!f.artistId;
    case 'photo':
      return f.hasAvatar;
    case 'ladder':
    case 'promises':
      return f.hasTier;
    case 'stripe':
      return f.stripeConnected;
    case 'content-plan':
    case 'track-audio':
    case 'track-title':
      return f.hasMusic;
    default:
      return f.hasProduct;
  }
}

/** The screen /setup resumes on, or null when every screen is done (the launch review). */
export function firstIncompleteSetupScreen(f: SetupFacts): SetupScreenKey | null {
  return SETUP_SCREEN_ORDER.find((k) => !setupScreenDone(k, f)) ?? null;
}

/** The wizard's four chips, in screen order. What an artist would call the part they are on. */
export type SetupGroup = 'profile' | 'music' | 'monetize' | 'shop';

export function setupGroupFor(key: SetupScreenKey): SetupGroup {
  if (key === 'artist-name' || key === 'artist-link' || key === 'photo') return 'profile';
  if (key === 'content-plan' || key === 'track-audio' || key === 'track-title') return 'music';
  if (key === 'ladder' || key === 'promises' || key === 'stripe') return 'monetize';
  return 'shop';
}
