// Core types for the Instagram → ManyChat → CRWN acquisition engine.
//
// Read this file first. Everything else in src/lib/acquisition/ is an implementation
// of a contract declared here.
//
// THE ONE RULE THAT MATTERS:
//   Claude RECOMMENDS. CRWN DECIDES.
// The state machine, the field registry, and the calculators are authoritative. A Claude
// response is untrusted input that gets validated against allowlists before anything is
// applied. If Anthropic is down, every path below still works — see fallbackDecision.ts.

// ---------------------------------------------------------------------------
// Conversation state
// ---------------------------------------------------------------------------

/** Mirrors the CHECK constraint on lead_sessions.state. Keep the two in sync. */
export type LeadSessionState =
  | 'initiated'
  | 'awaiting_opt_in'
  | 'collecting_identity'
  | 'collecting_required_metrics'
  | 'collecting_goal'
  | 'collecting_blocker'
  | 'ready_for_result'
  | 'result_generating'
  | 'result_generated'
  | 'result_sent'
  | 'result_viewed'
  | 'account_claim_started'
  | 'account_claimed'
  | 'onboarding_started'
  | 'rise_mode_started'
  | 'booked_call'
  | 'purchased'
  | 'nurture'
  | 'abandoned'
  | 'failed'
  | 'human_review';

export type LeadSessionStatus = 'open' | 'completed' | 'abandoned' | 'failed';

// ---------------------------------------------------------------------------
// Trust. The thing that stops a Claude guess overwriting a verified fact.
// ---------------------------------------------------------------------------

/**
 * Where a field value came from. Higher rank wins on conflict — ALWAYS.
 *
 * This is the single most important type in the acquisition engine. An artist who has a
 * verified CRWN profile saying they have 40,000 monthly listeners must never have that
 * value clobbered because Claude parsed "like 40k ish maybe more" out of a DM.
 */
export type FieldSource =
  | 'verified_crwn'      // read from profiles / artist_profiles of an authenticated user
  | 'verified_contact'   // a verified email or phone
  | 'direct_answer'      // the artist typed it into a structured question
  | 'deterministic'      // parsed by our own normalizer with no ambiguity
  | 'claude_extraction'  // Claude pulled it out of free-form text
  | 'provider_metadata'; // ManyChat/Instagram told us (display name, username)

export const TRUST_RANK: Record<FieldSource, number> = {
  verified_crwn: 5,
  verified_contact: 4,
  direct_answer: 3,
  deterministic: 2,
  claude_extraction: 1,
  provider_metadata: 0,
};

export interface FieldProvenance {
  source: FieldSource;
  confidence: number;      // 0..1
  verifiedAt: string;      // ISO
  sessionId?: string;
}

/** A value plus where it came from. Never pass a bare value into the profile writer. */
export interface AttributedValue<T = unknown> {
  value: T;
  source: FieldSource;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface LeadIdentity {
  id: string;
  manychatContactId: string | null;
  instagramUserId: string | null;
  instagramUsername: string | null;
  email: string | null;
  emailVerifiedAt: string | null;
  phone: string | null;
  userId: string | null;
  artistId: string | null;
  claimedAt: string | null;
  consentDm: boolean;
  consentEmail: boolean;
  consentSms: boolean;
  status: 'active' | 'nurture' | 'disqualified' | 'claimed' | 'opted_out' | 'human_review';
}

/** Identifiers a caller may present. Resolution precedence lives in identityResolution.ts. */
export interface IdentityClaimInput {
  /** A verified Supabase session. Trumps everything. */
  authenticatedUserId?: string | null;
  /** A validated, unexpired, unused claim token. */
  verifiedClaimTokenIdentityId?: string | null;
  /** An email we have actually verified. NOT an email the lead merely typed. */
  verifiedEmail?: string | null;
  manychatContactId?: string | null;
  instagramUserId?: string | null;
  /** Recorded, never used as a merge key. Usernames get reassigned. */
  instagramUsername?: string | null;
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

export interface Attribution {
  sourcePlatform: string;
  creatorAccount: string | null;
  sourcePostId: string | null;
  keyword: string | null;
  campaignKey: string | null;
  conversationId: string | null;
  referringUrl: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
}

// ---------------------------------------------------------------------------
// Orchestration I/O
// ---------------------------------------------------------------------------

/** The constrained set of things CRWN can tell ManyChat to do. Nothing else is legal. */
export type AcquisitionAction =
  | 'ask_question'
  | 'send_message'
  | 'send_result'
  | 'request_email'
  | 'request_phone'
  | 'request_account'
  | 'offer_call'
  | 'nurture'
  | 'human_review'
  | 'complete'
  | 'retry_later';

export type QuestionInputType = 'text' | 'number' | 'email' | 'phone' | 'choice' | 'boolean';

/**
 * The thin payload ManyChat receives. Deliberately narrow.
 *
 * NEVER add to this: internal ids, prompt content, confidence scores, reason codes,
 * database errors, or any PII we were given. ManyChat is a transport, not a database,
 * and anything we put here is one misconfigured flow away from being shown to a stranger.
 */
export interface ManyChatResponsePayload {
  ok: boolean;
  session_id: string | null;
  action: AcquisitionAction;
  message: string;
  question_key: string | null;
  input_type: QuestionInputType | null;
  choices: string[];
  result_url: string | null;
  resume_token: string | null;
  lead_magnet_id: string | null;
  status: LeadSessionState | null;
  retryable: boolean;
  error_code: string | null;
}

// ---------------------------------------------------------------------------
// Claude decision contract
// ---------------------------------------------------------------------------

export type LeadDecisionIntent =
  | 'continue_questions'
  | 'generate_result'
  | 'request_account'
  | 'nurture'
  | 'book_call'
  | 'disqualify'
  | 'human_review';

/**
 * What Claude is allowed to return. Every field is validated against an allowlist in
 * decisionSchema.ts before it is applied to anything.
 *
 * Note what is ABSENT: there is no field here that carries a monetary amount, a projection,
 * a fan count, or any other number that feeds a calculator. That is structural, not an
 * oversight. Claude cannot produce a financial value because the schema gives it nowhere
 * to put one.
 */
export interface LeadDecision {
  intent: LeadDecisionIntent;
  artistSegment: string | null;
  primaryBlocker: string | null;
  careerStage: string | null;
  /** Bounded 0..20. Advisory only; the deterministic score is authoritative. */
  leadScoreSignal: number;
  confidence: number;
  nextQuestion: string | null;
  nextQuestionField: string | null;
  /** Only keys present in fieldRegistry with aiExtractable=true survive validation. */
  extractedFields: Record<string, unknown>;
  missingRequiredFields: string[];
  recommendedLeadMagnet: string | null;
  recommendedCalculator: string | null;
  recommendedRiseModeStep: string | null;
  responseMessage: string;
  internalReasonCode: string;
  requiresHumanReview: boolean;
}

/** Everything Claude is permitted to see. Anything not on this object does not reach the model. */
export interface DecisionContext {
  leadProfile: Record<string, unknown>;
  provenance: Record<string, FieldProvenance>;
  selectedLeadMagnet: string | null;
  recentHistory: { role: 'lead' | 'crwn'; content: string }[];
  missingRequiredFields: string[];
  currentState: LeadSessionState;
  allowedNextQuestions: { field: string; question: string; inputType: QuestionInputType }[];
  allowedActions: LeadDecisionIntent[];
  allowedLeadMagnetIds: string[];
  allowedCalculatorIds: string[];
  allowedRiseModeDestinations: string[];
  allowedFieldKeys: string[];
  allowedSegments: string[];
  allowedBlockers: string[];
  allowedCareerStages: string[];
}

export interface DecisionTelemetry {
  promptVersion: string;
  model: string;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  providerRequestId: string | null;
  usedFallback: boolean;
  errorCategory: string | null;
}

export interface DecisionOutcome {
  decision: LeadDecision;
  telemetry: DecisionTelemetry;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type ScoreBand = 'unqualified' | 'nurture' | 'self_serve' | 'sales_priority' | 'human_review';

export interface LeadScore {
  total: number;
  version: string;
  band: ScoreBand;
  components: Record<string, number>;
  reasonCodes: string[];
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface AcquisitionResult {
  resultId: string;
  toolSlug: string;
  /** RAW token. Returned exactly once, at mint time. Only the hash is persisted. */
  publicToken: string;
  resultUrl: string;
  headline: string;
  shareSummary: string;
}
