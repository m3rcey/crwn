// Holistic experience experimentation: the CODE registry.
//
// Experiences, variants, and experiment CONFIGURATIONS are defined here, in reviewed code, NEVER as
// remote/arbitrary JSON. A DB `experiments` row only carries OPERATIONAL state (status, allocation,
// conclusion, winner, notes) and references a config by `key`. An experiment can therefore never
// introduce new behavior, execute code, or override pricing/fees/ownership/permissions/RLS: it can
// only select among prebuilt, reviewed configurations and tag journeys for measurement.
//
// An "experience" is a COMPLETE journey (source -> tool -> result -> recommendation -> builder ->
// signup timing -> onboarding -> first success), which in CRWN maps to an Opportunity Funnel.
//
// Client-safe DATA only. Private fields (hypothesis, metrics, notes) are stripped by
// `toPublicExperiment` before anything reaches a browser.

export type ExperimentStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'archived';

/** A complete journey under test. Keyed by opportunity so it aligns with the funnel layer. */
export interface ExperienceDef {
  key: string;
  opportunityKey: string;
  toolKey: string;
  title: string;
  /** The ordered journey stages this experience is measured across (taxonomy event names). */
  journey: string[];
}

/** One arm of an experiment. `config` selects among PREBUILT, reviewed journey options only. */
export interface VariantDef {
  key: string;
  title: string;
  /** Human description of what differs. The actual behavior is prebuilt code keyed by these enums. */
  isControl?: boolean;
  config: {
    /** Where signup is asked. Prebuilt options only. */
    signupBoundary?: 'preview' | 'save' | 'publish';
    /** How much the builder prefills. Prebuilt options only. */
    prefill?: 'none' | 'minimal' | 'full';
  };
}

export interface ExperimentConfigDef {
  key: string;
  title: string;
  hypothesis: string;
  experienceKeys: string[];
  variants: VariantDef[];
  primaryMetric: string;
  secondaryMetrics: string[];
  /** Config version. Bump when variants/metrics change so old exposures keep their meaning. */
  configVersion: string;
}

// ---- Experiences (approved). Own Your Fans + Streaming Loss today; add more with no rewrite. ----
export const EXPERIENCES: ExperienceDef[] = [
  {
    key: 'own-your-fans',
    opportunityKey: 'own-your-fans',
    toolKey: 'own-your-fans-calculator',
    title: 'Own Your Fans',
    journey: [
      'tracked_visit',
      'opportunity_funnel_viewed',
      'opportunity_funnel_started',
      'opportunity_funnel_completed',
      'opportunity_result_viewed',
      'recommendation_viewed',
      'pre_signup_builder_started',
      'pre_signup_preview_viewed',
      'signup_boundary_reached',
      'signup_completed',
      'draft_claimed',
      'onboarding_completed',
      'feature_published',
      'first_fan_action',
      'first_dollar',
    ],
  },
  {
    key: 'streaming-loss',
    opportunityKey: 'streaming-loss',
    toolKey: 'worth',
    title: 'Streaming Loss',
    journey: [
      'tracked_visit',
      'opportunity_funnel_viewed',
      'opportunity_funnel_started',
      'opportunity_funnel_completed',
      'opportunity_result_viewed',
      'recommendation_viewed',
      'signup_boundary_reached',
      'signup_completed',
      'onboarding_completed',
      'feature_published',
      'first_dollar',
    ],
  },
];

// ---- Experiment configurations (prebuilt, reviewed). NONE runs by default; status lives in DB. ----
//
// RETIRED 2026-08-24: `oyf-signup-timing-v1` (Own Your Fans signup timing) was deleted on the
// founder's call. Content now routes a DIFFERENT calculator per carousel post, so Own Your Fans
// no longer receives one coherent traffic stream, and an arm-vs-arm readout over traffic whose
// composition changes with the posting schedule measures the schedule, not the boundary.
//
// Deleting the CONFIG is the whole kill switch and needs no database write:
// getRunningExperimentForExperience() looks every running row up by key and skips any row whose
// config is absent, so even a row still marked `running` assigns nothing. Every consumer already
// fails safe to the control arm (FanCaptureBuilder defaults signupBoundary to 'save'), so the
// product behavior is the control behavior, unchanged.
//
// Re-run it later by restoring the config block from git history; the machinery is untouched.
export const EXPERIMENT_CONFIGS: ExperimentConfigDef[] = [
  {
    key: 'primary-experience-v1',
    title: 'Primary experience: Own Your Fans vs Streaming Loss',
    hypothesis:
      'Own Your Fans produces more activated artists (published features) per calculator completion than Streaming Loss.',
    experienceKeys: ['own-your-fans', 'streaming-loss'],
    variants: [
      { key: 'streaming-loss', title: 'Streaming Loss', isControl: true, config: {} },
      { key: 'own-your-fans', title: 'Own Your Fans', config: {} },
    ],
    primaryMetric: 'activated_artist_rate',
    secondaryMetrics: ['builder_start_rate', 'signup_completion_rate', 'first_dollar_rate'],
    configVersion: '1',
  },
];

const EXPERIENCE_BY_KEY = Object.fromEntries(EXPERIENCES.map((e) => [e.key, e]));
const CONFIG_BY_KEY = Object.fromEntries(EXPERIMENT_CONFIGS.map((c) => [c.key, c]));

export function getExperience(key: string): ExperienceDef | null {
  return EXPERIENCE_BY_KEY[key] ?? null;
}
export function getExperimentConfig(key: string): ExperimentConfigDef | null {
  return CONFIG_BY_KEY[key] ?? null;
}
export function isKnownExperience(key: string): boolean {
  return !!EXPERIENCE_BY_KEY[key];
}
export function isKnownVariant(experimentKey: string, variantKey: string): boolean {
  return !!CONFIG_BY_KEY[experimentKey]?.variants.some((v) => v.key === variantKey);
}

/** The browser-safe projection of an experiment config: keys + variant keys + allocations ONLY.
 *  Hypothesis, metrics, and notes are NEVER sent to a browser. */
export interface PublicExperiment {
  key: string;
  configVersion: string;
  experienceKeys: string[];
  variants: { key: string; isControl: boolean }[];
}
export function toPublicExperiment(cfg: ExperimentConfigDef): PublicExperiment {
  return {
    key: cfg.key,
    configVersion: cfg.configVersion,
    experienceKeys: cfg.experienceKeys,
    variants: cfg.variants.map((v) => ({ key: v.key, isControl: !!v.isControl })),
  };
}
