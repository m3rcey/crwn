// Versioned experiment/journey event taxonomy.
//
// One versioned map of every journey event, grouped by stage, recording (a) whether it REUSES an
// existing CRWN event or is NEW, and (b) its financial basis: 'actual' (repository-supported real
// behavior/revenue), 'projection' (a modeled estimate), or 'none'. This is the guard behind the
// house rule: an "opportunity captured" number must be ACTUAL, never a projection. Anything without
// a reliable actual definition is marked `available: false` rather than invented.

export const TAXONOMY_VERSION = 'v1';

export type EventGroup = 'acquisition' | 'value_delivery' | 'commitment' | 'activation' | 'outcomes' | 'opportunity';
export type FinancialBasis = 'actual' | 'projection' | 'none';

export interface TaxonomyEvent {
  name: string;
  group: EventGroup;
  /** Existing CRWN event this maps to, or null if it is new to this layer. */
  reusedFrom: string | null;
  financialBasis: FinancialBasis;
  /** False when the repository has no reliable definition yet (shown as unavailable, never faked). */
  available: boolean;
}

export const TAXONOMY: TaxonomyEvent[] = [
  // ACQUISITION (reuse funnel_events / opportunity_* beacons)
  { name: 'tracked_visit', group: 'acquisition', reusedFrom: 'funnel_events.page_viewed', financialBasis: 'none', available: true },
  { name: 'opportunity_funnel_viewed', group: 'acquisition', reusedFrom: 'opportunity_funnel_viewed', financialBasis: 'none', available: true },
  { name: 'opportunity_funnel_started', group: 'acquisition', reusedFrom: 'opportunity_funnel_started', financialBasis: 'none', available: true },
  { name: 'opportunity_funnel_completed', group: 'acquisition', reusedFrom: 'opportunity_funnel_completed', financialBasis: 'none', available: true },
  { name: 'opportunity_result_viewed', group: 'acquisition', reusedFrom: 'opportunity_result_viewed', financialBasis: 'none', available: true },

  // VALUE DELIVERY (reuse journey events)
  { name: 'recommendation_viewed', group: 'value_delivery', reusedFrom: 'recommended_solution_viewed', financialBasis: 'none', available: true },
  { name: 'pre_signup_builder_started', group: 'value_delivery', reusedFrom: 'pre_signup_builder_started', financialBasis: 'none', available: true },
  { name: 'pre_signup_builder_step_completed', group: 'value_delivery', reusedFrom: 'pre_signup_builder_step_completed', financialBasis: 'none', available: true },
  { name: 'pre_signup_preview_viewed', group: 'value_delivery', reusedFrom: 'pre_signup_preview_viewed', financialBasis: 'none', available: true },
  { name: 'signup_boundary_reached', group: 'value_delivery', reusedFrom: 'signup_boundary_reached', financialBasis: 'none', available: true },

  // COMMITMENT
  { name: 'signup_prompt_viewed', group: 'commitment', reusedFrom: 'signup_prompt_viewed', financialBasis: 'none', available: true },
  { name: 'signup_started', group: 'commitment', reusedFrom: 'signup_started_from_opportunity', financialBasis: 'none', available: true },
  { name: 'signup_completed', group: 'commitment', reusedFrom: 'funnel_events.account_created', financialBasis: 'none', available: true },
  { name: 'draft_claimed', group: 'commitment', reusedFrom: 'draft_claim_completed', financialBasis: 'none', available: true },
  { name: 'onboarding_completed', group: 'commitment', reusedFrom: 'funnel_events.setup_completed', financialBasis: 'none', available: true },

  // ACTIVATION
  { name: 'recommended_action_started', group: 'activation', reusedFrom: 'funnel_events.builder_opened', financialBasis: 'none', available: true },
  { name: 'recommended_action_completed', group: 'activation', reusedFrom: 'funnel_events.builder_published', financialBasis: 'none', available: true },
  { name: 'feature_activated', group: 'activation', reusedFrom: 'opportunity_ledger.activated', financialBasis: 'none', available: true },
  { name: 'feature_published', group: 'activation', reusedFrom: 'funnel_events.builder_published', financialBasis: 'none', available: true },

  // OUTCOMES (actual behavior / revenue only)
  { name: 'first_fan_action', group: 'outcomes', reusedFrom: 'subscriptions/referral_clicks (first)', financialBasis: 'none', available: true },
  { name: 'first_purchase', group: 'outcomes', reusedFrom: 'purchases (first)', financialBasis: 'actual', available: true },
  { name: 'first_dollar', group: 'outcomes', reusedFrom: 'earnings (first, refund-netted)', financialBasis: 'actual', available: true },
  { name: 'time_to_first_dollar', group: 'outcomes', reusedFrom: 'earnings (derived)', financialBasis: 'actual', available: true },
  { name: 'seven_day_activation', group: 'outcomes', reusedFrom: 'derived', financialBasis: 'none', available: true },
  // Retention needs a stable subscription-status history; mark unavailable until a reliable source
  // is confirmed, rather than inventing a definition.
  { name: 'thirty_day_retention', group: 'outcomes', reusedFrom: null, financialBasis: 'none', available: false },

  // OPPORTUNITY (revealed = projection; captured = ACTUAL only)
  { name: 'opportunity_revealed', group: 'opportunity', reusedFrom: 'opportunity_ledger.revealed', financialBasis: 'projection', available: true },
  { name: 'opportunity_activated', group: 'opportunity', reusedFrom: 'opportunity_ledger.activated', financialBasis: 'none', available: true },
  { name: 'opportunity_captured', group: 'opportunity', reusedFrom: 'opportunity_ledger.captured', financialBasis: 'actual', available: true },
];

const BY_NAME = Object.fromEntries(TAXONOMY.map((t) => [t.name, t]));

export function getTaxonomyEvent(name: string): TaxonomyEvent | null {
  return BY_NAME[name] ?? null;
}
export function isTaxonomyEvent(name: unknown): name is string {
  return typeof name === 'string' && !!BY_NAME[name];
}
export const TAXONOMY_EVENT_NAMES: string[] = TAXONOMY.map((t) => t.name);

/** True only for events whose number represents ACTUAL money/behavior. A 'projection' event must
 *  never be presented as captured. */
export function isActualBasis(name: string): boolean {
  return BY_NAME[name]?.financialBasis === 'actual';
}
