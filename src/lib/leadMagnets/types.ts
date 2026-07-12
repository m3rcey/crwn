// Shared types for the CRWN Lead Magnet system.
//
// One typed registry drives 30-capable tools (4 built today). A config points a
// public/protected page at: an input schema, wizard steps, a deterministic result
// generator, a result renderer spec, a CTA, a conversion adapter, disclaimer
// behavior, and analytics metadata.
//
// IMPORTANT: configs are imported into CLIENT bundles. Never put secrets, service
// logic, or React components here. Result generation is a pure function keyed by
// `resultGeneratorKey` (see resultGenerators.ts) so it stays deterministic + testable.

export type LeadMagnetInputType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency' // dollars in the UI; persisted as integer cents
  | 'percentage'
  | 'date'
  | 'url'
  | 'email'
  | 'phone'
  | 'toggle'
  | 'option' // single-choice -> OptionSelect (3+ options)
  | 'binary' // exactly two choices -> two buttons
  | 'checkboxGroup'
  | 'tags';

export interface LeadMagnetInputOption {
  value: string;
  label: string;
  hint?: string;
  icon?: string; // emoji only (configs are client-safe data, no JSX)
}

export interface LeadMagnetInputDefinition {
  key: string;
  type: LeadMagnetInputType;
  label: string;
  help?: string;
  placeholder?: string;
  example?: string;
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  options?: LeadMagnetInputOption[];
  // Show this input only when another input's value matches (dependent questions).
  dependsOn?: { key: string; equals: string | boolean };
  // Which wizard step this input renders on.
  step: string;
}

export interface LeadMagnetWizardStep {
  id: string;
  group: string; // orientation chip (e.g. "Inventory", "Offer")
  title: string;
  subtitle?: string;
}

export interface LeadMagnetResultSectionDefinition {
  key: string;
  title: string;
  // Whether this section is shown in the PUBLIC preview before lead capture.
  // (Also gated by config.publicPreviewSections for belt-and-suspenders.)
  preview?: boolean;
}

export type ConversionType =
  | 'live_feature' // prefill/navigate into an existing live builder
  | 'prefilled_existing_flow'
  | 'saved_plan' // no live feature: store as draft, "Build in CRWN later"
  | 'feature_flagged';

export interface LeadMagnetConfig {
  slug: string;
  name: string;
  featureName: string;
  category: string;
  description: string;
  videoAngle: string;
  publicRoute: string;
  artistRoute: string;
  icon: string; // emoji for directory cards
  timeToComplete: string; // e.g. "3 min"
  hero: {
    eyebrow?: string;
    headline: string;
    subheadline: string;
    primaryCta: string;
    /** Photo shown on the public tool page. Required, so a new tool cannot ship without one. */
    image: string;
    /** Alt text for that photo. */
    imageAlt: string;
  };
  inputs: LeadMagnetInputDefinition[];
  wizardSteps: LeadMagnetWizardStep[];
  resultGeneratorKey: string;
  resultSections: LeadMagnetResultSectionDefinition[];
  publicPreviewSections: string[]; // section keys shown before capture
  leadCapture: {
    required: boolean;
    consentCopy: string;
  };
  cta: {
    publicPrimary: string;
    publicSecondary?: string;
    artistPrimary: string;
    artistSecondary?: string;
  };
  conversionTarget: {
    type: ConversionType;
    label: string;
    route?: string; // builder route for prefill navigation
    adapterKey?: string; // key into conversionAdapters.ts
    requiresProCapability?: string; // e.g. 'allowsClipper' -> show UpgradePrompt
  };
  requiresEstimateDisclaimer: boolean;
  requiresLegalDisclaimer?: boolean;
  analyticsMetadata: {
    toolId: string;
    category: string;
    promotedFeature: string;
  };
}

// ---- Runtime values ----

export type LeadMagnetInputValues = Record<string, string | number | boolean | string[] | null>;

// A rendered result section. `body` is renderer-agnostic structured content.
export interface ResultSection {
  key: string;
  title: string;
  kind: 'summary' | 'score' | 'list' | 'checklist' | 'schedule' | 'copy' | 'projection' | 'assumptions' | 'nextSteps';
  // score
  score?: number;
  scoreMax?: number;
  scoreLabel?: string;
  // summary / copy
  text?: string;
  // list / checklist / nextSteps
  items?: string[];
  // schedule
  rows?: { when: string; what: string }[];
  // projection
  metrics?: { label: string; value: string; note?: string }[];
}

export interface GeneratedResult {
  generatorVersion: string;
  headline: string;
  summary: string;
  sections: ResultSection[];
  // Structured payload the conversion adapter maps into a live feature.
  conversionPayload: Record<string, unknown>;
  // A short, share-safe teaser that never contains private inputs.
  shareSummary: string;
}

export type LeadCapturePayload = {
  email: string;
  artistName?: string;
  phone?: string;
  genre?: string;
  socialHandle?: string;
  monthlyListeners?: number;
  mainGoal?: string;
  emailConsent: boolean;
  smsConsent?: boolean;
  consentTextVersion: string;
};
