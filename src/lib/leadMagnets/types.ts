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

/**
 * When an input is visible. `equals` is the original single-value form and still behaves exactly as
 * it did. `oneOf`/`notOneOf` and the `all` conjunction exist for real branching: only ask about
 * promoter overlap when the artist has BOTH sharers and clippers, only ask how a session is
 * structured when they are willing to go live at all.
 */
export interface LeadMagnetVisibilityRule {
  key?: string;
  equals?: string | boolean;
  oneOf?: (string | boolean)[];
  notOneOf?: (string | boolean)[];
  /** Every rule must pass. Nested one level; that is all any real branch has needed. */
  all?: LeadMagnetVisibilityRule[];
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
  // `equals` is the original single-value form. `oneOf`/`notOneOf` support real branching (only
  // ask the promoter-overlap question when the artist has BOTH sharers and clippers, only ask
  // about session structure when they are willing to go live at all). All three are optional and
  // ANDed together, so an existing `equals`-only config behaves exactly as it did.
  dependsOn?: LeadMagnetVisibilityRule;
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
  /**
   * The bare words a lead types (Instagram comment or DM) to start THIS tool's funnel. The
   * single source of truth: the acquisition orchestrator builds its keyword-pivot map from
   * these (so typing one mid-conversation switches tools), and the ManyChat trigger keywords
   * must match this list. Add a tool here and the keyword routing exists automatically.
   */
  dmKeywords: string[];
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
  /**
   * Optional entry contexts, keyed by the `?from=` value a campaign link carries (usually the slug
   * of the single-opportunity tool whose video sent them). The named steps are pulled to the front
   * so a Vault video does not open on a generic questionnaire. This REORDERS only: no question is
   * added or removed, `review` always stays last, and a tool with no entry contexts is unaffected.
   */
  entryContexts?: Record<string, { label: string; note: string; priorityStepIds: string[] }>;
  resultGeneratorKey: string;
  /**
   * When true, the tool's result is produced by its acquisition ADAPTER (the shared
   * loss-revelation engine, buildLossResult) rather than a resultGenerators.ts generator, so the
   * web page and the Instagram DM render the exact same loss result from one model. The web
   * clients route through getTool(slug).execute() for these; resultGeneratorKey is unused.
   */
  usesLossEngine?: boolean;
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
  kind:
    | 'summary'
    | 'score'
    | 'list'
    | 'checklist'
    | 'schedule'
    | 'copy'
    | 'projection'
    | 'assumptions'
    | 'nextSteps'
    | 'scenarios' // conservative / expected / high columns (reuses `metrics`)
    | 'fanLoss' // "what fans miss" callout (reuses `text`)
    | 'flow' // "how you get it back" recovery flow diagram (reuses `items` as nodes)
    | 'derivation'; // "how we got to the number" infographic chain (reuses `metrics`, last row is the total)
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
  // Loss-engine HERO: the big number the reader sees first (worth-style card). Optional; set by
  // buildLossResult from the primary monthly/yearly estimate tile. Absent for score-only tools.
  heroValue?: string;
  heroSuffix?: string;
  heroEyebrow?: string;
  // Bonus analysis shown ONLY in the emailed version, never on the free page. The reward for
  // handing over an email.
  emailInsights?: { title: string; body: string }[];
  // NUMERIC opportunity, persisted inside result_data so the handoff surfaces (Action Plan,
  // Rise Mode) can lead with a real figure without re-parsing the display tiles. Cents.
  // Set by buildLossResult when a monetary loss is known; absent for score-only tools.
  estimatedMonthlyCents?: number;
  estimatedAnnualCents?: number;
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
  consentTextVersion: string;
};
