// Shared Opportunity Funnel analytics.
//
// Seven normalized events describe any funnel's journey, regardless of which tool it is. They ride
// the EXISTING analytics sink (/api/lead-magnets/analytics -> lead_magnet_events), so this adds no
// table and no new endpoint. The rich funnel dimensions (opportunity_key, tool_version, variant,
// source video, keyword) travel in the event meta; the server persists the ones it has columns for
// and drops the rest, exactly like the existing beacon.
//
// PRIVACY IS ENFORCED HERE, NOT TRUSTED: sanitizeOpportunityMeta is an ALLOWLIST. Only the known,
// safe dimensions survive; email, phone, claim tokens, raw answers, result payloads, and money
// values can never leave the client even if a caller passes them by mistake. The server also
// allowlists its columns, so this is defense in depth.

/**
 * The shared funnel events. The first seven describe any funnel's journey. The last three exist
 * for a funnel that models SEVERAL opportunities at once and therefore has to disclose its overlap
 * handling and re-derive its own headline when the artist edits the plan.
 */
export const OPPORTUNITY_EVENTS = {
  funnelViewed: 'opportunity_funnel_viewed',
  funnelStarted: 'opportunity_funnel_started',
  funnelCompleted: 'opportunity_funnel_completed',
  resultViewed: 'opportunity_result_viewed',
  recommendationViewed: 'opportunity_recommendation_viewed',
  ctaClicked: 'opportunity_cta_clicked',
  builderStarted: 'opportunity_builder_started',
  /** The "what we did not count twice" explanation was rendered with the result. */
  overlapExplained: 'opportunity_overlap_explained',
  /** The artist changed a generated recommendation in the builder. `variant` is the field key. */
  recommendationEdited: 'opportunity_recommendation_edited',
  /** The estimate was re-derived because an edit changed the plan's structure. */
  estimateRecalculated: 'opportunity_estimate_recalculated',
  /** The optional "get a call now" hand-raiser was expanded at the save boundary. */
  callOptionViewed: 'opportunity_call_option_viewed',
  /** The artist actively requested an immediate call (consent + phone accepted server-side). */
  callRequested: 'opportunity_call_requested',
} as const;

export type OpportunityEvent = (typeof OPPORTUNITY_EVENTS)[keyof typeof OPPORTUNITY_EVENTS];

/**
 * The value-before-signup JOURNEY events: the full anonymous -> build -> save -> signup -> claim ->
 * restore -> resume transition. Same sink, same sanitizer, NOT mirrored into funnel_events (so the
 * 15-stage counts never double-count). A claim token is NEVER an argument to any of these.
 */
export const JOURNEY_EVENTS = {
  anonymousValueStarted: 'anonymous_value_started',
  anonymousValueCompleted: 'anonymous_value_completed',
  recommendedSolutionViewed: 'recommended_solution_viewed',
  preSignupBuilderStarted: 'pre_signup_builder_started',
  preSignupBuilderStepCompleted: 'pre_signup_builder_step_completed',
  preSignupPreviewViewed: 'pre_signup_preview_viewed',
  signupBoundaryReached: 'signup_boundary_reached',
  signupPromptViewed: 'signup_prompt_viewed',
  signupStartedFromOpportunity: 'signup_started_from_opportunity',
  signupCompletedFromOpportunity: 'signup_completed_from_opportunity',
  draftClaimStarted: 'draft_claim_started',
  draftClaimCompleted: 'draft_claim_completed',
  draftClaimFailed: 'draft_claim_failed',
  draftRestored: 'draft_restored',
  authenticatedBuilderResumed: 'authenticated_builder_resumed',
  featurePublished: 'feature_published',
} as const;

export type JourneyEvent = (typeof JOURNEY_EVENTS)[keyof typeof JOURNEY_EVENTS];

/**
 * The PERSONALIZED post-signup journey events: opportunity context surviving signup, restoration,
 * and the recommended-action -> next-action loop. Same sink, same sanitizer, never a token/PII.
 */
export const PERSONALIZED_JOURNEY_EVENTS = {
  personalizedJourneyAssigned: 'personalized_journey_assigned',
  contextRestoredAfterSignup: 'context_restored_after_signup',
  onboardingContextViewed: 'onboarding_context_viewed',
  recommendedActionViewed: 'recommended_action_viewed',
  recommendedActionStarted: 'recommended_action_started',
  recommendedActionCompleted: 'recommended_action_completed',
  featureActivated: 'feature_activated',
  featurePublished: 'feature_published',
  nextActionViewed: 'next_action_viewed',
} as const;

export type PersonalizedJourneyEvent = (typeof PERSONALIZED_JOURNEY_EVENTS)[keyof typeof PERSONALIZED_JOURNEY_EVENTS];

/** Every event name, for the server allowlist and tests. */
export const OPPORTUNITY_EVENT_NAMES: string[] = Object.values(OPPORTUNITY_EVENTS);
export const JOURNEY_EVENT_NAMES: string[] = Object.values(JOURNEY_EVENTS);
export const PERSONALIZED_JOURNEY_EVENT_NAMES: string[] = Object.values(PERSONALIZED_JOURNEY_EVENTS);
/** The full set of names the analytics sink must allowlist for this layer. */
export const ALL_OPPORTUNITY_EVENT_NAMES: string[] = [
  ...OPPORTUNITY_EVENT_NAMES,
  ...JOURNEY_EVENT_NAMES,
  ...PERSONALIZED_JOURNEY_EVENT_NAMES,
];

/**
 * The dimensions a shared funnel event may carry. All optional and all NON-sensitive: ids, keys,
 * versions, and attribution. Deliberately no email/phone/token/answers/financial fields.
 */
export interface OpportunityEventMeta {
  opportunityKey?: string;
  toolKey?: string;
  toolVersion?: string;
  resultVersion?: string;
  anonSessionId?: string;
  userId?: string;
  artistId?: string;
  sourceVideoId?: string;
  campaignId?: string;
  leadMagnetId?: string;
  keyword?: string;
  /**
   * Which single-opportunity funnel sent this visitor into the all-in-one calculator (`?from=`).
   * A tool slug, never free text from the URL: the caller resolves it against the tool's declared
   * entry contexts first, so an attacker cannot write arbitrary strings into the event sink.
   */
  entryContext?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  referralSource?: string;
  experienceId?: string;
  variant?: string;
  context?: 'public' | 'artist';
  /**
   * Which PAGE the funnel ran on. The same funnel composition is mounted by
   * /tools/[slug] and by the homepage, so without this the two are
   * indistinguishable in the event stream. A closed set, never free text.
   */
  surface?: 'tool' | 'homepage';
  authed?: boolean;
}

// The only keys allowed out. Anything else (including anything sensitive) is dropped.
const ALLOWED_KEYS: (keyof OpportunityEventMeta)[] = [
  'opportunityKey',
  'toolKey',
  'toolVersion',
  'resultVersion',
  'anonSessionId',
  'userId',
  'artistId',
  'sourceVideoId',
  'campaignId',
  'leadMagnetId',
  'keyword',
  'entryContext',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
  'referralSource',
  'experienceId',
  'variant',
  'context',
  'surface',
  'authed',
];

const MAX_LEN = 200;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// A run of 7+ digits (optionally with separators) reads as a phone number; never emit one.
const PHONE_RE = /(?:\d[\s().-]?){7,}/;
// The phone guard runs ONLY on human-typed free-text keys. Id-shaped keys (a long numeric
// Instagram media id, a campaign id) are legitimately digit-heavy and must not be mistaken for
// a phone number, so they are excluded from the phone check (the email check still applies to all).
const PHONE_CHECK_KEYS = new Set<keyof OpportunityEventMeta>([
  'keyword',
  'referralSource',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
]);

/**
 * Return a copy containing ONLY allowlisted, non-sensitive dimensions. Drops unknown keys, and
 * defensively drops any string value that looks like an email or phone number. Booleans pass
 * through for `authed`; everything else is coerced to a clipped string.
 */
export function sanitizeOpportunityMeta(meta: Record<string, unknown> | OpportunityEventMeta): OpportunityEventMeta {
  const input = (meta || {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    const v = input[key];
    if (v == null) continue;
    if (key === 'authed') {
      if (typeof v === 'boolean') out.authed = v;
      continue;
    }
    if (key === 'context') {
      if (v === 'public' || v === 'artist') out.context = v;
      continue;
    }
    const s = String(v).trim();
    if (!s) continue;
    if (EMAIL_RE.test(s)) continue; // an email never belongs in any dimension
    if (PHONE_CHECK_KEYS.has(key) && PHONE_RE.test(s)) continue; // free-text keys must not carry a phone
    out[key] = s.slice(0, MAX_LEN);
  }
  return out as OpportunityEventMeta;
}

/**
 * Fire a shared funnel event. Client-only, fire-and-forget, never throws. Sanitizes first, then
 * maps the surviving dimensions onto the existing beacon fields the sink understands (so the tool
 * shows up in lead_magnet_events with no new columns), and posts to the existing analytics route.
 */
export function trackOpportunity(event: OpportunityEvent | JourneyEvent | PersonalizedJourneyEvent, meta: OpportunityEventMeta): void {
  if (typeof window === 'undefined') return;
  try {
    const safe = sanitizeOpportunityMeta(meta);
    const eventId =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    // Map onto the existing sink's field names; extra dimensions ride along and are dropped server-side.
    const beaconMeta: Record<string, unknown> = {
      ...safe,
      toolSlug: safe.toolKey,
      generatorVersion: safe.resultVersion,
      source: safe.referralSource || safe.utmSource,
      utmSource: safe.utmSource,
      utmMedium: safe.utmMedium,
      utmCampaign: safe.utmCampaign,
      utmContent: safe.utmContent,
      context: safe.context,
      authed: safe.authed,
      eventId,
      referrer: typeof document !== 'undefined' && document.referrer ? document.referrer : undefined,
    };
    const body = JSON.stringify({ event, meta: beaconMeta });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/lead-magnets/analytics', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/lead-magnets/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
    }
  } catch {
    // analytics must never break the UX
  }
}
