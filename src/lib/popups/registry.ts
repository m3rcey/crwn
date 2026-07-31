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
  /** profiles.created_at, ISO. Null only if the read failed. */
  accountCreatedAt: string | null;
  /**
   * Dark-launch flags from admin_settings, keyed by flag name. An ANNOUNCEMENT
   * pop-up for a feature that ships dark MUST gate on its flag here, or flipping
   * popup_engine alone announces a feature the user cannot reach.
   */
  featureFlags: Record<string, boolean>;
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
  /**
   * ANNOUNCEMENTS ONLY: when the change being announced went live (ISO date).
   * A user whose account was created on/after this date experiences the change
   * as the normal product, so "we changed X" is noise to them: the engine skips
   * the pop-up for them centrally. Leave unset for evergreen pop-ups.
   */
  announcedAt?: string;
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
    cta: { label: 'Connect payouts', href: '/account/payouts' },
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

  // ---- Announcement: Live Tips + Tip Goals (artists only) ----
  // Gated on featureFlags.live_tips: before that flag is on there is no tip bar
  // and no Goals button, so announcing it would send artists looking for nothing.
  {
    key: 'announce_live_tips',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.featureFlags.live_tips === true,
    frequency: { type: 'once' },
    priority: 55,
    announcedAt: '2026-07-24',
    goal: 'Artist sets a tip goal on their next live session so the show earns instead of just entertaining.',
    title: 'Your last live show earned you nothing.',
    body: 'Fans who show up live are the ones most willing to pay, and until now there was no way for them to. Tips and tip goals are on: set a goal, and the room can see it fill in real time.',
    cta: { label: 'Set up my next live', href: '/studio/live' },
    dismissLabel: 'Later',
  },

  // ---- Announcement: Royalty Readiness Check (new surface, artists only) ----
  // Gated on featureFlags.royalty_readiness so this cannot fire while the feature
  // is still dark. Announce-once: a feature launch is news exactly one time.
  {
    key: 'announce_royalty_readiness',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.featureFlags.royalty_readiness === true,
    frequency: { type: 'once' },
    priority: 55,
    announcedAt: '2026-07-27',
    goal: 'Artist runs the Royalty Readiness Check and finds the streams nobody is collecting.',
    title: 'Your distributor is not collecting most of what your songs earn.',
    body: 'Performance royalties, mechanicals, digital radio, and everything outside the US are all paid by different organizations, and none of them pay you unless you are registered. Twelve questions will show you which ones currently have nobody assigned to them.',
    cta: { label: 'Check what I am missing', href: '/royalty-readiness' },
    dismissLabel: 'Later',
  },

  // ---- Announcement: Executive Producer Sessions (artists only) ----
  // Gated on featureFlags.producer_sessions: before that flag is on there is no
  // "let fans submit" toggle on the live form, so announcing it would send artists
  // looking for a control that isn't there. Loss-framed per the copy rule.
  {
    key: 'announce_producer_sessions',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.featureFlags.producer_sessions === true,
    frequency: { type: 'once' },
    priority: 55,
    announcedAt: '2026-07-24',
    goal: 'Artist opens their next live session for fan submissions so the room pays to be in the process, not just to watch it.',
    title: 'You give your process away for free in vlogs.',
    body: 'The thing your fans crave most, being in the room while the music gets made, earns you nothing right now. Open your next live session for submissions: fans send beats, vocals, and ideas beforehand, you review and play the best on stream, and you keep full creative control.',
    cta: { label: 'Open my next session', href: '/studio/live' },
    dismissLabel: 'Later',
  },

  // ---- Announcement: the dashboard tabs became real screens (artists only) ----
  // Not feature-flagged: this shipped to everyone at once, and an artist who
  // opens the app to a rearranged menu without being told has to go hunting for
  // their own payouts. No audience gate beyond isArtist, because every existing
  // artist learned the old 16-tab strip and every one of them is affected.
  {
    key: 'announce_hub_navigation',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist,
    frequency: { type: 'once' },
    priority: 60,
    announcedAt: '2026-07-26',
    goal: 'Artist opens the menu once and finds payouts, tiers, and billing where they now live.',
    title: 'Half your dashboard was hiding off the side of the screen.',
    body: 'Sixteen tabs in one scrolling row meant payouts, tiers, billing and referrals sat past the edge of your phone, and several links to them were landing on the wrong screen entirely. They are all full screens now: tap the menu (top left) for your money and your account, tap Studio for your tools.',
    cta: { label: 'Show me the menu', href: '/account/payouts?from=hub' },
    dismissLabel: 'Got it',
  },

  // ---- Announcement: live support chat + guide search on /support ----
  // Not feature-flagged: the /support page ships to everyone at once, and the chat
  // itself degrades to the contact form until its migration runs. Everyone sees it,
  // because fans get stuck too. Loss-framed per the copy rule.
  {
    key: 'announce_support_chat',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist', '/library'],
    audience: () => true,
    frequency: { type: 'once' },
    priority: 45,
    announcedAt: '2026-07-31',
    goal: 'User learns help now lives one tap away, so a stuck moment becomes a chat instead of a silent churn.',
    title: 'Getting stuck used to cost you two days.',
    body: 'Every question you sat on was momentum lost: a page not published, a payout not checked, a fan not converted. The Support page now answers instantly. Search every guide, chat and get an answer in seconds, and if the answer needs a human, a real person from CRWN steps into the same chat. Spot a bug anywhere? The flag in the corner reports it from the exact screen it happened on.',
    cta: { label: 'Open Support', href: '/support' },
    dismissLabel: 'Got it',
  },

  // ---- Notice: Terms updated 2026-07-24 (live-ticket refund clause) ----
  // Not marketing, so not loss-framed: Terms §1 promises notice of material changes,
  // and this banner is that notice. Buyer-favorable change (a seat is refundable when
  // the artist cancels or reschedules). Lowest priority: a legal notice must never
  // outcompete a money pop-up, and once ever is exactly what "notice" means.
  {
    key: 'notice_terms_2026_07_24',
    kind: 'banner',
    pages: ['/home', '/explore', '/library', '/studio', '/profile/artist'],
    audience: () => true,
    frequency: { type: 'once' },
    priority: 10,
    // Accounts created after the update accepted the CURRENT Terms at signup,
    // so the change notice is only owed to accounts that predate it.
    announcedAt: '2026-07-24',
    goal: 'Satisfy the Terms own notice promise for the live-ticket refund clause.',
    title: 'Our Terms were updated on July 24, 2026.',
    body: 'One addition: a live session or producer session seat is final once the session happens, and fully refundable if the artist cancels or reschedules to a time you cannot make.',
    cta: { label: 'Read the Terms', href: '/terms' },
    dismissLabel: 'Got it',
  },
];

/** Does this pop-up's page list arm it for the given pathname? */
export function popupArmedForPage(def: PopupDef, pathname: string): boolean {
  return def.pages.some((p) => p === '*' || pathname.startsWith(p));
}

export function getPopup(key: string): PopupDef | undefined {
  return POPUPS.find((p) => p.key === key);
}
