// Validation of Claude's output. This is the prompt-injection blast door.
//
// Assume the model has been fully compromised by the artist's message. Assume it is trying
// to return a route to an attacker's site, a lead magnet that doesn't exist, a 10,000-point
// lead score, an extracted `direct_fan_revenue_cents` of 99999999, and a `responseMessage`
// containing a phishing link.
//
// Every one of those is rejected below, structurally, without reference to what the prompt
// asked for. A prompt is a request. This file is an enforcement.

import {
  AI_EXTRACTABLE_KEYS,
  ARTIST_SEGMENTS,
  CAREER_STAGES,
  PRIMARY_BLOCKERS,
  validateExtractedValue,
} from './fieldRegistry';
import type { LeadDecision, LeadDecisionIntent } from './types';

const INTENTS: LeadDecisionIntent[] = [
  'continue_questions',
  'generate_result',
  'request_account',
  'nurture',
  'book_call',
  'disqualify',
  'human_review',
];

/** Bounded hard. Claude contributes at most 20 points to a 100-point score. */
export const MAX_CLAUDE_SCORE_SIGNAL = 20;
const MAX_MESSAGE_CHARS = 600;
const MAX_QUESTION_CHARS = 200;

export interface DecisionAllowlists {
  leadMagnetIds: string[];
  calculatorIds: string[];
  riseModeDestinations: string[];
  /** Questions the state machine considers legal right now. */
  allowedQuestionFields: string[];
}

export interface DecisionValidation {
  ok: boolean;
  decision: LeadDecision | null;
  /** Everything we threw away, and why. Logged for admin review; never sent to ManyChat. */
  violations: string[];
}

/**
 * Validate and SANITIZE. Note the return contract: a decision with some fields stripped is
 * still `ok`. We only fail outright when the response is structurally unusable.
 *
 * Partial acceptance is correct here. If Claude classifies the blocker perfectly but also
 * hallucinates a lead magnet, we want to keep the blocker and drop the lead magnet, not
 * throw the whole turn away and stall the conversation.
 */
export function validateDecision(raw: unknown, allow: DecisionAllowlists): DecisionValidation {
  const violations: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, decision: null, violations: ['not_an_object'] };
  }
  const r = raw as Record<string, unknown>;

  // ---- intent: must be one of ours, or the whole decision is unusable ----
  const intent = typeof r.intent === 'string' ? r.intent : '';
  if (!INTENTS.includes(intent as LeadDecisionIntent)) {
    return { ok: false, decision: null, violations: [`bad_intent:${truncate(intent, 32)}`] };
  }

  // ---- enums: unknown value => null, not the raw string ----
  const artistSegment = pickEnum(r.artistSegment, ARTIST_SEGMENTS as readonly string[], violations, 'artistSegment');
  const primaryBlocker = pickEnum(r.primaryBlocker, PRIMARY_BLOCKERS as readonly string[], violations, 'primaryBlocker');
  const careerStage = pickEnum(r.careerStage, CAREER_STAGES as readonly string[], violations, 'careerStage');

  // ---- score signal: clamped, never trusted ----
  let leadScoreSignal = toNumber(r.leadScoreSignal, 0);
  if (leadScoreSignal < 0 || leadScoreSignal > MAX_CLAUDE_SCORE_SIGNAL) {
    violations.push(`score_signal_out_of_bounds:${leadScoreSignal}`);
    leadScoreSignal = Math.min(Math.max(leadScoreSignal, 0), MAX_CLAUDE_SCORE_SIGNAL);
  }

  const confidence = clamp01(toNumber(r.confidence, 0));

  // ---- extractedFields: the big one ----
  // Drop any key not in the registry, any key the registry marks non-AI-extractable (all
  // money), and any value that fails its own type/bounds/confidence check.
  const extractedFields: Record<string, unknown> = {};
  const rawFields = r.extractedFields;
  if (rawFields && typeof rawFields === 'object' && !Array.isArray(rawFields)) {
    for (const [k, v] of Object.entries(rawFields as Record<string, unknown>)) {
      if (!AI_EXTRACTABLE_KEYS.includes(k)) {
        violations.push(`field_not_extractable:${truncate(k, 40)}`);
        continue;
      }
      const validated = validateExtractedValue(k, v, confidence);
      if (validated === null) {
        violations.push(`field_rejected:${truncate(k, 40)}`);
        continue;
      }
      extractedFields[k] = validated;
    }
  }

  // ---- recommendations: must exist in OUR registries ----
  const recommendedLeadMagnet = pickAllowed(r.recommendedLeadMagnet, allow.leadMagnetIds, violations, 'leadMagnet');
  const recommendedCalculator = pickAllowed(r.recommendedCalculator, allow.calculatorIds, violations, 'calculator');
  const recommendedRiseModeStep = pickAllowed(
    r.recommendedRiseModeStep,
    allow.riseModeDestinations,
    violations,
    'riseModeStep',
  );

  // ---- next question: must be a field the machine currently permits ----
  const nextQuestionField = pickAllowed(
    r.nextQuestionField,
    allow.allowedQuestionFields,
    violations,
    'nextQuestionField',
  );
  const nextQuestion = nextQuestionField ? sanitizeText(r.nextQuestion, MAX_QUESTION_CHARS, violations, 'nextQuestion') : null;

  // ---- the message that reaches a human ----
  const responseMessage = sanitizeText(r.responseMessage, MAX_MESSAGE_CHARS, violations, 'responseMessage') ?? '';

  const missingRequiredFields = Array.isArray(r.missingRequiredFields)
    ? (r.missingRequiredFields as unknown[])
        .filter((f): f is string => typeof f === 'string' && AI_EXTRACTABLE_KEYS.includes(f))
        .slice(0, 12)
    : [];

  const decision: LeadDecision = {
    intent: intent as LeadDecisionIntent,
    artistSegment,
    primaryBlocker,
    careerStage,
    leadScoreSignal,
    confidence,
    nextQuestion,
    nextQuestionField,
    extractedFields,
    missingRequiredFields,
    recommendedLeadMagnet,
    recommendedCalculator,
    recommendedRiseModeStep,
    responseMessage,
    internalReasonCode: sanitizeText(r.internalReasonCode, 64, violations, 'reasonCode') ?? 'unspecified',
    requiresHumanReview: r.requiresHumanReview === true,
  };

  return { ok: true, decision, violations };
}

// ---------------------------------------------------------------------------
// Text sanitization
// ---------------------------------------------------------------------------

// Anything that could turn a DM into a phishing vector. Claude has no legitimate reason to
// emit a URL: CRWN builds every link itself, from its own token, in its own code.
const URL_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|app|link|xyz|ru|cn)\b)/i;

// Signs the model is parroting its own instructions back at us, which usually means an
// injection landed. We drop the text and fall back to a deterministic message.
const LEAK_PATTERN = /(system prompt|你是|ignore (all |previous |the )?instructions|<\/?(system|instructions|artist_message)>)/i;

function sanitizeText(
  v: unknown,
  max: number,
  violations: string[],
  label: string,
): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;

  if (URL_PATTERN.test(s)) {
    violations.push(`${label}_contained_url`);
    return null;
  }
  if (LEAK_PATTERN.test(s)) {
    violations.push(`${label}_prompt_leak`);
    return null;
  }
  // Em dashes are banned in all CRWN user-facing copy (CLAUDE.md). Claude does not get an
  // exemption just because it wrote the sentence. Rewrite to a colon rather than reject.
  const noEmDash = s.replace(/\s*—\s*/g, ': ').replace(/\s*–\s*/g, ', ');

  return noEmDash.length > max ? noEmDash.slice(0, max).trimEnd() : noEmDash;
}

function pickEnum(v: unknown, allowed: readonly string[], violations: string[], label: string): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') {
    violations.push(`${label}_not_string`);
    return null;
  }
  const s = v.toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (!allowed.includes(s)) {
    violations.push(`${label}_unknown:${truncate(s, 40)}`);
    return null;
  }
  return s;
}

function pickAllowed(v: unknown, allowed: string[], violations: string[], label: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') {
    violations.push(`${label}_not_string`);
    return null;
  }
  const s = v.trim();
  if (!allowed.includes(s)) {
    violations.push(`${label}_not_in_registry:${truncate(s, 60)}`);
    return null;
  }
  return s;
}

function toNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}
