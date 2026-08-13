// The First Paid Member Guarantee checklist (First Revenue Launch offer,
// 2026-08-06).
//
// The guarantee for the launch-partner cohort is only meaningful if BOTH sides
// can see whether its conditions are met, live, from real data. This module is
// the pure brain: the condition list, the sources they are measured from, and
// the eligibility verdict. It follows artistRoadmap.ts exactly: 'check'
// conditions are evaluated by the Quest Engine's own evaluateCondition (so this
// can never disagree with the quests or the roadmap), 'query' conditions are
// the two reads the evaluator has no DomainCheck for. Derived on read, stored
// nowhere; the ONLY stored value is the cohort flag
// (artist_profiles.launch_partner, migration schema-phase2-launch-partner.sql,
// fail-soft before it runs, server-side reads only).
//
// This is NOT a second progression system and grants no XP. It is a contract
// made visible: every required action maps to something the artist actually
// does in the product, and the verdict is evidence, not a promise.

import type { DomainCheck } from '@/lib/quests/types';

/** Reads the evaluator has no DomainCheck for. */
export type LaunchPartnerQuery = 'eligible_contacts';

export type LaunchPartnerSource =
  | { kind: 'check'; check: DomainCheck; count?: number }
  | { kind: 'query'; query: LaunchPartnerQuery };

export interface LaunchPartnerConditionDef {
  key: string;
  label: string;
  /** One plain sentence: why the guarantee needs this. */
  detail: string;
  /** Where the artist does it. Real routes only. */
  href: string;
  /** Required conditions gate eligibility; the outcome is what the guarantee promises. */
  role: 'required' | 'outcome';
  source: LaunchPartnerSource;
}

export interface LaunchPartnerConditionResult {
  done: boolean;
  current: number;
  target: number;
}

export type LaunchPartnerCondition = LaunchPartnerConditionDef & LaunchPartnerConditionResult;

export type LaunchPartnerStatus = 'pending' | 'eligible' | 'achieved';

export interface LaunchPartnerChecklist {
  conditions: LaunchPartnerCondition[];
  /** pending = required work remains; eligible = every required condition met,
   *  the guarantee is active; achieved = the first paid member is in. */
  status: LaunchPartnerStatus;
  requiredDone: number;
  requiredTotal: number;
  /** The first open required condition (null when eligible or achieved). */
  nextCondition: LaunchPartnerCondition | null;
}

/** The minimum imported contacts the guarantee requires. The private launch
 *  needs a warm list to invite; below this the odds are not worth guaranteeing. */
export const GUARANTEE_MIN_CONTACTS = 100;

/** The quality alternative (founder review, 2026-08-06): a smaller list of
 *  PROVEN buyers beats a bigger list of strangers, so 40 imported contacts who
 *  already paid the artist monthly (Patreon-tagged by the import) satisfy the
 *  requirement on their own. Quantity or quality; either path opens the gate. */
export const GUARANTEE_MIN_PROVEN_BUYERS = 40;

/**
 * The eligible-contacts verdict, pure. Done on EITHER path; progress is
 * reported along whichever path is closer, so an artist importing 35 Patreon
 * members sees "35 of 40 proven buyers", not "35 of 100".
 */
export function eligibleContactsResult(
  totalContacts: number,
  provenBuyers: number,
): LaunchPartnerConditionResult {
  const total = Math.max(0, Math.floor(totalContacts) || 0);
  const proven = Math.max(0, Math.floor(provenBuyers) || 0);
  const done = total >= GUARANTEE_MIN_CONTACTS || proven >= GUARANTEE_MIN_PROVEN_BUYERS;
  // Cross-multiplied ratio compare: proven/40 vs total/100, no floats.
  const provenCloser = proven * GUARANTEE_MIN_CONTACTS > total * GUARANTEE_MIN_PROVEN_BUYERS;
  return provenCloser
    ? { done, current: proven, target: GUARANTEE_MIN_PROVEN_BUYERS }
    : { done, current: total, target: GUARANTEE_MIN_CONTACTS };
}

export function buildLaunchPartnerDefs(opts: { slug?: string | null }): LaunchPartnerConditionDef[] {
  const share = opts.slug ? `/${opts.slug}` : '/account/profile';
  return [
    {
      key: 'lp-stripe',
      label: 'Stripe connected',
      detail: 'Nobody can become a paid member of a page that cannot take a payment.',
      // The Connect Stripe control lives on the tiers screen, not the payouts screen. See the
      // same correction on the roadmap's `foundation-stripe` step.
      href: '/account/tiers',
      role: 'required',
      source: { kind: 'check', check: 'artist_stripe_connected' },
    },
    {
      key: 'lp-free-tier',
      label: 'Free front door live',
      detail: 'The free tier is where invited fans land before they pay.',
      href: '/account/tiers',
      role: 'required',
      source: { kind: 'check', check: 'artist_has_free_tier' },
    },
    {
      key: 'lp-paid-purchasable',
      label: 'Paid tier purchasable',
      detail: 'A paid tier with a real Stripe price behind it. The offer the guarantee stands on.',
      href: '/account/tiers',
      role: 'required',
      source: { kind: 'check', check: 'artist_tier_purchasable' },
    },
    {
      key: 'lp-contacts',
      label: `${GUARANTEE_MIN_CONTACTS} contacts imported, or ${GUARANTEE_MIN_PROVEN_BUYERS} proven buyers`,
      detail: 'The warm list the private launch invites. A smaller list of fans who already paid you counts on its own.',
      href: '/studio/fans?import=1',
      role: 'required',
      source: { kind: 'query', query: 'eligible_contacts' },
    },
    {
      key: 'lp-welcome-post',
      label: 'Welcome post published',
      detail: 'The first thing an invited fan sees inside. An empty community kills the invite.',
      href: '/community',
      role: 'required',
      source: { kind: 'check', check: 'artist_has_community_post' },
    },
    {
      key: 'lp-campaign-sent',
      label: 'Launch campaign sent',
      detail: 'The guarantee covers a launch that happened, not one that was planned.',
      href: '/studio/fans?view=campaigns',
      role: 'required',
      source: { kind: 'check', check: 'artist_sent_campaign' },
    },
    {
      key: 'lp-first-paid-member',
      label: 'First paid member',
      detail: 'The outcome the guarantee promises: one real membership or sale.',
      href: share,
      role: 'outcome',
      source: { kind: 'check', check: 'artist_revenue_milestone', count: 100 },
    },
  ];
}

function defaultResult(def: LaunchPartnerConditionDef): LaunchPartnerConditionResult {
  const target =
    def.source.kind === 'check'
      ? def.source.count ?? 1
      : def.source.query === 'eligible_contacts'
        ? GUARANTEE_MIN_CONTACTS
        : 1;
  return { done: false, current: 0, target };
}

/** Pure assembly: same inputs, same checklist. Missing results fail safe to not-done. */
export function assembleLaunchPartnerChecklist(
  defs: LaunchPartnerConditionDef[],
  results: Record<string, LaunchPartnerConditionResult | undefined>,
): LaunchPartnerChecklist {
  const conditions: LaunchPartnerCondition[] = defs.map((def) => ({
    ...def,
    ...(results[def.key] ?? defaultResult(def)),
  }));

  const required = conditions.filter((c) => c.role === 'required');
  const requiredDone = required.filter((c) => c.done).length;
  const outcome = conditions.find((c) => c.role === 'outcome');

  const status: LaunchPartnerStatus = outcome?.done
    ? 'achieved'
    : requiredDone === required.length
      ? 'eligible'
      : 'pending';

  return {
    conditions,
    status,
    requiredDone,
    requiredTotal: required.length,
    nextCondition: status === 'pending' ? required.find((c) => !c.done) ?? null : null,
  };
}
