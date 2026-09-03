// The Opportunity Funnel registry: one assembled, typed view over the existing tool registries.
//
// SOURCE OF TRUTH stays in src/lib/leadMagnets/registry.ts (LEAD_MAGNETS + EXTERNAL_TOOLS). This
// module reads those and layers the funnel-only dimensions (lifecycle, promotion, versions,
// availability, attribution) via a small OVERLAY. Nothing here duplicates a tool definition, so a
// new tool joins the funnel architecture automatically the moment it is added to the base registry.
//
// Client-safe: imports DATA only. No adapters, no server helpers, no React.

import { LEAD_MAGNETS, EXTERNAL_TOOLS } from '../leadMagnets/registry';
import type {
  FunnelAuthBoundary,
  FunnelChannel,
  FunnelLifecycleStatus,
  FunnelPromotionStatus,
  FunnelToolType,
  OpportunityFunnel,
  PublicOpportunityFunnel,
} from './types';

/** Per-tool overlay: only the dimensions the base registry does not already carry. */
interface FunnelOverlay {
  opportunityKey?: string;
  toolType?: FunnelToolType;
  lifecycle?: FunnelLifecycleStatus;
  promotion?: FunnelPromotionStatus;
  promotionRank?: number;
  featureFlag?: string | null;
  supported?: boolean;
  unavailableReason?: string | null;
  anonymousAvailable?: boolean;
  authBoundary?: FunnelAuthBoundary;
  builderRoute?: string | null;
  recommendedNextRoute?: string | null;
  attributionChannels?: FunnelChannel[];
  sourceVideoCompatible?: boolean;
  campaignCompatible?: boolean;
  requiresLegalDisclaimer?: boolean;
  toolVersion?: string;
  resultVersion?: string;
  internalNotes?: string | null;
}

// Overlays are keyed by the STABLE toolKey. Anything not listed uses the neutral defaults below,
// so tool priority is NEVER permanently hardcoded: only Own Your Fans (primary) and the original
// Worth funnel (secondary) are ranked here; every other tool is neutral 'none' and can be promoted
// later by editing its overlay (or, in a later phase, an admin_settings override) with no code move.
/**
 * PROMOTED SET — the calculators this phase actually drives content to (2026-08-13;
 * live-experience re-promoted 2026-08-16).
 *
 * Derived, not hardcoded per tool: anything NOT in this set defaults to lifecycle 'paused', so
 * adding the 21st calculator cannot silently promote itself, and removing one from this set is a
 * one-line decision. Chosen from the CONTENT INVENTORY, not from which features survived the
 * surface reduction: these six are the only prefixes with scripts driving them (51 scripts across
 * worth/vault/share/producer/own/free+plan in videos/scripts/lead-magnets).
 *
 * PAUSED MEANS REMOVED FROM DISCOVERY. It does NOT mean the route is off, the slug changed, the
 * DM keyword stopped resolving, a result link broke, or a CTA moved. The ONLY consumer of
 * `lifecycle` is the /tools directory filter in LeadMagnetDirectory. Keywords are derived from
 * each config's `dmKeywords` in orchestration.ts and are untouched, so an Instagram comment on a
 * two-year-old Reel still starts the same conversation and still returns the same tokenized
 * result. That is the whole point of pausing rather than deleting.
 */
export const PROMOTED_TOOL_KEYS: ReadonlySet<string> = new Set([
  'worth',                      // WORTH / Streaming Loss
  'vault-revenue-planner',      // VAULT
  'share-to-earn-planner',      // SHARE
  'executive-producer-session', // PRODUCER
  'own-your-fans-calculator',   // OWN
  'opportunity-calculator',     // FREE / PLAN
  // Re-promoted 2026-08-16 (founder decision): Live Experiences is actively promoted in content
  // alongside Executive Producer Sessions, and the two are deliberate siblings (EP sells one
  // seat in the room; this sells the show itself). Same keyword as always: LIVE.
  'live-experience-calculator', // LIVE
  // Re-promoted 2026-08-20 (founder decision): the Between-Tour and Proof of Demand calculators
  // return to the directory with the full promoted-tool contract (doorway, trimmed hero copy,
  // illustrated hero), same as the Live Experience re-promotion. Keywords unchanged.
  'between-tour-calculator',      // TOUR / TOURING
  'proof-of-demand-test-builder', // PROOF / DEMAND
]);

/** A tool's lifecycle: its overlay wins, otherwise promoted -> active, everything else paused. */
function lifecycleFor(toolKey: string, overlay: FunnelOverlay): OpportunityFunnel['lifecycle'] {
  if (overlay.lifecycle) return overlay.lifecycle;
  return PROMOTED_TOOL_KEYS.has(toolKey) ? 'active' : 'paused';
}

const OVERLAYS: Record<string, FunnelOverlay> = {
  'own-your-fans-calculator': {
    opportunityKey: 'own-your-fans',
    toolType: 'calculator',
    lifecycle: 'active',
    promotion: 'primary',
    promotionRank: 0,
    authBoundary: 'signup_to_build',
    // No dedicated Own Your Fans builder exists; the owned-CRM surface is /studio/fans (AudienceTab).
    builderRoute: null,
    recommendedNextRoute: '/studio/fans',
    resultVersion: 'lossResult@1',
    internalNotes:
      'Confirmed primary funnel. Reveals rented (third-party) vs owned (first-party) audience. No dedicated builder; recommended next surface is the owned-CRM at /studio/fans.',
  },
  worth: {
    opportunityKey: 'streaming-loss',
    toolType: 'calculator',
    lifecycle: 'active',
    promotion: 'secondary',
    promotionRank: 1,
    // Worth runs on its own page (/worth); it joins the metadata layer only, behavior unchanged.
    recommendedNextRoute: null,
    resultVersion: 'leadCalculator@1',
    internalNotes: 'Original public funnel. Standalone page; connected to shared metadata only, no behavior change.',
  },
  // Dark-launched underlying features: recorded here as metadata only (enforcement stays in each
  // feature's own admin_settings gate). Lifecycle stays 'active' so today's directory is unchanged.
  // Quest Path takes no inputs and its adapter stamps `questPath@1`, NOT the loss engine's
  // lossResult@1, so its resultVersion is set explicitly here for the same reason royalty's is
  // below: leaving it to default would stamp every quest-path event with the shared label and pool
  // it with sixteen other tools' results.
  'artist-quest-path': { featureFlag: 'quest_engine', resultVersion: 'questPath@1' },
  // Royalty is score-only via its own adapter (readiness@1), not the loss engine's lossResult@1, so
  // its resultVersion is set explicitly here or every royalty analytics event would be mislabeled.
  'royalty-readiness-check': { featureFlag: 'royalty_readiness', resultVersion: 'readiness@1' },
  'executive-producer-session': { featureFlag: 'producer_sessions' },
  // The all-in-one calculator. Its result comes from the unified model, NOT the shared loss engine,
  // so resultVersion is set explicitly here. Leaving it to default would stamp every one of its
  // analytics events 'lossResult@1' and silently pool them with sixteen other tools' results, the
  // exact mislabelling the royalty overlay above exists to prevent.
  //
  // Promotion stays 'secondary'. The old reason (Own Your Fans was the assigned experience of a
  // running signup-timing experiment) expired when that experiment was retired on 2026-08-24, so
  // promoting this to primary is now a plain founder call with nothing blocking it. Worth knowing
  // before making it: `promotion`/`promotionRank` order the /tools directory and label the admin
  // table, and nothing else reads them. They do not decide where a link, a DM keyword or a
  // carousel CTA lands.
  'opportunity-calculator': {
    opportunityKey: 'crwn-opportunity',
    toolType: 'calculator',
    lifecycle: 'active',
    promotion: 'secondary',
    promotionRank: 2,
    authBoundary: 'signup_to_save',
    // The membership is built through Rise Mode's guided offer flow (D2, 2026-09-03).
    builderRoute: '/build/offer',
    recommendedNextRoute: '/build/offer',
    resultVersion: 'unifiedOpportunity@1',
    internalNotes:
      'The all-in-one calculator. Models every opportunity in ONE layered model so the same fan, subscriber and dollar cannot be counted twice. Entry contexts let a single-opportunity video (vault, share, clip, live, worth, own-your-fans) lead with its own questions.',
  },
};

function toFunnelFromLeadMagnet(cfg: (typeof LEAD_MAGNETS)[number]): OpportunityFunnel {
  const o = OVERLAYS[cfg.slug] ?? {};
  return {
    toolKey: cfg.slug,
    opportunityKey: o.opportunityKey ?? cfg.slug,
    publicTitle: cfg.name,
    internalTitle: cfg.analyticsMetadata.toolId,
    description: cfg.description,
    category: cfg.category,
    toolType: o.toolType ?? 'calculator',
    aliases: [cfg.slug, ...cfg.dmKeywords],
    dmKeywords: cfg.dmKeywords,
    publicRoute: cfg.publicRoute,
    resultRoute: `${cfg.publicRoute}/result`,
    builderRoute: o.builderRoute ?? null,
    recommendedFeature: cfg.featureName,
    recommendedNextRoute: o.recommendedNextRoute ?? null,
    inputSchemaRef: cfg.resultGeneratorKey,
    resultSchemaRef: cfg.usesLossEngine ? 'lossResult' : cfg.resultGeneratorKey,
    toolVersion: o.toolVersion ?? '1',
    resultVersion: o.resultVersion ?? (cfg.usesLossEngine ? 'lossResult@1' : '1.0.0'),
    anonymousAvailable: o.anonymousAvailable ?? true,
    authBoundary: o.authBoundary ?? 'signup_to_save',
    lifecycle: lifecycleFor(cfg.slug, o),
    promotion: o.promotion ?? 'none',
    promotionRank: o.promotionRank ?? 100,
    featureFlag: o.featureFlag ?? null,
    supported: o.supported ?? true,
    unavailableReason: o.unavailableReason ?? null,
    sourceVideoCompatible: o.sourceVideoCompatible ?? true,
    campaignCompatible: o.campaignCompatible ?? true,
    attributionChannels: o.attributionChannels ?? ['web', 'instagram'],
    analytics: {
      toolId: cfg.analyticsMetadata.toolId,
      promotedFeature: cfg.analyticsMetadata.promotedFeature,
      category: cfg.analyticsMetadata.category,
    },
    requiresEstimateDisclaimer: cfg.requiresEstimateDisclaimer,
    requiresLegalDisclaimer: o.requiresLegalDisclaimer ?? !!cfg.requiresLegalDisclaimer,
    internalNotes: o.internalNotes ?? null,
  };
}

function toFunnelFromExternal(t: (typeof EXTERNAL_TOOLS)[number]): OpportunityFunnel {
  const o = OVERLAYS[t.key] ?? {};
  return {
    toolKey: t.key,
    opportunityKey: o.opportunityKey ?? t.key,
    publicTitle: t.name,
    internalTitle: t.key,
    description: t.description,
    category: t.category,
    toolType: o.toolType ?? 'calculator',
    // The DM keyword for Worth is patched in by the orchestrator (it is not a LeadMagnetConfig).
    aliases: [t.key],
    dmKeywords: [t.key],
    publicRoute: t.href,
    resultRoute: null,
    builderRoute: o.builderRoute ?? null,
    recommendedFeature: t.featureName,
    recommendedNextRoute: o.recommendedNextRoute ?? null,
    inputSchemaRef: t.key,
    resultSchemaRef: 'leadCalculator',
    toolVersion: o.toolVersion ?? '1',
    resultVersion: o.resultVersion ?? 'leadCalculator@1',
    anonymousAvailable: o.anonymousAvailable ?? true,
    authBoundary: o.authBoundary ?? 'signup_to_save',
    lifecycle: lifecycleFor(t.key, o),
    promotion: o.promotion ?? 'none',
    promotionRank: o.promotionRank ?? 100,
    featureFlag: o.featureFlag ?? null,
    supported: o.supported ?? true,
    unavailableReason: o.unavailableReason ?? null,
    sourceVideoCompatible: o.sourceVideoCompatible ?? true,
    campaignCompatible: o.campaignCompatible ?? true,
    attributionChannels: o.attributionChannels ?? ['web', 'instagram'],
    analytics: { toolId: t.key, promotedFeature: t.featureName, category: t.category },
    requiresEstimateDisclaimer: true,
    requiresLegalDisclaimer: o.requiresLegalDisclaimer ?? false,
    internalNotes: o.internalNotes ?? null,
  };
}

/** The assembled funnels. Built once at module load from the base registries. */
export const OPPORTUNITY_FUNNELS: OpportunityFunnel[] = [
  ...LEAD_MAGNETS.map(toFunnelFromLeadMagnet),
  ...EXTERNAL_TOOLS.map(toFunnelFromExternal),
];

const BY_TOOL_KEY: Record<string, OpportunityFunnel> = Object.fromEntries(
  OPPORTUNITY_FUNNELS.map((f) => [f.toolKey, f]),
);

export function getFunnels(): OpportunityFunnel[] {
  return OPPORTUNITY_FUNNELS;
}

export function getFunnelByToolKey(toolKey: string): OpportunityFunnel | null {
  return BY_TOOL_KEY[toolKey] ?? null;
}

export function getFunnelByOpportunityKey(opportunityKey: string): OpportunityFunnel | null {
  return OPPORTUNITY_FUNNELS.find((f) => f.opportunityKey === opportunityKey) ?? null;
}

export function isSupportedToolKey(toolKey: string): boolean {
  const f = BY_TOOL_KEY[toolKey];
  return !!f && f.supported;
}

/**
 * Normalize a raw DM keyword the way the acquisition orchestrator does: a single bare word, no
 * whitespace, at most 12 characters, lowercased. Returns '' for anything that is not a keyword
 * (a sentence, an empty string, an overlong token), so the caller can reject it cleanly.
 */
export function normalizeKeyword(raw: string): string {
  const s = (raw || '').trim().toLowerCase();
  if (!s || /\s/.test(s) || s.length > 12) return '';
  return s;
}

/** Resolve a funnel from a DM keyword. Only active + supported funnels resolve; else null. */
export function resolveFunnelByKeyword(raw: string): OpportunityFunnel | null {
  const k = normalizeKeyword(raw);
  if (!k) return null;
  const f = OPPORTUNITY_FUNNELS.find((fn) => fn.dmKeywords.includes(k));
  if (!f || f.lifecycle !== 'active' || !f.supported) return null;
  return f;
}

/** Resolve a funnel from an alias (tool key, opportunity key, or DM keyword). Active + supported only. */
export function resolveFunnelByAlias(raw: string): OpportunityFunnel | null {
  const a = (raw || '').trim().toLowerCase();
  if (!a) return null;
  const f = OPPORTUNITY_FUNNELS.find(
    (fn) =>
      fn.toolKey === a ||
      fn.opportunityKey === a ||
      fn.aliases.map((x) => x.toLowerCase()).includes(a),
  );
  if (!f || f.lifecycle !== 'active' || !f.supported) return null;
  return f;
}

// ---- Pure selection + ordering (exported so tests assert them without the live registry) ----

export function selectActive(funnels: OpportunityFunnel[]): OpportunityFunnel[] {
  return funnels.filter((f) => f.lifecycle === 'active' && f.supported);
}

/** Public surfaces: active, supported, and anonymously available. */
export function selectPublic(funnels: OpportunityFunnel[]): OpportunityFunnel[] {
  return selectActive(funnels).filter((f) => f.anonymousAvailable);
}

/** Stable order: promotionRank ascending, then title. Primary funnels lead without hardcoded tiers. */
export function sortByPromotion(funnels: OpportunityFunnel[]): OpportunityFunnel[] {
  return [...funnels].sort(
    (a, b) => a.promotionRank - b.promotionRank || a.publicTitle.localeCompare(b.publicTitle),
  );
}

export function listActiveFunnels(): OpportunityFunnel[] {
  return sortByPromotion(selectActive(OPPORTUNITY_FUNNELS));
}

/** Strip every internal-only field. The ONLY shape safe to hand a browser as public config. */
export function toPublicFunnel(f: OpportunityFunnel): PublicOpportunityFunnel {
  return {
    toolKey: f.toolKey,
    opportunityKey: f.opportunityKey,
    publicTitle: f.publicTitle,
    description: f.description,
    category: f.category,
    toolType: f.toolType,
    publicRoute: f.publicRoute,
    resultRoute: f.resultRoute,
    builderRoute: f.builderRoute,
    recommendedFeature: f.recommendedFeature,
    recommendedNextRoute: f.recommendedNextRoute,
    promotion: f.promotion,
    promotionRank: f.promotionRank,
    anonymousAvailable: f.anonymousAvailable,
    requiresEstimateDisclaimer: f.requiresEstimateDisclaimer,
    requiresLegalDisclaimer: f.requiresLegalDisclaimer,
  };
}

export function listPublicFunnels(): PublicOpportunityFunnel[] {
  return sortByPromotion(selectPublic(OPPORTUNITY_FUNNELS)).map(toPublicFunnel);
}
