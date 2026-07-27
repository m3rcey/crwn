// Metric definitions. Every metric the admin analytics shows has an accessible definition here, so
// no number is presented without a plain-English meaning, its basis (actual vs projection), and its
// availability. Definitions are DATA (client-safe) and are surfaced in the UI as info tooltips.

export type MetricBasis = 'count' | 'rate' | 'time' | 'actual' | 'projection';

export interface MetricDefinition {
  key: string;
  label: string;
  definition: string;
  basis: MetricBasis;
  /** False when the repository cannot compute this reliably yet (shown as "unavailable"). */
  available: boolean;
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  { key: 'eligible', label: 'Eligible', basis: 'count', available: true, definition: 'Visitors who match an experiment’s eligibility and were deterministically assigned a variant (including holdout). Assignment is not exposure.' },
  { key: 'exposed', label: 'Exposed', basis: 'count', available: true, definition: 'Visitors who actually saw their assigned variant (fired an exposure event). Always less than or equal to eligible.' },
  { key: 'tool_completion', label: 'Tool Completion', basis: 'count', available: true, definition: 'Visitors who finished the calculator/tool and reached a result (opportunity_funnel_completed / result_viewed).' },
  { key: 'builder_start', label: 'Builder Start', basis: 'count', available: true, definition: 'Visitors who began building the recommended solution before signup (pre_signup_builder_started).' },
  { key: 'signup_completion', label: 'Signup Completion', basis: 'count', available: true, definition: 'Visitors who created an account after receiving value (signup_completed / account_created).' },
  { key: 'activated_artist', label: 'Activated Artist', basis: 'count', available: true, definition: 'A new artist who completed onboarding AND published or activated at least one feature. Not merely a signup.' },
  { key: 'feature_published', label: 'Feature Published', basis: 'count', available: true, definition: 'A real feature was published/activated (funnel builder_published / opportunity_ledger activated). Repository behavior, not a projection.' },
  { key: 'first_fan_action', label: 'First Fan Action', basis: 'count', available: true, definition: 'The first real fan interaction with the artist (a subscribe, a referral click, or a purchase), whichever comes first.' },
  { key: 'first_dollar', label: 'First Dollar', basis: 'actual', available: true, definition: 'The first real, refund-netted earning recorded for the artist (earnings table). Actual money, never a projection.' },
  { key: 'time_to_first_dollar', label: 'Time to First Dollar', basis: 'time', available: true, definition: 'Elapsed time from account creation to the first real earning. Median is shown; late transactions can move this after the fact.' },
  { key: 'seven_day_activation', label: 'Seven-Day Activation', basis: 'rate', available: true, definition: 'Share of new artists who published or activated a feature within seven days of signup.' },
  { key: 'thirty_day_retention', label: 'Thirty-Day Retention', basis: 'rate', available: false, definition: 'Share of artists still active 30 days after signup. Marked unavailable until a reliable subscription-status history source is confirmed; not estimated.' },
  { key: 'opportunity_revealed', label: 'Opportunity Revealed', basis: 'projection', available: true, definition: 'The modeled dollar opportunity a calculator surfaced (opportunity_ledger revealed). A PROJECTION, shown separately from actual money.' },
  { key: 'opportunity_activated', label: 'Opportunity Activated', basis: 'count', available: true, definition: 'The artist turned on the feature that can capture the revealed opportunity (opportunity_ledger activated). Turning it on, not money earned.' },
  { key: 'opportunity_captured', label: 'Opportunity Captured', basis: 'actual', available: true, definition: 'Actual, refund-netted revenue recorded against the opportunity (opportunity_ledger captured, from real earnings). Never a projection.' },
];

const BY_KEY = Object.fromEntries(METRIC_DEFINITIONS.map((m) => [m.key, m]));
export function getMetricDefinition(key: string): MetricDefinition | null {
  return BY_KEY[key] ?? null;
}
export function metricIsAvailable(key: string): boolean {
  return !!BY_KEY[key]?.available;
}
