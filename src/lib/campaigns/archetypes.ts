// archetypes.ts — the Virality Engine's archetype registry. DATA, not behaviour.
//
// PURE. No database, no network, no AI, no clock. Adding an archetype means adding a record to
// CAMPAIGN_ARCHETYPES and writing its toolkit copy. It must never mean adding a branch to the
// campaign spine, the results reader or the attribution path
// (`docs/crwn-brain/22-VIRALITY-ENGINE-ARCHITECTURE.md` sections 6.1 and 24). If archetype logic
// ever appears as `if (archetype === '...')` outside this file, the abstraction has failed.
//
// WHY ONLY ONE ARCHETYPE SHIPS
// ---------------------------
// V1 proves ONE complete measurable loop rather than showcasing campaign types. Fan Recruitment is
// the only archetype whose whole chain already exists in production: a participant needs no asset,
// makes no submission, and their outcome is written by the Stripe webhook into `referrals`. Every
// other archetype needs at least one of: a VOD (Live Clip), geo scoping (Local Ambassador), or
// campaign audio assets plus song section metadata plus a campaign-scoped submission agreement plus
// moderation plus contest terms (all ten UGC archetypes, which are BLOCKED on founder decisions
// 25.4, 25.5 and 25.6, not merely unbuilt).
//
// PARTICIPANT ROLES ARE DESCRIPTIVE, NEVER AUTHORIZING.
// A role records what kind of value someone contributed. It may never decide what a user can read
// or write. `src/lib/squads.ts` made the same call ("scoped to the squad, never app-level") and the
// discipline is copied here deliberately.

import type { ConstraintType } from '@/lib/constraint/types';

/**
 * The small, stable capability set the spine understands. Nine capabilities serve all fifteen
 * archetypes in the canonical architecture; V1 implements the two Fan Recruitment needs and
 * declares the rest so a later archetype adds data rather than concepts.
 */
export type CampaignCapability =
  | 'participation'
  | 'referral_link'
  | 'submission'
  | 'assets'
  | 'ranked'
  | 'judged'
  | 'geo';

/** Capabilities the spine can actually serve today. Anything else cannot launch. */
export const IMPLEMENTED_CAPABILITIES: CampaignCapability[] = ['participation', 'referral_link'];

/** One slot of the participant toolkit. A required slot left empty blocks the launch. */
export interface ToolkitSlot {
  key: string;
  /** Artist-facing field label. */
  label: string;
  /** One sentence telling the artist what belongs here. */
  help: string;
  required: boolean;
  maxLength: number;
}

export interface CampaignIncentive {
  /**
   * V1 is `non_cash` everywhere and there is no other value. A cash incentive would need an
   * approved business rule (founder decision 25.1 keeps V1 non-cash), so the type exists to make
   * the constraint visible, not to leave a door open.
   */
  kind: 'non_cash';
  /** An EXISTING badge key from `src/lib/fanBadges.ts`. Never a new reward vocabulary. */
  badgeKey: string;
  /** What the participant is told they get. Plain, and never a promise of money. */
  description: string;
}

export interface CampaignArchetype {
  key: string;
  label: string;
  /** Artist-facing, loss-framed: what running nothing costs them. */
  summary: string;
  /**
   * The constraints this archetype may be offered for. This is the admission gate, not a
   * preference: `readConstraint` owns the diagnosis and this list only says which diagnoses this
   * archetype is a legitimate execution of.
   */
  servesConstraints: ConstraintType[];
  /** Descriptive roles a participant may take. Never authorizing. */
  acceptedRoles: string[];
  capabilities: CampaignCapability[];
  toolkit: ToolkitSlot[];
  /** Prefilled copy so the artist never meets a blank page. Editable, never auto-sent. */
  defaultToolkit: Record<string, string>;
  incentive: CampaignIncentive;
  /**
   * What CRWN can VERIFY for this archetype, in plain words. Rendered to the artist so the report
   * cannot be read as measuring more than it does.
   */
  verifiedOutcomes: string[];
  /** What CRWN genuinely cannot see. Reported as unknown, never as zero. */
  unmeasuredOutcomes: string[];
}

/**
 * Fan Recruitment. The participant asks people they actually know to join, using the referral link
 * they already have. No submission, no asset, no judging, no ranking, no prize.
 */
const FAN_RECRUITMENT: CampaignArchetype = {
  key: 'fan_recruitment',
  label: 'Fan Recruitment Drive',
  summary:
    'The fans who already love you are the cheapest distribution you will ever have, and right now none of them have been asked. A drive gives a handful of them one job, one deadline and one link.',
  servesConstraints: ['REACH', 'FIRST_PAID'],
  acceptedRoles: ['recruiter'],
  capabilities: ['participation', 'referral_link'],
  toolkit: [
    {
      key: 'what_to_do',
      label: 'The one job, in a sentence',
      help: 'What you are asking each person to actually do. One action, not a list.',
      required: true,
      maxLength: 240,
    },
    {
      key: 'why_it_matters',
      label: 'Why you are asking',
      help: 'The reason this matters to you, in your own voice. People help a person, not a platform.',
      required: true,
      maxLength: 400,
    },
    {
      key: 'share_message',
      label: 'The message they can send',
      help: 'Copy your recruiters can paste into a DM. Written by you, so it sounds like you.',
      required: true,
      maxLength: 500,
    },
  ],
  defaultToolkit: {
    what_to_do:
      'Send your link to three people who would genuinely like this, and ask them to join.',
    why_it_matters:
      'A stranger scrolling past does not know me. Someone you personally send does. That is the difference between reach and a real fan.',
    share_message:
      'I back this artist directly. If you like their music, join here and you get everything first: ',
  },
  incentive: {
    kind: 'non_cash',
    badgeKey: 'promoter',
    description:
      'Anyone whose link brings in a paying member during the drive earns the Promoter badge on this artist\'s page.',
  },
  verifiedOutcomes: [
    'Paying members brought in by a participant\'s link, recorded by the payment webhook on CRWN\'s own referral rail.',
  ],
  unmeasuredOutcomes: [
    'Free members brought in by a participant. The free join path records no referral, so CRWN cannot attribute one to anybody.',
    'Views, posts or shares on any social platform. CRWN has no social integration and will not count a number someone typed in.',
  ],
};

export const CAMPAIGN_ARCHETYPES: Record<string, CampaignArchetype> = {
  [FAN_RECRUITMENT.key]: FAN_RECRUITMENT,
};

/** Archetype keys shippable today. A key outside this list is rejected at every boundary. */
export const ARCHETYPE_KEYS = Object.keys(CAMPAIGN_ARCHETYPES);

export function archetypeFor(key: string | null | undefined): CampaignArchetype | null {
  if (!key) return null;
  return CAMPAIGN_ARCHETYPES[key] ?? null;
}

/** Required toolkit slot keys for an archetype. Empty for an unknown archetype. */
export function requiredSlots(key: string): ToolkitSlot[] {
  return (archetypeFor(key)?.toolkit ?? []).filter((s) => s.required);
}

/**
 * Can the spine actually run this archetype? An archetype declaring a capability the spine has not
 * built (submission intake, ranking, geo) is refused rather than half-run. This is what keeps a
 * future archetype honest: declare the capability, and the spine says no until it exists.
 */
export function capabilitiesSupported(a: CampaignArchetype): boolean {
  return a.capabilities.every((c) => IMPLEMENTED_CAPABILITIES.includes(c));
}
