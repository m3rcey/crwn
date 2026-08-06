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
export type LaunchPartnerQuery = 'campaign_drafted';

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

export function buildLaunchPartnerDefs(opts: { slug?: string | null }): LaunchPartnerConditionDef[] {
  const share = opts.slug ? `/${opts.slug}` : '/account/profile';
  return [
    {
      key: 'lp-stripe',
      label: 'Stripe connected',
      detail: 'Nobody can become a paid member of a page that cannot take a payment.',
      href: '/account/payouts',
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
      label: `${GUARANTEE_MIN_CONTACTS} eligible contacts imported`,
      detail: 'The warm list the private launch invites. Below this, no launch can be guaranteed.',
      href: '/studio/fans',
      role: 'required',
      source: { kind: 'check', check: 'artist_has_fan_contacts', count: GUARANTEE_MIN_CONTACTS },
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
      key: 'lp-campaign-drafted',
      label: 'Launch campaign drafted',
      detail: 'The announcement and follow-up, written and approved before anything sends.',
      href: '/studio/fans?view=campaigns',
      role: 'required',
      source: { kind: 'query', query: 'campaign_drafted' },
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
  const target = def.source.kind === 'check' ? def.source.count ?? 1 : 1;
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
