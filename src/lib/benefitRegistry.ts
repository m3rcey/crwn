// benefitRegistry.ts — the ONE map from a tier benefit to how CRWN delivers it.
//
// `tier_benefits.benefit_type` is the stable identity of a promise. Before this module
// existed, the catalog knew how to DISPLAY a benefit and nothing knew how to KEEP it: a tier
// could say "stems" in prose while member_files rows carried the real allow list, and no code
// connected the two. Two features (direct messaging, release credits) had each hand-rolled
// their own benefit-to-entitlement lookup. This registry is the third such lookup written
// once, for every benefit, so the tier picker, the Promise Calendar sync, the readiness
// resolvers, the fast actions and the future Offer Builder all read the SAME row.
//
// The rules this module encodes (founder decisions D1 to D5, 2026-09-03):
//  - SUPPORTED means CRWN has a live delivery mechanism for it today. A benefit is
//    `recommended` (the fan-economy model CRWN sells: access, influence, contribution,
//    status, experience), `additional` (real, enforced, but not a default recommendation),
//    `manual` (the artist delivers it themselves and CRWN never claims otherwise), or
//    `retired` (no longer offered to new tiers; existing rows still render).
//  - NO FIXED SCHEDULE unless the artist explicitly chooses one. `cadence: 'optional'` means
//    the picker OFFERS a schedule; selecting the benefit alone creates no obligation.
//    promisePlan.ts / tierObligations.ts read config.frequency and nothing else.
//  - Readiness is DERIVED on read from the delivery table and never stored. A readiness
//    answer may never widen access: the entitlement oracles are untouched.
//  - Fast actions are POINTERS. The destination matches `?tier=` against tiers it already
//    loaded for the signed-in artist; a foreign id opens nothing.
//  - Keys are frozen (appended, never renamed): production rows, fulfillment_obligations
//    and two enforcement gates key on them. See FROZEN_BENEFIT_KEYS in the architecture
//    registry.
//
// This is product knowledge, not artist data: it belongs in code, not in a table.

import type { PreviewKind } from '@/lib/offerExperience/types';

export type BenefitType =
  // Existing keys (production rows exist under every one of these; never rename).
  | 'exclusive_tracks'
  | 'exclusive_albums'
  | 'exclusive_posts'
  | 'early_access'
  | 'community_badge'
  | 'shop_discount'
  | 'supporter_wall'
  | 'priority_replies'
  | 'direct_messaging'
  | 'one_on_one_call'
  | 'group_live_qa'
  | 'custom_song_request'
  | 'custom_experience'
  | 'monthly_merch'
  | 'credits_on_releases'
  | 'shoutout'
  // Added 2026-09-03 for capabilities that were already live but had no benefit identity.
  | 'stems'
  | 'vault_collection'
  | 'creative_voting'
  | 'fan_submissions'
  | 'member_recognition'
  | 'welcome_unlock'
  | 'drop_alerts';

export type BenefitSupport = 'recommended' | 'additional' | 'manual' | 'retired';

/** The fan-economy model a recommended benefit belongs to. Also the picker's order. */
export type BenefitPillar = 'access' | 'influence' | 'contribution' | 'status' | 'experience';
export const PILLAR_ORDER: readonly BenefitPillar[] = ['access', 'influence', 'contribution', 'status', 'experience'];
export const PILLAR_COPY: Record<BenefitPillar, { title: string; line: string }> = {
  access: { title: 'Access', line: 'Fans get closer.' },
  influence: { title: 'Influence', line: 'Fans help shape selected decisions.' },
  contribution: { title: 'Contribution', line: 'Fans put their own ideas and material in the room.' },
  status: { title: 'Status', line: 'Fans can see and prove their place.' },
  experience: { title: 'Experience', line: 'Fans take part in selected sessions.' },
};

/** What keeping this promise costs the artist, in words. No numeric score exists and none is invented. */
export type BenefitEffort = 'automatic' | 'add_when_ready' | 'active';
export const EFFORT_COPY: Record<BenefitEffort, string> = {
  automatic: 'Mostly automatic',
  add_when_ready: 'Add when you have something',
  active: 'Needs you to show up',
};

/** The legacy catalog category. Kept so existing readers of BENEFIT_CATALOG keep working. */
export type BenefitCategory = 'music' | 'community' | 'shop' | 'experiences' | 'recognition';

export interface ConfigField {
  key: string;
  label: string;
  type: 'select' | 'number' | 'text';
  options?: { value: string | number; label: string }[];
  min?: number;
  max?: number;
  maxLength?: number;
  default: string | number;
}

/** Which deterministic resolver answers "is this ready?" (benefitReadiness.ts). */
export type ReadinessKey =
  | 'gated_tracks'
  | 'early_window'
  | 'gated_posts'
  | 'member_files'
  | 'vault_playlist'
  | 'decisions'
  | 'sessions'
  | 'submissions'
  | 'recognition'
  | 'welcome_unlock'
  | 'drop_alerts'
  | 'messaging'
  | 'products'
  | 'release_credits';

export interface FastAction {
  /** Button label. An ACTION, never a slogan. */
  label: string;
  /**
   * Route the action opens. `{slug}` is replaced with the artist's own page slug (the post
   * composer lives on the public artist page, not in Studio). `?benefit=&tier=` are appended
   * by fastActionHref.
   */
  path: string;
}

export interface BenefitDelivery {
  key: BenefitType;
  /** Artist-facing OUTCOME label, the fan's side of it ("Hear music only members get"). */
  label: string;
  /** One line under the label: what the fan actually gets. */
  fanMeaning: string;
  /** The fan-facing card line when the config adds nothing (see getBenefitDisplayText). */
  cardLine: string;
  support: BenefitSupport;
  pillar?: BenefitPillar;
  icon: string;
  category: BenefitCategory;
  /** How CRWN delivers it, or for manual promises, what the artist does. One sentence. */
  delivery: string;
  effort: BenefitEffort;
  /** 'optional': the picker offers a schedule; the default is always no fixed schedule. */
  cadence: 'none' | 'optional';
  fastAction?: FastAction;
  readiness?: ReadinessKey;
  /** The Tier Offer Experience preview kind that best demonstrates this benefit. */
  previewKind?: PreviewKind;
  configFields?: ConfigField[];
  /** Shown beside the card when a promise carries a legal or expectation risk. */
  disclaimer?: string;
}

/** The schedule control. `''` is "No fixed schedule" and writes NO frequency key. */
export const CADENCE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'No fixed schedule' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

const FREQUENCY_FIELD: ConfigField = {
  key: 'frequency',
  label: 'Promise a schedule?',
  type: 'select',
  options: CADENCE_OPTIONS,
  default: '',
};

export const MESSAGING_DISCLAIMER =
  'Messaging access lets supporters write to you. Replies are at your discretion and are not guaranteed.';

export const CREDITS_DISCLAIMER =
  'A credit is recognition only. It grants no master ownership, publishing ownership, songwriting credit, producer credit, royalties, revenue participation, approval rights, creative control, or Team Split participation.';

export const BENEFIT_REGISTRY: readonly BenefitDelivery[] = [
  // ---------------------------------------------------------------- ACCESS
  {
    key: 'exclusive_tracks',
    label: 'Hear music only members get',
    fanMeaning: 'Songs, demos and alternate versions the public never gets.',
    cardLine: 'Music only members get',
    support: 'recommended',
    pillar: 'access',
    icon: '🎵',
    category: 'music',
    delivery: 'A track you gate to this rung plays for members and locks for everyone else.',
    effort: 'add_when_ready',
    cadence: 'none',
    fastAction: { label: 'Add member track', path: '/studio/music' },
    readiness: 'gated_tracks',
    previewKind: 'audio',
  },
  {
    key: 'early_access',
    label: 'Hear finished music before the public',
    fanMeaning: 'New songs open to members first and go public later.',
    cardLine: 'Finished music before the public',
    support: 'recommended',
    pillar: 'access',
    icon: '⏰',
    category: 'music',
    delivery: 'Release a track members-first and CRWN opens it to the public when the window closes. The window is set per release unless you promise a number here.',
    effort: 'add_when_ready',
    cadence: 'none',
    fastAction: { label: 'Release to members first', path: '/studio/music' },
    readiness: 'early_window',
    previewKind: 'audio',
    configFields: [
      {
        key: 'days_early',
        label: 'Promise a head start?',
        type: 'select',
        options: [
          { value: '', label: 'Decided per release' },
          { value: 1, label: '1 day' },
          { value: 3, label: '3 days' },
          { value: 7, label: '1 week' },
          { value: 14, label: '2 weeks' },
        ],
        default: '',
      },
    ],
  },
  {
    key: 'exclusive_posts',
    label: 'Go behind the scenes',
    fanMeaning: 'Private updates, stories, commentary and what the public never sees.',
    cardLine: 'Behind the scenes with members',
    support: 'recommended',
    pillar: 'access',
    icon: '💬',
    category: 'community',
    delivery: 'A post you gate to this rung shows in the member feed and locks for everyone else.',
    effort: 'add_when_ready',
    cadence: 'optional',
    fastAction: { label: 'Share member update', path: '/{slug}?tab=community' },
    readiness: 'gated_posts',
    previewKind: 'image',
    configFields: [FREQUENCY_FIELD],
  },
  {
    key: 'stems',
    label: 'Get the stems',
    fanMeaning: 'Stems, project files and downloads members can use.',
    cardLine: 'Stems',
    support: 'recommended',
    pillar: 'access',
    icon: '🎚️',
    category: 'music',
    delivery: 'Files you add for this rung download through a private, signed link for members only.',
    effort: 'add_when_ready',
    cadence: 'none',
    fastAction: { label: 'Add stems', path: '/studio/music' },
    readiness: 'member_files',
    previewKind: 'collection',
  },
  {
    key: 'vault_collection',
    label: 'Explore a private music collection',
    fanMeaning: 'A curated Vault of music only this rung and above can open.',
    cardLine: 'The Vault, a private collection for members',
    support: 'recommended',
    pillar: 'access',
    icon: '🗝️',
    category: 'music',
    delivery: 'The Vault is a collection gated to this rung. Tracks you place in it become members-only music for this rung and above.',
    effort: 'add_when_ready',
    cadence: 'none',
    fastAction: { label: 'Add to Vault', path: '/studio/music' },
    readiness: 'vault_playlist',
    previewKind: 'collection',
  },

  // ------------------------------------------------------------- INFLUENCE
  {
    key: 'creative_voting',
    label: 'Help make creative decisions',
    fanMeaning: 'Vote on beats, hooks, covers, titles and what gets finished.',
    cardLine: 'Vote on creative decisions',
    support: 'recommended',
    pillar: 'influence',
    icon: '🗳️',
    category: 'community',
    delivery: 'A decision you open in the Lab for this rung takes one counted vote per member. Any question, any stage.',
    effort: 'active',
    cadence: 'optional',
    fastAction: { label: 'Create decision', path: '/studio/lab' },
    readiness: 'decisions',
    previewKind: 'decision',
    configFields: [FREQUENCY_FIELD],
  },

  // ---------------------------------------------------------- CONTRIBUTION
  {
    key: 'fan_submissions',
    label: 'Submit their own ideas',
    fanMeaning: 'Send beats, vocals, ideas and references for consideration.',
    cardLine: 'Send your ideas and material for consideration',
    support: 'recommended',
    pillar: 'contribution',
    icon: '📥',
    category: 'community',
    delivery: 'A session that accepts submissions from this rung takes their material through a private upload, with a deadline you set.',
    effort: 'active',
    cadence: 'none',
    fastAction: { label: 'Open submission window', path: '/studio/live' },
    readiness: 'submissions',
    previewKind: 'submission',
  },

  // ---------------------------------------------------------------- STATUS
  {
    key: 'member_recognition',
    label: 'Be recognized as a member',
    fanMeaning: 'Their rung and member-since date, visible to them on your page.',
    cardLine: 'Member recognition',
    support: 'recommended',
    pillar: 'status',
    icon: '🏅',
    category: 'recognition',
    delivery: 'Every member sees their own rung and member-since date on your page. Nothing about who pays is shown publicly.',
    effort: 'automatic',
    cadence: 'none',
    readiness: 'recognition',
    previewKind: 'status',
  },

  // ------------------------------------------------------------ EXPERIENCE
  {
    key: 'group_live_qa',
    label: 'Watch selected creation sessions',
    fanMeaning: 'Live sessions, listening events and group Q and A when you open one.',
    cardLine: 'Live and group sessions for members',
    support: 'recommended',
    pillar: 'experience',
    icon: '🎤',
    category: 'experiences',
    delivery: 'A live session you gate to this rung admits members without a ticket. Nothing recurs unless you promise a schedule here.',
    effort: 'active',
    cadence: 'optional',
    fastAction: { label: 'Create group session', path: '/studio/live' },
    readiness: 'sessions',
    previewKind: 'session',
    configFields: [FREQUENCY_FIELD],
  },

  // ----------------------------------------------------- ADDITIONAL (real)
  {
    key: 'welcome_unlock',
    label: 'Unlock something the moment they join',
    fanMeaning: 'A track or gift delivered on join through your drop funnel.',
    cardLine: 'Something to unlock the moment you join',
    support: 'additional',
    icon: '🎁',
    category: 'music',
    delivery: 'Your active drop funnel delivers the unlock and creates the free membership in the same tap.',
    effort: 'automatic',
    cadence: 'none',
    fastAction: { label: 'Set the welcome unlock', path: '/studio/automations' },
    readiness: 'welcome_unlock',
    previewKind: 'audio',
  },
  {
    key: 'drop_alerts',
    label: 'First word on every drop',
    fanMeaning: 'Members hear about a release before anyone else.',
    cardLine: 'First word on every new drop',
    support: 'additional',
    icon: '📣',
    category: 'community',
    delivery: 'You send the word. CRWN prefills the audience to this rung and above; nothing is sent without you.',
    effort: 'active',
    cadence: 'none',
    fastAction: { label: 'Notify members', path: '/studio/fans?view=compose' },
    readiness: 'drop_alerts',
    previewKind: 'timeline',
  },
  {
    key: 'direct_messaging',
    label: 'Message you directly',
    fanMeaning: 'Members on this rung can write to you in CRWN.',
    cardLine: 'Direct messages with the artist',
    support: 'additional',
    icon: '✉️',
    category: 'community',
    delivery: 'The inbox opens for this rung. Direct messages need the Pro plan.',
    effort: 'active',
    cadence: 'none',
    fastAction: { label: 'Open inbox', path: '/messages' },
    readiness: 'messaging',
    disclaimer: MESSAGING_DISCLAIMER,
  },
  {
    key: 'shop_discount',
    label: 'A standing shop discount',
    fanMeaning: 'A percentage off every shop purchase, applied at checkout.',
    cardLine: 'Shop discount',
    support: 'additional',
    icon: '🏷️',
    category: 'shop',
    delivery: 'Applied automatically at product checkout for members on this rung.',
    effort: 'automatic',
    cadence: 'none',
    fastAction: { label: 'Add a product', path: '/studio/shop' },
    readiness: 'products',
    configFields: [
      { key: 'discount_percent', label: 'Discount %', type: 'number', min: 5, max: 50, default: 10 },
    ],
  },
  {
    key: 'credits_on_releases',
    label: 'Named in your release credits',
    fanMeaning: 'A thank-you credit on releases. Recognition only, never rights.',
    cardLine: 'Credited on new releases',
    support: 'additional',
    icon: '📝',
    category: 'recognition',
    delivery: 'You credit a release from Music and CRWN records who was eligible. It grants nothing beyond the words.',
    effort: 'active',
    cadence: 'none',
    fastAction: { label: 'Credit a release', path: '/studio/music' },
    readiness: 'release_credits',
    configFields: [
      { key: 'role_label', label: 'How they are credited', type: 'text', maxLength: 40, default: 'Executive Supporter' },
    ],
    disclaimer: CREDITS_DISCLAIMER,
  },

  // ---------------------------------------------------------------- MANUAL
  {
    key: 'one_on_one_call',
    label: 'A private call with you',
    fanMeaning: 'A one-on-one video call.',
    cardLine: '1-on-1 video call',
    support: 'manual',
    icon: '📹',
    category: 'experiences',
    delivery: 'You schedule and run the call yourself.',
    effort: 'active',
    cadence: 'optional',
    configFields: [FREQUENCY_FIELD],
  },
  {
    key: 'priority_replies',
    label: 'Priority replies',
    fanMeaning: 'You answer them first.',
    cardLine: 'Priority replies',
    support: 'manual',
    icon: '⭐',
    category: 'community',
    delivery: 'You decide who you answer first. CRWN does not sort your inbox.',
    effort: 'active',
    cadence: 'none',
  },
  {
    key: 'custom_song_request',
    label: 'A custom song',
    fanMeaning: 'A song made for them.',
    cardLine: 'Custom song request',
    support: 'manual',
    icon: '🎶',
    category: 'experiences',
    delivery: 'You take the request and deliver the song yourself.',
    effort: 'active',
    cadence: 'none',
  },
  {
    key: 'custom_experience',
    label: 'Something only you can define',
    fanMeaning: 'Your own perk, in your words.',
    cardLine: 'Custom experience',
    support: 'manual',
    icon: '✨',
    category: 'experiences',
    delivery: 'You deliver it yourself. CRWN prints your words and tracks nothing.',
    effort: 'active',
    cadence: 'none',
    configFields: [{ key: 'experience_text', label: 'Describe it', type: 'text', maxLength: 60, default: '' }],
  },
  {
    key: 'shoutout',
    label: 'A shoutout from you',
    fanMeaning: 'You name them in a post or a session.',
    cardLine: 'Community shoutout',
    support: 'manual',
    icon: '🙌',
    category: 'recognition',
    delivery: 'You write or say it yourself.',
    effort: 'active',
    cadence: 'none',
  },

  // --------------------------------------------------------------- RETIRED
  {
    // Retired 2026-09-03 with the rest of the physical-goods surface. CRWN does not
    // sell, ship, or track a physical item: the shop no longer offers a physical
    // product type, and no artist screen ever read the shipping address a physical
    // checkout collected. A tier that promised merch in the mail was promising
    // something CRWN could not help keep. Zero production rows carried this key.
    key: 'monthly_merch',
    label: 'Merch in the mail',
    fanMeaning: 'Retired. CRWN does not ship physical items.',
    cardLine: 'Merch drop',
    support: 'retired',
    icon: '📦',
    category: 'shop',
    delivery: 'No longer offered. Link your own merch store from your profile instead.',
    effort: 'active',
    cadence: 'none',
  },
  {
    key: 'exclusive_albums',
    label: 'Exclusive albums',
    fanMeaning: 'Retired. Gate the album tracks with "Hear music only members get" instead.',
    cardLine: 'Exclusive Albums',
    support: 'retired',
    icon: '💿',
    category: 'music',
    delivery: 'No longer offered. Albums are gated track by track.',
    effort: 'add_when_ready',
    cadence: 'none',
  },
  {
    key: 'community_badge',
    label: 'Community badge',
    fanMeaning: 'Retired. No community surface draws a badge.',
    cardLine: 'Community badge',
    support: 'retired',
    icon: '🏅',
    category: 'community',
    delivery: 'No longer offered. Use "Be recognized as a member" instead.',
    effort: 'automatic',
    cadence: 'none',
    configFields: [{ key: 'badge_text', label: 'Badge text', type: 'text', maxLength: 20, default: '' }],
  },
  {
    key: 'supporter_wall',
    label: 'Name on a supporter wall',
    fanMeaning: 'Retired. No wall exists and public membership is not published.',
    cardLine: 'Name on Supporter Wall',
    support: 'retired',
    icon: '🏆',
    category: 'recognition',
    delivery: 'No longer offered. Public membership recognition is deferred until fans can opt in.',
    effort: 'automatic',
    cadence: 'none',
  },
];

const BY_KEY: ReadonlyMap<string, BenefitDelivery> = new Map(BENEFIT_REGISTRY.map((b) => [b.key, b]));

export function benefitDelivery(key: string): BenefitDelivery | undefined {
  return BY_KEY.get(key);
}

export function isBenefitType(key: string): key is BenefitType {
  return BY_KEY.has(key);
}

/** True when CRWN has a live delivery path for the benefit (recommended or additional). */
export function isSupportedBenefit(key: string): boolean {
  const s = BY_KEY.get(key)?.support;
  return s === 'recommended' || s === 'additional';
}

/** The keys a NEW tier may pick from. Retired keys are excluded; they still resolve for old rows. */
export function selectableBenefits(): BenefitDelivery[] {
  return BENEFIT_REGISTRY.filter((b) => b.support !== 'retired');
}

/** Recommended benefits in pillar order, the order a rung is legible to a fan in. */
export function recommendedBenefits(): BenefitDelivery[] {
  return BENEFIT_REGISTRY.filter((b) => b.support === 'recommended').sort(
    (a, b) => PILLAR_ORDER.indexOf(a.pillar ?? 'access') - PILLAR_ORDER.indexOf(b.pillar ?? 'access'),
  );
}

/**
 * The route a fast action opens, carrying the originating tier as a POINTER. The destination
 * matches the id against tiers it loaded for the signed-in artist and derives "this rung and
 * above" itself (expandFromTier); nothing in the URL is authority.
 */
export function fastActionHref(key: BenefitType, ctx: { tierId: string; artistSlug?: string | null }): string | null {
  const def = BY_KEY.get(key);
  if (!def?.fastAction) return null;
  let path = def.fastAction.path;
  if (path.includes('{slug}')) {
    if (!ctx.artistSlug) return null;
    path = path.replace('{slug}', encodeURIComponent(ctx.artistSlug));
  }
  const q = new URLSearchParams({ benefit: key, tier: ctx.tierId });
  return `${path}${path.includes('?') ? '&' : '?'}${q.toString()}`;
}

/**
 * Read a fast-action pointer back out of a query string. Returns the benefit only when it is a
 * registry key; the tier id is returned as-is and must be matched against loaded rows.
 */
export function readBenefitPointer(search: string): { benefit: BenefitType; tierId: string } | null {
  const p = new URLSearchParams(search);
  const benefit = p.get('benefit') ?? '';
  const tierId = p.get('tier') ?? '';
  if (!isBenefitType(benefit) || !tierId) return null;
  return { benefit, tierId };
}

/** The effort line the picker prints, cadence-aware. */
export function effortLabel(def: BenefitDelivery, config?: Record<string, unknown> | null): string {
  const freq = config?.frequency;
  if (def.cadence === 'optional' && typeof freq === 'string' && freq) return 'Recurring because you chose a schedule';
  return EFFORT_COPY[def.effort];
}
