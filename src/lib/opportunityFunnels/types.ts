// Shared Opportunity Funnel model.
//
// One typed representation of a public tool as a measurable funnel: a fan arrives from a source
// (video / campaign / DM keyword), runs a tool, sees a loss/gap/readiness reveal, gets a
// recommendation, and (later) builds the fix in CRWN. This layer does NOT replace the existing
// lead-magnet registry, adapters, or result generators. It is a typed VIEW over them plus the few
// dimensions they do not carry today (lifecycle, promotion, versions, availability, attribution).
//
// IMPORTANT: this module is imported into CLIENT bundles. It holds DATA only, never secrets,
// service logic, or React. Internal-only fields (internalTitle, internalNotes, unavailableReason)
// must be stripped with `toPublicFunnel` before anything is sent to a browser as public config.

/** Operational state of a funnel. Mirrors the founder-supplied set. */
export type FunnelLifecycleStatus = 'draft' | 'internal' | 'active' | 'paused' | 'archived';

/** How hard a funnel is promoted. Orthogonal to lifecycle. Configurable, never a permanent tier. */
export type FunnelPromotionStatus = 'primary' | 'secondary' | 'none';

/** Descriptive kind, for labelling only. Never gates behavior. */
export type FunnelToolType = 'calculator' | 'planner' | 'builder' | 'quiz' | 'diagnostic';

/** The latest point a fan can go before signup is required. Descriptive; not enforced here. */
export type FunnelAuthBoundary =
  | 'anonymous' // usable start to finish with no account (result is still claimable later)
  | 'signup_to_save' // free to run + see the result; account needed only to save/claim it
  | 'signup_to_build' // free to run + see the result; account needed to build the fix
  | 'authenticated'; // requires an account up front

/** Channels a funnel can be attributed across. */
export type FunnelChannel = 'web' | 'instagram';

export interface OpportunityFunnel {
  // ---- Identity ----
  /** Stable key for the TOOL (the registry slug or external key). Never reused. */
  toolKey: string;
  /** Stable key for the OPPORTUNITY the tool reveals. Two tools may map to one opportunity. */
  opportunityKey: string;

  // ---- Presentation ----
  publicTitle: string;
  /** Internal-only. Stripped by toPublicFunnel. */
  internalTitle: string;
  description: string;
  category: string;
  toolType: FunnelToolType;

  // ---- Routing + keywords ----
  aliases: string[];
  dmKeywords: string[];
  publicRoute: string;
  resultRoute: string | null;
  /** An existing builder to prefill, if one exists. Null when there is no dedicated builder. */
  builderRoute: string | null;
  recommendedFeature: string;
  /** The most repository-supported next surface after the result. May be null. */
  recommendedNextRoute: string | null;

  // ---- Schema + version references ----
  /** Reference to the input schema / adapter (e.g. calculatorId or resultGeneratorKey). */
  inputSchemaRef: string | null;
  /** Reference to the result schema (e.g. 'lossResult' or the generator key). */
  resultSchemaRef: string | null;
  /** Version of the funnel DEFINITION (this layer), distinct from resultVersion. */
  toolVersion: string;
  /** Version of the published RESULT (the calculator/diagnostic output). Preserved on migration. */
  resultVersion: string;

  // ---- Availability + gating ----
  anonymousAvailable: boolean;
  authBoundary: FunnelAuthBoundary;
  lifecycle: FunnelLifecycleStatus;
  promotion: FunnelPromotionStatus;
  /** Lower sorts earlier. Lets a funnel be promoted without hardcoding every other into a tier. */
  promotionRank: number;
  /** admin_settings key gating the UNDERLYING feature, if any. Informational; enforced elsewhere. */
  featureFlag: string | null;
  supported: boolean;
  /** Internal-only reason a funnel is unsupported/paused. Stripped by toPublicFunnel. */
  unavailableReason: string | null;

  // ---- Attribution + analytics ----
  sourceVideoCompatible: boolean;
  campaignCompatible: boolean;
  attributionChannels: FunnelChannel[];
  analytics: { toolId: string; promotedFeature: string; category: string };

  // ---- Disclaimers ----
  requiresEstimateDisclaimer: boolean;
  requiresLegalDisclaimer: boolean;

  // ---- Internal notes (never client) ----
  internalNotes: string | null;
}

/** The browser-safe projection: no internal titles, notes, or reasons. */
export interface PublicOpportunityFunnel {
  toolKey: string;
  opportunityKey: string;
  publicTitle: string;
  description: string;
  category: string;
  toolType: FunnelToolType;
  publicRoute: string;
  resultRoute: string | null;
  builderRoute: string | null;
  recommendedFeature: string;
  recommendedNextRoute: string | null;
  promotion: FunnelPromotionStatus;
  promotionRank: number;
  anonymousAvailable: boolean;
  requiresEstimateDisclaimer: boolean;
  requiresLegalDisclaimer: boolean;
}
