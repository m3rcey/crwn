// The deterministic decision engine.
//
// This is NOT a stub, and it is not a degraded mode. It is a complete, correct path through
// the entire conversation that never calls a model at all.
//
// Claude is an OPTIMIZATION on top of this: it makes the conversation feel human and it
// parses messy free-form text. Everything it does, this file can do worse but safely. So:
//
//   - ANTHROPIC_API_KEY unset?        The engine still works.
//   - Anthropic returning 500s?       The engine still works.
//   - Claude returns garbage?         Validation drops it, we land here, the engine works.
//   - Request times out?              We land here, the engine works.
//
// A lead session must never be destroyed, stalled, or corrupted by a provider outage. This
// file is why that is true.

import { getField } from './fieldRegistry';
import type { AcquisitionTool } from './toolAdapters';
import { missingRequiredFields } from './toolAdapters';
import type { LeadProfileValues } from './toolAdapters';
import type { LeadDecision } from './types';

export interface FallbackInput {
  tool: AcquisitionTool;
  profile: LeadProfileValues;
  hasConsent: boolean;
  reasonCode: string;
}

/**
 * The next move, derived purely from what we know.
 *
 * The logic is simply: what is the first thing this tool needs that we do not have? Ask for
 * it. When nothing is left, generate the result.
 */
export function fallbackDecision(input: FallbackInput): LeadDecision {
  const { tool, profile, hasConsent, reasonCode } = input;

  const base: LeadDecision = {
    intent: 'continue_questions',
    artistSegment: null,
    primaryBlocker: null,
    careerStage: null,
    leadScoreSignal: 0,
    confidence: 1, // deterministic: we are certain, because we did not guess
    nextQuestion: null,
    nextQuestionField: null,
    extractedFields: {},
    missingRequiredFields: [],
    recommendedLeadMagnet: tool.id,
    recommendedCalculator: tool.calculatorId,
    recommendedRiseModeStep: null,
    responseMessage: '',
    internalReasonCode: reasonCode,
    requiresHumanReview: false,
  };

  if (!hasConsent) {
    return {
      ...base,
      intent: 'continue_questions',
      responseMessage: 'Before we go further, is it cool if I send you a couple of quick questions here?',
    };
  }

  const missing = missingRequiredFields(tool, profile);

  if (missing.length === 0) {
    return {
      ...base,
      intent: 'generate_result',
      missingRequiredFields: [],
      responseMessage: 'Got everything I need. Give me a second, I am putting your numbers together.',
    };
  }

  const nextKey = missing[0];
  const def = getField(nextKey);

  return {
    ...base,
    intent: 'continue_questions',
    nextQuestionField: nextKey,
    nextQuestion: def?.question ?? `What is your ${def?.label ?? nextKey}?`,
    missingRequiredFields: missing,
    responseMessage: def?.question ?? `What is your ${def?.label ?? nextKey}?`,
  };
}

/**
 * When we cannot even do that: a provider is down AND we somehow have no tool.
 * Tell ManyChat to back off rather than looping.
 */
export function retryLaterDecision(reasonCode: string): LeadDecision {
  return {
    intent: 'nurture',
    artistSegment: null,
    primaryBlocker: null,
    careerStage: null,
    leadScoreSignal: 0,
    confidence: 0,
    nextQuestion: null,
    nextQuestionField: null,
    extractedFields: {},
    missingRequiredFields: [],
    recommendedLeadMagnet: null,
    recommendedCalculator: null,
    recommendedRiseModeStep: null,
    responseMessage: 'Give me a moment, I will come right back to you.',
    internalReasonCode: reasonCode,
    requiresHumanReview: false,
  };
}
