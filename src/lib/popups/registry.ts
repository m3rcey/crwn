// Pop-up catalog — the single source of truth for every governed interruption.
//
// A pop-up exists to move ONE user ONE step further down the journey, or to grow
// the platform. It is NOT a broadcast channel. The engine (./index.ts) enforces a
// hard governor on top of everything here: at most ONE pop-up per user per day,
// plus each pop-up's own frequency cap. When in doubt, add nothing — an empty
// screen beats an annoyed user who mutes the whole surface.
//
// Copy rule (CLAUDE.md): lead with the LOSS, never the gain. Name the money not
// earned / the fans not converted first, then the fix. No em dashes anywhere.

export type PopupKind = 'modal' | 'banner' | 'survey';

export interface PopupContext {
  userId: string;
  role: 'fan' | 'artist' | 'admin';
  isArtist: boolean;
  platformTier: string | null; // 'starter' | 'pro' | 'label' | null
  stripeConnected: boolean;
  /** Artists: their active subscriber count. Fans: their active subscription count. */
  supportCount: number;
  /** Artists only: have they ever sent a broadcast/DM to a fan? */
  hasSentBroadcast: boolean;
}

export interface PopupCta {
  label: string;
  href: string;
}

export interface PopupSurveyConfig {
  question: string;
  lowLabel?: string;
  highLabel?: string;
  feedbackPrompt?: string;
}

export type PopupFrequency =
  | { type: 'once' }
  | { type: 'max'; max: number }
  | { type: 'everyN'; days: number; max?: number };

export interface PopupDef {
  key: string;
  kind: PopupKind;
  /**
   * Path prefixes that arm this pop-up. '*' matches any (main) page. Otherwise a
   * pop-up fires when the current pathname startsWith any listed prefix.
   */
  pages: string[];
  /** Return true if this user qualifies right now. Keep predicates cheap. */
  audience: (ctx: PopupContext) => boolean;
  frequency: PopupFrequency;
  /** Higher wins when several are eligible on the same page. */
  priority: number;
  /** Internal only: what forward motion this pop-up is trying to cause. */
  goal: string;
  title: string;
  body: string;
  cta?: PopupCta;
  dismissLabel?: string;
  survey?: PopupSurveyConfig;
}

export const POPUPS: PopupDef[] = [
  // ---- Artist: get paid (highest stakes, blocks money flow) ----
  {
    key: 'artist_connect_stripe',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist && !c.stripeConnected,
    frequency: { type: 'everyN', days: 3, max: 4 },
    priority: 100,
    goal: 'Artist connects Stripe so fans can actually pay them.',
    title: 'Fans want to pay you. Right now they cannot.',
    body: 'Until your payouts are connected, every subscribe and every sale hits a dead end. The fan gives up, and that money never reaches you. Connecting takes about two minutes.',
    cta: { label: 'Connect payouts', href: '/profile/artist?tab=payouts' },
    dismissLabel: 'Later',
  },

  // ---- Artist: first broadcast (activation, protects retention) ----
  {
    key: 'artist_first_broadcast',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.stripeConnected && c.supportCount > 0 && !c.hasSentBroadcast,
    frequency: { type: 'everyN', days: 5, max: 3 },
    priority: 80,
    goal: 'Artist sends their first broadcast so new supporters do not drift.',
    title: 'Your supporters are already drifting.',
    body: 'People backed you and have not heard a word since. Silence is why they forget to renew. One short message keeps the ones you already earned.',
    cta: { label: 'Message your supporters', href: '/messages' },
    dismissLabel: 'Not yet',
  },

  // ---- Artist: upgrade to Pro (platform growth + lower fee for them) ----
  {
    key: 'artist_upgrade_pro',
    kind: 'banner',
    pages: ['/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.platformTier === 'starter' && c.supportCount >= 3,
    frequency: { type: 'everyN', days: 7, max: 4 },
    priority: 50,
    goal: 'Convert an activated free artist to Pro (8% fee, multi-tier ladder).',
    title: 'You are giving away 12% of every sale.',
    body: 'On the free plan CRWN keeps 12 percent. Pro drops that to 8 and unlocks the paid membership ladder. At your volume the lower fee starts paying for itself.',
    cta: { label: 'See Pro', href: '/pricing' },
    dismissLabel: 'Dismiss',
  },

  // ---- Fan: back an artist (activation, starts money flow) ----
  {
    key: 'fan_first_support',
    kind: 'modal',
    pages: ['/home', '/explore', '/library'],
    audience: (c) => c.role === 'fan' && c.supportCount === 0,
    frequency: { type: 'everyN', days: 5, max: 3 },
    priority: 60,
    goal: 'Fan converts a passive follow into a paid subscription.',
    title: 'A follow pays your favorite artist nothing.',
    body: 'The artists you listen to make almost nothing from streams and follows. Backing one directly is what actually keeps them making music, and it puts you on the inside.',
    cta: { label: 'Find an artist to back', href: '/explore' },
    dismissLabel: 'Maybe later',
  },

  // ---- Pop-up survey: artist satisfaction (feeds the improvement loop) ----
  {
    key: 'survey_artist_experience',
    kind: 'survey',
    pages: ['/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.supportCount >= 1,
    frequency: { type: 'everyN', days: 45, max: 4 },
    priority: 20,
    goal: 'Capture artist sentiment + a low-score alert so we know what to fix.',
    title: 'How is CRWN working for you?',
    body: 'Thirty seconds. Your answer goes straight to the founder.',
    survey: {
      question: 'How well is CRWN helping you grow and get paid?',
      lowLabel: 'Not working',
      highLabel: 'Working great',
      feedbackPrompt: 'What is the one thing we should fix first?',
    },
    dismissLabel: 'Not now',
  },
];

/** Does this pop-up's page list arm it for the given pathname? */
export function popupArmedForPage(def: PopupDef, pathname: string): boolean {
  return def.pages.some((p) => p === '*' || pathname.startsWith(p));
}

export function getPopup(key: string): PopupDef | undefined {
  return POPUPS.find((p) => p.key === key);
}
