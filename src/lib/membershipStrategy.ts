// The membership strategy brain (CRWN_UPDATED_RELEASE_STRATEGY.md, 2026-08-01).
//
// Pure and deterministic, in the planRecommendation.ts mold: the same declared
// facts always produce the same strategy, and every claim can show its rule.
// Nothing here is an AI guess, and nothing here stores anything: the API derives
// facts on read, and only the artist's explicit override is persisted.
//
// VOCABULARY (the spec is strict about this, and so is this file):
//   platform plan      = what the artist pays CRWN (Launch / Pro / Scale)
//   membership tier    = what fans buy from the artist (Bronze/Silver/Gold/Platinum)
//   membership strategy= how the artist runs those tiers (Release Club / Vault)
//   content class      = how one piece of content is gated (free forever /
//                        paid first / member only)
//
// The spec names tiers "First Listen", "Inner Circle", "Executive", "Vault".
// Those are ROLES, not names: the ladder stays Bronze/Silver/Gold/Platinum
// (pinned by tierTemplate.test.ts) and each strategy maps a role onto a rung.
//
// Positioning, in one line each:
//   DSPs are where fans hear the finished release. CRWN is where fans become
//   part of it. Keep your music everywhere; give your biggest fans a reason to
//   come closer.

// ---------------------------------------------------------------------------
// Strategy selection
// ---------------------------------------------------------------------------

export type MembershipStrategyKey = 'release_club' | 'vault_membership';

export interface StrategyFacts {
  /** Active tracks already on CRWN (observed). */
  catalogTracks?: number | null;
  /** Unreleased songs the artist says they have (declared; often unknown). */
  unreleasedTracks?: number | null;
  /** Public releases per year (declared; often unknown). */
  releasesPerYear?: number | null;
  /** Has the artist ever run a CRWN live session (observed). */
  hasRunLiveSession?: boolean;
  /** Calculator projection, cents/month (observed via claimed seed). */
  projectedMonthlyGmvCents?: number | null;
}

export interface StrategyRecommendation {
  strategy: MembershipStrategyKey;
  /** Machine key for the strongest reason. */
  reason: string;
  /** Artist-readable reasons, strongest first. */
  reasons: string[];
}

/**
 * Deterministic pick between the two shipped strategies.
 *
 * Vault Membership monetizes catalog depth: it fits artists with a real
 * unreleased archive or long gaps between public releases. Release Club
 * enhances the public release cycle and is the default, because it works at any
 * cadence and never asks the artist to open an archive they may not have.
 */
export function recommendStrategy(facts: StrategyFacts): StrategyRecommendation {
  const unreleased = facts.unreleasedTracks ?? null;
  const perYear = facts.releasesPerYear ?? null;
  const catalog = facts.catalogTracks ?? 0;

  if (unreleased !== null && unreleased >= 10) {
    return {
      strategy: 'vault_membership',
      reason: 'deep_unreleased_archive',
      reasons: [
        `Your ${unreleased} unreleased songs are an archive fans will pay to open, one drop at a time`,
        'Every month, another part of the vault opens: a promise you can keep from music you already made',
      ],
    };
  }

  if (perYear !== null && perYear <= 2 && catalog >= 20) {
    return {
      strategy: 'vault_membership',
      reason: 'long_release_gaps',
      reasons: [
        'With long gaps between public releases, the membership needs a rhythm that does not depend on new drops',
        `Your ${catalog}-track catalog carries the monthly vault unlock between releases`,
      ],
    };
  }

  return {
    strategy: 'release_club',
    reason: 'enhances_public_releases',
    reasons: [
      'Your fans hear every release first and get the world around it: the demos, the process, the release night',
      'Works with the releases you are already planning; nothing extra to make',
    ],
  };
}

// ---------------------------------------------------------------------------
// Strategy definitions (data, rendered by the card and future builder)
// ---------------------------------------------------------------------------

/** Ladder rung keys, matching tierTemplate.ts. Names come from RECOMMENDED_LADDER. */
export type RungKey = 'wave' | 'inner_circle' | 'vault' | 'throne';

export interface TierRole {
  rung: RungKey;
  /** What this rung IS in this strategy (the spec's tier names are these roles). */
  role: string;
  /** The one-line promise the artist makes at this rung. */
  promise: string;
  /** Days before public release this rung hears a paid-first drop (0 = with the public). */
  earlyAccessDays: number;
  highlights: string[];
}

export interface WaterfallStep {
  daysBeforeRelease: number;
  audience: 'throne' | 'vault' | 'inner_circle' | 'wave' | 'public';
  actions: string[];
}

export interface MembershipStrategyDef {
  key: MembershipStrategyKey;
  name: string;
  tagline: string;
  bestFor: string[];
  /** The membership promise by platform plan (spec section 4). */
  monthlyPromise: { launch: string; pro: string };
  tierRoles: TierRole[];
  /** Single-release waterfall template (spec section 11). Display + future automation. */
  waterfall: WaterfallStep[];
  /** First 90 days (spec section 19), one line per month. */
  ninetyDays: { month: number; focus: string; freeSide: string; paidSide: string }[];
}

export const MEMBERSHIP_STRATEGIES: Record<MembershipStrategyKey, MembershipStrategyDef> = {
  release_club: {
    key: 'release_club',
    name: 'The Release Club',
    tagline: 'Hear it first. See more. Help shape what comes next.',
    bestFor: [
      'You release music consistently and plan to keep distributing on DSPs',
      'You have singles, an EP, or an album coming',
      'You want CRWN to make every public release bigger',
    ],
    monthlyPromise: {
      launch: 'One music moment and one participation moment every month.',
      pro: 'One new music moment, one private live experience, and one opportunity to participate every month.',
    },
    tierRoles: [
      {
        rung: 'wave',
        role: 'The front door',
        promise: 'Join free so you never miss the next drop.',
        earlyAccessDays: 0,
        highlights: ['Release calendar and previews', 'Occasional free song', 'Missions and referral opportunities'],
      },
      {
        rung: 'inner_circle',
        role: 'First Listen',
        promise: 'Hear it first, see more of the process, and join the private monthly session.',
        earlyAccessDays: 7,
        highlights: ['Singles 7 days before DSPs', 'One members-first music moment a month', 'Voting on artwork and setlists'],
      },
      {
        rung: 'vault',
        role: 'The Inner Circle',
        promise: 'Be part of the process, not just the release.',
        earlyAccessDays: 14,
        highlights: ['Earlier access, more unreleased material', 'Demos, alternate versions, commentary', 'Priority questions in live sessions'],
      },
      {
        rung: 'throne',
        role: 'Executive',
        promise: 'Watch the project come together from the inside.',
        earlyAccessDays: 30,
        highlights: ['Earliest access to everything', 'Executive Producer Sessions', 'Quarterly private listening event'],
      },
    ],
    waterfall: [
      { daysBeforeRelease: 30, audience: 'throne', actions: ['Snippets and creative updates', 'Artwork concepts', 'A vote or feedback moment'] },
      { daysBeforeRelease: 14, audience: 'vault', actions: ['Full song early', 'Private listening session', 'Demo or alternate version'] },
      { daysBeforeRelease: 7, audience: 'inner_circle', actions: ['Full song early', 'Member discussion'] },
      { daysBeforeRelease: 3, audience: 'wave', actions: ['Preview and trailer', 'Invitation to the first-listen event'] },
      { daysBeforeRelease: 0, audience: 'public', actions: ['Release day on DSPs', 'Release-night livestream for members', 'The demos and commentary stay members-only'] },
    ],
    ninetyDays: [
      { month: 1, focus: 'Establish the habit', freeSide: 'Launch the free tier, welcome post, first free check-in', paidSide: 'One early song or demo, one private session, one fan vote' },
      { month: 2, focus: 'Demonstrate exclusivity', freeSide: 'Previews, one free check-in, one mission', paidSide: 'One substantial drop, one private live, one decision fans influence' },
      { month: 3, focus: 'Create a campaign', freeSide: 'Promote the release, public preview, activate sharing', paidSide: 'Early access delivered, release event, premium archive material' },
    ],
  },
  vault_membership: {
    key: 'vault_membership',
    name: 'The Vault Membership',
    tagline: 'Every month, another part of the vault opens.',
    bestFor: [
      'You have a real archive: demos, alternate versions, unreleased eras',
      'There are long gaps between your public releases',
      'You want the membership to run on music you already made',
    ],
    monthlyPromise: {
      launch: 'One vault moment and one participation moment every month.',
      pro: 'One full vault release, one supporting music asset, one private live moment, and one vote every month.',
    },
    tierRoles: [
      {
        rung: 'wave',
        role: 'The front door',
        promise: 'Join free and see what is coming out of the vault next.',
        earlyAccessDays: 0,
        highlights: ['Vault previews', 'Public announcements', 'Missions and referral opportunities'],
      },
      {
        rung: 'inner_circle',
        role: 'The Vault',
        promise: 'Every month, another part of the vault opens.',
        earlyAccessDays: 7,
        highlights: ['One full vault release a month', 'A demo or alternate version alongside it', 'Voting on the next vault song'],
      },
      {
        rung: 'vault',
        role: 'The Deep Vault',
        promise: 'More of the archive, closer to the process.',
        earlyAccessDays: 14,
        highlights: ['The monthly vault unlock', 'Extended sessions and artist notes', 'Earlier access to public releases'],
      },
      {
        rung: 'throne',
        role: 'Executive',
        promise: 'Help shape what comes out of the vault.',
        earlyAccessDays: 30,
        highlights: ['Influence over what opens next', 'Executive Producer Sessions', 'Quarterly private listening event'],
      },
    ],
    waterfall: [
      { daysBeforeRelease: 14, audience: 'throne', actions: ['Hear the candidates', 'Vote on which vault song opens next'] },
      { daysBeforeRelease: 7, audience: 'vault', actions: ['The chosen song early', 'The story and artist notes behind it'] },
      { daysBeforeRelease: 0, audience: 'inner_circle', actions: ['The monthly vault release opens', 'Demo or alternate version alongside'] },
      { daysBeforeRelease: -3, audience: 'wave', actions: ['A preview of what opened', 'What is coming next month'] },
    ],
    ninetyDays: [
      { month: 1, focus: 'Open the vault', freeSide: 'Launch the free tier, vault previews, first free check-in', paidSide: 'First vault release, first private session, first vote' },
      { month: 2, focus: 'Prove the rhythm', freeSide: 'Previews of the next unlock, one mission', paidSide: 'Second vault release, behind-the-scenes asset, fans pick the next one' },
      { month: 3, focus: 'Make it an event', freeSide: 'Public preview event, activate sharing', paidSide: 'A bigger unlock (a pack or era), listening event, Executive Producer Session' },
    ],
  },
};

export function strategyDef(key: MembershipStrategyKey): MembershipStrategyDef {
  return MEMBERSHIP_STRATEGIES[key];
}

export function isMembershipStrategyKey(v: unknown): v is MembershipStrategyKey {
  return v === 'release_club' || v === 'vault_membership';
}

// ---------------------------------------------------------------------------
// Content classes (spec section 5), expressed over the EXISTING track fields.
// ---------------------------------------------------------------------------
// No new entitlement logic: a class is a way of setting is_free /
// allowed_tier_ids / public_release_date so the existing gate does the right
// thing. GatedTrackPlayer's rule:
//   date in future  -> only allowed_tier_ids members
//   date passed     -> is_free !== false ? everyone : allowed_tier_ids members
//
// Which yields exactly three coherent encodings:
//   free_forever : is_free true,  tiers [],   date null
//   paid_first   : is_free true,  tiers SET,  date future  (public later)
//   member_only  : is_free false, tiers SET,  date null
//
// The old two-toggle UI could produce is_free true + tiers [] + future date,
// which locks the track for EVERYONE (members included) until the date: the
// early-access check runs against an empty tier list. Classes make that state
// unrepresentable.

export type ContentClass = 'free_forever' | 'paid_first' | 'member_only';

/** Paid-first windows the spec recommends. */
export const PAID_FIRST_WINDOWS = [7, 14, 21, 30] as const;

export interface TrackAccessFields {
  is_free: boolean;
  allowed_tier_ids: string[];
  public_release_date: string | null;
}

export function classifyTrack(t: {
  is_free?: boolean | null;
  allowed_tier_ids?: string[] | null;
  public_release_date?: string | null;
}, now: Date = new Date()): ContentClass {
  const date = t.public_release_date ? new Date(t.public_release_date) : null;
  const hasFutureDate = !!date && date.getTime() > now.getTime();
  const hasTiers = (t.allowed_tier_ids?.length ?? 0) > 0;
  if (hasFutureDate && hasTiers) return 'paid_first';
  if (t.is_free !== false) return 'free_forever';
  return 'member_only';
}

/**
 * The field values that ENCODE a class. The only writer the form should use:
 * building the fields from the class is what makes the broken combinations
 * unrepresentable.
 */
export function fieldsForClass(
  cls: ContentClass,
  opts: { tierIds?: string[]; windowDays?: number; now?: Date } = {},
): TrackAccessFields {
  const now = opts.now ?? new Date();
  const tierIds = opts.tierIds ?? [];
  if (cls === 'free_forever') {
    return { is_free: true, allowed_tier_ids: [], public_release_date: null };
  }
  if (cls === 'paid_first') {
    // Members-first with NO members selected is the lock-everyone state (the
    // gate checks the window against an empty tier list, so nobody can play
    // it, paying members included). There is no one to give early access to,
    // so the honest encoding is public now.
    if (tierIds.length === 0) {
      return { is_free: true, allowed_tier_ids: [], public_release_date: null };
    }
    const days = opts.windowDays && opts.windowDays > 0 ? opts.windowDays : 7;
    const date = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    // is_free stays TRUE: that is what makes "public later" real once the
    // window passes. The future date is what gates the window to members.
    return { is_free: true, allowed_tier_ids: tierIds, public_release_date: date.toISOString() };
  }
  return { is_free: false, allowed_tier_ids: tierIds, public_release_date: null };
}

export const CONTENT_CLASS_LABELS: Record<ContentClass, { label: string; hint: string }> = {
  free_forever: {
    label: 'Free forever',
    hint: 'Everyone can play it. Your front door: previews, selected songs, the public catalog.',
  },
  paid_first: {
    label: 'Members first, public later',
    hint: 'Members hear it now; it opens to everyone after the window. Your release-week advantage.',
  },
  member_only: {
    label: 'Members only',
    hint: 'Stays in the archive for paying members. Never opens up: the reason to stay subscribed.',
  },
};
