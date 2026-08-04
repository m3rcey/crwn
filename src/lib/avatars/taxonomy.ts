// The canonical CRWN sub-avatar taxonomy.
//
// Four founder-approved sub-avatars of the ICP (docs/ICP.md: a proven direct-to-fan seller with a
// fragmented stack). Each one names a PAIN, a PROMISE, the calculator that opens its funnel, and
// the first CRWN offer its journey builds. The ids are stable machine identifiers: they ride
// funnel analytics, nurture personalization, onboarding recommendations and the admin cohort
// report, so they must never be renamed once data exists under them. Rename the LABEL, never the id.
//
// This file is client-safe DATA plus pure functions. No React, no secrets, no I/O.
//
// DESIGN RULE (house pattern, same as membershipStrategy/planRecommendation/artistRoadmap): the
// avatar is DERIVED ON READ from evidence that already exists (which calculator a lead ran, what
// they answered, what the account contains). Nothing derived is stored. The ONLY stored value is
// a manual founder override (`artist_profiles.sub_avatar_override`, see
// supabase/schema-phase2-sub-avatar.sql, fail-soft before it runs). The original acquisition
// avatar is re-derivable forever because lead_magnet_results rows are permanent: it is the mapping
// of the FIRST claimed result's tool_slug under the taxonomy version stamped here.

export const SUB_AVATAR_TAXONOMY_VERSION = 'subAvatar@1';

export type SubAvatarId =
  | 'membership_stack_consolidator'
  | 'touring_access_seller'
  | 'live_community_creator'
  | 'catalog_vault_seller';

export interface SubAvatarDef {
  id: SubAvatarId;
  /** Display label. Safe to rename; the id is not. */
  label: string;
  /** The pain, in the artist's own words. Loss-framed per the copy rule. */
  pain: string;
  /** The promise CRWN makes this avatar. */
  promise: string;
  /** The calculator that opens this avatar's funnel (its acquisition entry point). */
  calculatorSlug: string;
  /**
   * Every calculator whose completion is direct evidence of this avatar. The primary
   * calculatorSlug is always included. Used by calculatorToSubAvatar and cohort grouping.
   */
  calculatorSlugs: string[];
  /** The first CRWN offer the journey builds, in one line. */
  firstOffer: string;
  /** Where the authenticated artist continues after claiming (a real, existing surface). */
  continueRoute: string;
  /** Nurture emphasis: the objections and themes the email track leans on. */
  nurtureThemes: string[];
  /** Post-launch recommendation emphasis, in priority order (real CRWN surfaces only). */
  postLaunchFocus: { label: string; route: string }[];
}

export const SUB_AVATARS: SubAvatarDef[] = [
  {
    id: 'membership_stack_consolidator',
    label: 'Membership Stack Consolidator',
    pain:
      'Fans, payments, content and data are scattered across Patreon, Discord, Shopify, Gumroad and more, so every fan relationship is split across tools that never talk.',
    promise: 'Run the whole direct-to-fan business in one place and earn more per fan.',
    calculatorSlug: 'fan-stack-calculator',
    calculatorSlugs: ['fan-stack-calculator'],
    firstOffer: 'Rebuild the existing monetization as a four-tier CRWN membership.',
    continueRoute: '/offers/new',
    nurtureThemes: [
      'fragmented tools and stacked fees',
      'fan data that never connects',
      'migration is smaller than it looks',
      'revenue per fan rises when offers live together',
      'recreating existing memberships tier for tier',
    ],
    postLaunchFocus: [
      { label: 'Import your existing fans', route: '/studio/fans' },
      { label: 'Recreate your current member benefits', route: '/studio/promise' },
      { label: 'Announce the consolidated home', route: '/studio/fans?view=campaigns' },
      { label: 'Launch one offer your old stack could not run', route: '/offers/new' },
    ],
  },
  {
    id: 'touring_access_seller',
    label: 'Touring Access Seller',
    pain:
      'Revenue spikes on show nights and VIP upsells, then falls to nothing in the months between, while the buyers who proved they pay walk out the venue unowned.',
    promise: 'Turn VIP buyers and concert fans into recurring, year-round members.',
    calculatorSlug: 'between-tour-calculator',
    calculatorSlugs: ['between-tour-calculator'],
    firstOffer: 'A recurring VIP access membership that earns between tours.',
    continueRoute: '/offers/new',
    nurtureThemes: [
      'the money that stops when the tour stops',
      'VIP buyers are already proven spenders',
      'recurring access beats one-night upsells',
      'member-only experiences between shows',
      'promising only what a touring schedule can keep',
    ],
    postLaunchFocus: [
      { label: 'Invite your previous VIP buyers', route: '/studio/fans' },
      { label: 'Schedule the first member-only session', route: '/studio/live' },
      { label: 'Add a tour-related recurring benefit', route: '/studio/promise' },
      { label: 'Announce the membership to show audiences', route: '/studio/fans?view=campaigns' },
    ],
  },
  {
    id: 'live_community_creator',
    label: 'Live Community Creator',
    pain:
      'Hours of livestreams and fan interaction disappear the second they end, on a platform that owns the audience and pays almost nothing for it.',
    promise: 'Turn live viewers into paying members and owned fan relationships.',
    calculatorSlug: 'live-experience-calculator',
    calculatorSlugs: ['live-experience-calculator', 'executive-producer-session'],
    firstOffer: 'A free public live leading into a paid member-only continuation or replay.',
    continueRoute: '/studio/live',
    nurtureThemes: [
      'live hours that vanish unpaid',
      'what stays free and what becomes paid',
      'the paid continuation after the public stream',
      'replays as a member benefit',
      'owning the viewers instead of renting them',
    ],
    postLaunchFocus: [
      { label: 'Schedule the first free-to-paid stream', route: '/studio/live' },
      { label: 'Gate the replay for members', route: '/studio/music' },
      { label: 'Give clippers the moments worth cutting', route: '/bounties/new' },
      { label: 'Invite your most engaged live viewers', route: '/studio/fans' },
    ],
  },
  {
    id: 'catalog_vault_seller',
    label: 'Catalog and Vault Seller',
    pain:
      'Unreleased songs, demos and alternate versions sit on a hard drive earning nothing, while supporters who would pay for them are never offered a way in.',
    promise: 'Turn the music already on the hard drive into recurring fan revenue.',
    calculatorSlug: 'vault-revenue-planner',
    calculatorSlugs: ['vault-revenue-planner'],
    firstOffer: 'A paid monthly vault of unreleased music, demos and early access.',
    continueRoute: '/offers/new',
    nurtureThemes: [
      'inventory that earns nothing where it sits',
      'DSP releases stay where they are',
      'a vault is scheduled from the backlog, not new work',
      'release cadence an artist can sustain',
      'early access as the bridge between vault and public',
    ],
    postLaunchFocus: [
      { label: 'Publish the first vault drop', route: '/studio/music' },
      { label: 'Schedule the next unlock', route: '/studio/promise' },
      { label: 'Invite your existing superfans', route: '/studio/fans' },
      { label: 'Build the drop calendar for the quarter', route: '/studio/promise' },
    ],
  },
];

export const SUB_AVATAR_IDS = SUB_AVATARS.map((a) => a.id) as SubAvatarId[];

const BY_ID: Record<string, SubAvatarDef> = Object.fromEntries(SUB_AVATARS.map((a) => [a.id, a]));

export function getSubAvatar(id: string | null | undefined): SubAvatarDef | null {
  if (!id) return null;
  return BY_ID[id] ?? null;
}

export function isSubAvatarId(v: unknown): v is SubAvatarId {
  return typeof v === 'string' && !!BY_ID[v];
}

// Calculator slug -> avatar. Built once from the defs so the mapping cannot drift from the
// taxonomy. Calculators not listed under any avatar (worth, own-your-fans, missions, ...) return
// null: running them is real funnel activity but is NOT direct evidence of one of the four
// avatars, and guessing here would poison every cohort report downstream.
const CALCULATOR_TO_AVATAR: Record<string, SubAvatarId> = Object.fromEntries(
  SUB_AVATARS.flatMap((a) => a.calculatorSlugs.map((slug) => [slug, a.id])),
);

export function calculatorToSubAvatar(calculatorSlug: string | null | undefined): SubAvatarId | null {
  if (!calculatorSlug) return null;
  return CALCULATOR_TO_AVATAR[calculatorSlug] ?? null;
}

/** Every calculator slug that maps to some avatar (for cohort queries). */
export const AVATAR_CALCULATOR_SLUGS: string[] = Object.keys(CALCULATOR_TO_AVATAR);
