// The canonical CRWN sub-avatar taxonomy.
//
// Four founder-approved sub-avatars of the ICP (docs/ICP.md: a proven direct-to-fan seller with a
// fragmented stack). These are IDENTITY segments (priority tier, operating maturity, genre), not
// pain segments, which is why all four share ONE calculator: who the artist is decides the
// framing, the question order, the first offer and the cohort, while the money model stays the
// single unified model that refuses to double-count.
//
// EVERY AVATAR'S FRONT DOOR IS THE ALL-IN-ONE CALCULATOR (founder decision, 2026-08-03).
// `/tools/opportunity-calculator?from=<avatar id>` leads with that avatar's questions through the
// existing `entryContexts` mechanism, which REORDERS the wizard and never adds or drops a
// question. One model, four entrances. The individual single-opportunity calculators still exist
// in the tools directory and can still carry `?from=` links; they are simply no longer the
// avatar-defining front doors.
//
// This file is client-safe DATA plus pure functions. No React, no secrets, no I/O.
//
// DESIGN RULE (house pattern, same as membershipStrategy/planRecommendation/artistRoadmap): the
// avatar is DERIVED ON READ from evidence that already exists (the answers the artist typed into
// the calculator, the entry context they arrived through, and what their account contains).
// Nothing derived is stored. The ONLY stored value is a manual override
// (`artist_profiles.sub_avatar_override`, see supabase/schema-phase2-sub-avatar.sql, fail-soft
// before it runs), plus its audit history.
//
// VERSION HISTORY
//  - subAvatar@1 (2026-08-03, retired the same day): pain-based segments keyed to four separate
//    entry calculators. Replaced before any data accumulated under it, and safely, because the
//    avatar was never stored on an event: it was always re-derived at read time.
//  - subAvatar@2 (current): identity-based segments, one shared calculator.

export const SUB_AVATAR_TAXONOMY_VERSION = 'subAvatar@2';

export type SubAvatarId =
  | 'highest_priority_empire_builder'
  | 'established_independent_operator'
  | 'brand_led_hip_hop_artist'
  | 'rnb_empire_builder';

/** The all-in-one calculator every avatar routes to. */
export const SHARED_CALCULATOR_SLUG = 'opportunity-calculator';

/**
 * Reserved key under which the arriving `?from=` avatar is stored alongside the artist's answers
 * in `lead_magnet_results.input_data`. Underscore-prefixed because it is provenance, not an
 * answer: no calculator asks it, no model reads it, and `evidenceFromInputs` lifts it back out so
 * the acquisition cohort survives signup as server-side truth rather than living only in
 * client analytics.
 */
export const ENTRY_CONTEXT_INPUT_KEY = '_entry_context';

/** Genre families the taxonomy can act on. Anything else is `other` and never guessed. */
export type GenreFamily = 'hiphop' | 'rnb' | 'other';

export interface SubAvatarDef {
  id: SubAvatarId;
  /** Display label. Safe to rename; the id is not. */
  label: string;
  /** The loss this artist is living with, in their own terms. Loss-framed per the copy rule. */
  pain: string;
  /** The promise CRWN makes this avatar. */
  promise: string;
  /**
   * The `?from=` key on the all-in-one calculator. Equal to the id, so a campaign link is
   * `/tools/opportunity-calculator?from=<id>` and nothing has to be looked up.
   */
  entryContext: string;
  /** The full entry route, ready to paste into a video description. */
  entryRoute: string;
  /** Wizard steps pulled to the front for this avatar. Reorders only; never adds or drops one. */
  priorityStepIds: string[];
  /** The one-line note shown above the wizard so the artist sees why the order changed. */
  entryNote: string;
  /** The first CRWN offer this avatar's journey builds, in one line. */
  firstOffer: string;
  /** Where the authenticated artist continues after claiming (a real, existing surface). */
  continueRoute: string;
  /** Nurture emphasis: the objections and themes this avatar's email module leans on. */
  nurtureThemes: string[];
  /** Post-launch recommendation emphasis, in priority order (real CRWN surfaces only). */
  postLaunchFocus: { label: string; route: string }[];
}

/**
 * ORDER IS PRECEDENCE. These segments deliberately overlap (a large R&B seller is both an R&B
 * Empire Builder and a highest-priority lead), and a lead in two cohorts double-counts every
 * comparison. So exactly one primary avatar is assigned, ties break toward the EARLIER entry
 * here, and the runner-up is reported as the secondary. Reordering this array reorders
 * precedence, which is a founder decision and the only thing that needs changing to make it.
 */
export const SUB_AVATARS: SubAvatarDef[] = [
  {
    id: 'highest_priority_empire_builder',
    label: 'Highest Priority Empire Builder',
    pain:
      'The audience is big and the money is already moving, which means every month the business runs on rented platforms and scattered tools multiplies what is lost, not what is kept.',
    promise: 'Run the whole empire in one place, where every fan and every offer compounds instead of resetting.',
    entryContext: 'highest_priority_empire_builder',
    entryRoute: '/tools/opportunity-calculator?from=highest_priority_empire_builder',
    // Lead with proof and scale: this artist wants to know the size of the number, fast.
    priorityStepIds: ['audience', 'proof'],
    entryNote:
      'You already sell to your fans, so we start with what you have proven and what it is worth in one place, not with whether fans will pay.',
    firstOffer: 'The full four-tier membership, launched to the buyers who already pay.',
    continueRoute: '/build/offer',
    nurtureThemes: [
      'scale multiplies what a fragmented stack leaks',
      'proven buyers deserve one home, not five logins',
      'revenue per fan rises when every offer sees every fan',
      'the compounding is the point, not the individual offer',
      'building an operating system, not adding another tool',
    ],
    postLaunchFocus: [
      { label: 'Import every existing buyer list you own', route: '/studio/fans' },
      { label: 'Launch the full ladder, not just the entry tier', route: '/offers/new' },
      { label: 'Announce it to the fans who already pay you', route: '/studio/fans?view=campaigns' },
      { label: 'Add the premium experience your top tier is missing', route: '/studio/live' },
    ],
  },
  {
    id: 'established_independent_operator',
    label: 'Established Independent Minded Operator',
    pain:
      'Years of releases and every part of the business run personally, which means the whole operation is held together by tools that do not talk, and each new offer starts from zero again.',
    promise: 'One operating system for the business you already run yourself.',
    entryContext: 'established_independent_operator',
    entryRoute: '/tools/opportunity-calculator?from=established_independent_operator',
    // Lead with the catalog and the stack: this artist's leverage is what they already own.
    priorityStepIds: ['vault', 'proof', 'audience'],
    entryNote:
      'You have been doing this a while and you run it yourself, so we start with the catalog and the buyers you already have rather than with growth advice.',
    firstOffer: 'A membership built from the catalog and audience already in hand.',
    continueRoute: '/offers/new',
    nurtureThemes: [
      'independence is worth keeping, the duct tape is not',
      'a deep catalog is inventory that already exists',
      'no label means no one else is fixing the plumbing',
      'one place to run it, still entirely yours',
      'the work already done should keep earning',
    ],
    postLaunchFocus: [
      { label: 'Put the back catalog behind the membership', route: '/studio/music' },
      { label: 'Import the lists you have collected over the years', route: '/studio/fans' },
      { label: 'Schedule the promises you can actually keep', route: '/studio/promise' },
      { label: 'Retire one tool by moving what it holds', route: '/studio' },
    ],
  },
  {
    id: 'brand_led_hip_hop_artist',
    label: 'Brand-Led Hip-Hop Artist',
    pain:
      'The brand pulls real attention every week, and almost all of it converts into someone else\'s platform metrics instead of revenue and contacts you own.',
    promise: 'Turn the attention the brand already earns into owned members and owned revenue.',
    entryContext: 'brand_led_hip_hop_artist',
    entryRoute: '/tools/opportunity-calculator?from=brand_led_hip_hop_artist',
    // Lead with reach: this artist's asset is attention. (The fan-labor screen left the unified
    // calculator on 2026-08-28; sharing and clipping are asked only by their own calculators.)
    priorityStepIds: ['audience', 'proof'],
    entryNote:
      'Your brand already moves people, so we start with the reach you already have, then work out what owning that audience is worth.',
    firstOffer: 'A membership fed by the content engine.',
    continueRoute: '/offers/new',
    nurtureThemes: [
      'attention that converts to nothing you own',
      'the brand is the product, the platform is the landlord',
      'clips and shares should point somewhere you control',
      'a membership is the destination the content has been missing',
      'owning the contact beats renting the follower',
    ],
    postLaunchFocus: [
      { label: 'Give clippers the exact moments worth cutting', route: '/bounties/new' },
      { label: 'Turn on fan referrals so reach pays you back', route: '/offers/new' },
      { label: 'Point every bio and caption at your page', route: '/studio/fans' },
      { label: 'Run the launch campaign to your list', route: '/studio/fans?view=campaigns' },
    ],
  },
  {
    id: 'rnb_empire_builder',
    label: 'R&B Empire Builder',
    pain:
      'The most devoted listeners have nowhere to go deeper, so the depth that R&B fans are famous for pays nothing and quietly fades.',
    promise: 'Turn devoted listeners into paying members with somewhere real to go deeper.',
    entryContext: 'rnb_empire_builder',
    entryRoute: '/tools/opportunity-calculator?from=rnb_empire_builder',
    // Lead with depth: the catalog that rewards the closest fans. (The live screen left the
    // unified calculator on 2026-08-28; live is asked only by the Live Experience calculator.)
    priorityStepIds: ['vault', 'audience'],
    entryNote:
      'Your closest fans want more of you, so we start with the unreleased work that gives them somewhere to go.',
    firstOffer: 'A depth-first membership built around the vault.',
    continueRoute: '/offers/new',
    nurtureThemes: [
      'devotion with nowhere to spend it',
      'depth tiers are how intimacy becomes income',
      'unreleased work is what the closest fans want most',
      'one listening experience beats ten posts',
      'an empire is built on the fans who already stayed',
    ],
    postLaunchFocus: [
      { label: 'Publish the first vault drop', route: '/studio/music' },
      { label: 'Schedule a members-only listening session', route: '/studio/live' },
      { label: 'Invite your longest-standing supporters first', route: '/studio/fans' },
      { label: 'Set the depth promises you can keep', route: '/studio/promise' },
    ],
  },
];

export const SUB_AVATAR_IDS = SUB_AVATARS.map((a) => a.id) as SubAvatarId[];

/** Precedence rank (0 = highest). Lower wins a tie. */
export const SUB_AVATAR_PRECEDENCE: Record<SubAvatarId, number> = Object.fromEntries(
  SUB_AVATARS.map((a, i) => [a.id, i]),
) as Record<SubAvatarId, number>;

const BY_ID: Record<string, SubAvatarDef> = Object.fromEntries(SUB_AVATARS.map((a) => [a.id, a]));

export function getSubAvatar(id: string | null | undefined): SubAvatarDef | null {
  if (!id) return null;
  return BY_ID[id] ?? null;
}

export function isSubAvatarId(v: unknown): v is SubAvatarId {
  return typeof v === 'string' && !!BY_ID[v];
}

/**
 * The avatar an entry context declares, when it is one of ours. A `?from=` value that names a
 * single-opportunity tool (the seven existing tool contexts) is NOT an avatar and returns null:
 * that link reorders the wizard for a topic, it does not claim who the artist is.
 */
export function entryContextToSubAvatar(from: string | null | undefined): SubAvatarId | null {
  if (!from) return null;
  const key = from.trim().toLowerCase();
  return isSubAvatarId(key) ? key : null;
}

/**
 * Map a free-text genre to a family. Deliberately narrow: only the two families the taxonomy can
 * act on are recognized, everything else is `other` rather than a guess. Used for the DM path and
 * for legacy results whose genre was typed rather than picked.
 */
export function genreFamilyOf(genre: string | null | undefined): GenreFamily {
  const g = (genre || '').trim().toLowerCase();
  if (!g) return 'other';
  if (/(hip.?hop|rap|drill|trap|grime|boom.?bap)/.test(g)) return 'hiphop';
  if (/(r&b|rnb|r and b|soul|neo.?soul|neosoul)/.test(g)) return 'rnb';
  return 'other';
}
