// The orchestrator. One function, one deterministic order, every inbound event.
//
// THE ORDER IS THE DESIGN. It is not arbitrary and it must not be rearranged:
//
//   1. store the raw answer          <- BEFORE any AI touches it. Always recoverable.
//   2. normalize deterministically   <- most answers resolve here; no model call at all
//   3. load what we already know     <- so we never ask twice
//   4. call Claude ONLY if needed    <- and only for genuinely ambiguous free text
//   5. validate + apply by trust     <- a guess never overwrites a fact
//   6. the STATE MACHINE decides     <- Claude's intent is a suggestion, not a command
//   7. commit
//   8. respond to ManyChat
//   9. enqueue side effects          <- the DM never waits on an email provider
//
// Step 1 before step 4 is the one that matters most. If Claude mangles an answer, or a
// prompt injection lands, or the provider returns nonsense, the artist's literal words are
// already in lead_answers.raw_value and the damage is reversible. Store first, interpret
// second.

import { supabaseAdmin } from './db';
import { decide } from './claudeDecisionService';
import { getField, normalizeDeterministic } from './fieldRegistry';
import { fallbackDecision } from './fallbackDecision';
import { loadProfile, applyValues } from './progressiveProfiling';
import { generateAndStore } from './resultGeneration';
import { nextState, resume, statusFor, transition } from './stateMachine';
import {
  getTool,
  missingRequiredFields,
  DEFAULT_TOOL_ID,
  type AcquisitionTool,
  type LeadProfileValues,
} from './toolAdapters';
import { recomputeScore } from './rescore';
import { enqueue, recordEvent } from './eventOutbox';
import { buildResponse } from '../manychat/responseMapper';
import type { ManyChatInboundPayload } from '../manychat/schemas';
import type {
  AttributedValue,
  LeadIdentity,
  LeadSessionState,
  ManyChatResponsePayload,
  QuestionInputType,
} from './types';

const ORCHESTRATION_VERSION = '1.0.0';

interface SessionRow {
  id: string;
  state: LeadSessionState;
  lead_magnet_id: string | null;
  revision: number;
}

export async function orchestrate(
  payload: ManyChatInboundPayload,
  identity: LeadIdentity,
): Promise<ManyChatResponsePayload> {
  // ---- Consent gate. Nothing happens without an opt-in. ----
  if (!identity.consentDm && !payload.consent_dm) {
    return buildResponse({
      sessionId: null,
      action: 'ask_question',
      message: 'Before I send anything over, is it cool if I ask you a couple of quick questions here?',
      questionKey: 'consent_dm',
      inputType: 'boolean',
    });
  }

  if (payload.consent_dm && !identity.consentDm) {
    await supabaseAdmin
      .from('lead_identities')
      .update({
        consent_dm: true,
        consent_source: payload.opt_in_source ?? 'instagram_comment',
        consented_at: new Date().toISOString(),
      })
      .eq('id', identity.id);
    identity.consentDm = true;
  }

  // ---- Persist a claimed email/phone so the follow-up TAIL is reachable. ----
  //
  // Meta's 24h window closes the Instagram DM. The multi-day nurture (personal_nudge day 4,
  // offer_call day 7, the no-show ladder) can only reach an IG-only lead by email or SMS,
  // which have no window. So when she hands over an email WHILE the window is open, we have to
  // store it, or channels.ts has nothing to fall back to and the whole tail silently no-ops.
  //
  // This is a CLAIMED contact, never a verified one: we set the `email` column but NEVER
  // `email_verified_at`. identityResolution ignores an unverified email as a merge key (see its
  // header), so storing one here cannot become an account-takeover vector. It is a send target
  // and nothing more. Additive: we fill a blank, we do not overwrite what she gave before.
  const contactPatch: Record<string, unknown> = {};
  if (payload.email && !identity.email) contactPatch.email = payload.email;
  if (payload.phone && !identity.phone) contactPatch.phone = payload.phone;
  if (payload.consent_email && !identity.consentEmail) contactPatch.consent_email = true;
  if (payload.consent_sms && !identity.consentSms) contactPatch.consent_sms = true;

  if (Object.keys(contactPatch).length > 0) {
    await supabaseAdmin.from('lead_identities').update(contactPatch).eq('id', identity.id);
    if (typeof contactPatch.email === 'string') identity.email = contactPatch.email;
    if (typeof contactPatch.phone === 'string') identity.phone = contactPatch.phone;
    if (contactPatch.consent_email === true) identity.consentEmail = true;
    if (contactPatch.consent_sms === true) identity.consentSms = true;
  }

  const session = await loadOrCreateSession(payload, identity);
  const tool = getTool(session.lead_magnet_id ?? payload.lead_magnet_id ?? DEFAULT_TOOL_ID);

  if (!tool) {
    return buildResponse({
      sessionId: session.id,
      action: 'human_review',
      message: 'Let me get a person to pick this up with you.',
      state: session.state,
    });
  }

  // ---- 1. Store the raw answer, before anything can reinterpret it. ----
  if (payload.event_type === 'answer' && payload.question_key && payload.answer) {
    await storeRawAnswer(session.id, identity.id, payload);
  }

  // ---- 2 + 3. Normalize deterministically, and load what we already know. ----
  const loaded = await loadProfile(identity);
  const deterministic: Record<string, AttributedValue> = {};

  if (payload.event_type === 'answer' && payload.question_key && payload.answer) {
    const normalized = normalizeDeterministic(payload.question_key, payload.answer);
    if (normalized !== null) {
      // Resolved with zero ambiguity and zero model calls. This is the common case: "40k",
      // "about 2000", "yes". No Claude, no cost, no injection surface, no latency.
      deterministic[payload.question_key] = { value: normalized, source: 'deterministic', confidence: 1 };
    }
  }

  if (Object.keys(deterministic).length > 0) {
    await applyValues(identity.id, loaded, deterministic, session.id);
    Object.assign(loaded.values, Object.fromEntries(Object.entries(deterministic).map(([k, v]) => [k, v.value])));
  }

  // ---- 4. Claude, and ONLY when the deterministic path could not resolve the answer. ----
  const stillMissing = missingRequiredFields(tool, loaded.values);
  const needsClaude =
    payload.event_type === 'answer' &&
    !!payload.answer &&
    Object.keys(deterministic).length === 0; // deterministic normalization already failed

  let decision = fallbackDecision({
    tool,
    profile: loaded.values,
    hasConsent: identity.consentDm,
    reasonCode: 'deterministic_path',
  });

  if (needsClaude) {
    const history = await recentHistory(session.id);
    const outcome = await decide({
      tool,
      profile: loaded.values,
      provenance: loaded.provenance,
      state: session.state,
      missingRequiredFields: stillMissing,
      recentHistory: history,
      latestAnswer: payload.answer ?? null,
      hasConsent: identity.consentDm,
    });
    decision = outcome.decision;

    await recordEvent(outcome.telemetry.usedFallback ? 'claude_decision_failed' : 'claude_decision_completed', {
      leadIdentityId: identity.id,
      sessionId: session.id,
      // Telemetry only. No artist text, no field values, no PII.
      metadata: {
        model: outcome.telemetry.model,
        durationMs: outcome.telemetry.durationMs,
        inputTokens: outcome.telemetry.inputTokens,
        outputTokens: outcome.telemetry.outputTokens,
        promptVersion: outcome.telemetry.promptVersion,
        errorCategory: outcome.telemetry.errorCategory,
      },
    });

    // ---- 5. Apply Claude's fields, gated by trust. A guess cannot beat a fact. ----
    if (Object.keys(decision.extractedFields).length > 0) {
      const attributed: Record<string, AttributedValue> = {};
      for (const [k, v] of Object.entries(decision.extractedFields)) {
        attributed[k] = { value: v, source: 'claude_extraction', confidence: decision.confidence };
      }
      const { applied } = await applyValues(identity.id, loaded, attributed, session.id);
      for (const k of applied) {
        (loaded.values as Record<string, unknown>)[k] = decision.extractedFields[k];
      }
    }
  }

  // ---- 6. The state machine decides. Claude only ever suggested. ----
  const missingNow = missingRequiredFields(tool, loaded.values);

  // ---- The loop guard. ----
  //
  // fallbackDecision() returns missing[0]. It has no memory, so if an answer cannot be
  // parsed it hands back the SAME field, and the orchestrator asks the SAME question. An
  // artist who types "honestly not that many" would be asked "about how many monthly
  // listeners?" forever. That is not a hypothetical: it is what this code did before this
  // block existed, and it is the single worst way to lose a lead.
  //
  // Every attempt is already recorded in lead_answers, so the counter costs one query and
  // no new schema.
  //
  //   attempt 1 fails -> re-ask WITH a concrete example (converts most of them)
  //   attempt 2 fails -> re-ask with the example again
  //   attempt 3 fails -> stop asking. Hand it to a human.
  let stuckOnField: string | null = null;
  let needsHuman = decision.requiresHumanReview;

  if (payload.event_type === 'answer' && payload.question_key && missingNow.includes(payload.question_key)) {
    const attempts = await countAttempts(session.id, payload.question_key);
    if (attempts >= MAX_ATTEMPTS_PER_FIELD) {
      needsHuman = true;
    } else if (attempts >= 1) {
      stuckOnField = payload.question_key;
    }
  }

  const facts = {
    missingRequiredFields: missingNow,
    hasConsent: identity.consentDm,
    hasResult: false,
    hasVerifiedEmail: !!identity.emailVerifiedAt,
    isClaimed: !!identity.claimedAt,
    needsHumanReview: needsHuman,
  };

  const target = nextState(session.state, facts);
  const move = transition(session.state, target, decision.internalReasonCode);
  // An illegal move is not an error. We stay where we are and answer from there. That is
  // what makes a duplicate or out-of-order webhook harmless.
  const committedState = move.state;

  await rescore(identity.id, session.id, loaded.values, decision.leadScoreSignal);

  // ---- Ready to generate? Run the EXISTING calculator and send the link. ----
  if (committedState === 'ready_for_result' || (missingNow.length === 0 && !facts.needsHumanReview)) {
    return finalize(session, identity, tool, loaded.values);
  }

  // ---- Gave up on this artist's answer. Hand them to a person, do not loop. ----
  if (committedState === 'human_review') {
    await commitState(session, 'human_review', null);
    await recordEvent('lead_human_review', {
      leadIdentityId: identity.id,
      sessionId: session.id,
      metadata: { field: payload.question_key, reason: 'unparseable_after_retries' },
    });

    return buildResponse({
      sessionId: session.id,
      action: 'human_review',
      // Never blame the artist for our parser. This reads as a handoff, not a failure.
      message: 'Let me get a person on this with you so we get it right. Someone will follow up here shortly.',
      leadMagnetId: tool.id,
      state: 'human_review',
    });
  }

  // ---- Otherwise, ask the next question. ----
  const askKey = decision.nextQuestionField ?? missingNow[0] ?? null;
  const def = askKey ? getField(askKey) : null;

  // If we could not read their last answer, do NOT repeat the question verbatim. Ask again
  // with a concrete example. (Claude's own rephrase is preferred when it produced one, since
  // it can respond to what they actually said.)
  const isRetry = !!stuckOnField && stuckOnField === askKey;
  const message = isRetry
    ? decision.responseMessage && decision.responseMessage !== def?.question
      ? decision.responseMessage
      : `${def?.retryHint ?? def?.question ?? 'Tell me a bit more.'}`
    : decision.responseMessage || def?.question || 'Tell me a bit more.';

  await commitState(session, committedState, askKey);
  await recordEvent('lead_question_asked', {
    leadIdentityId: identity.id,
    sessionId: session.id,
    metadata: { field: askKey, state: committedState, retry: isRetry },
  });

  return buildResponse({
    sessionId: session.id,
    action: 'ask_question',
    message,
    questionKey: askKey,
    inputType: (def?.inputType ?? 'text') as QuestionInputType,
    choices: def?.values ?? [],
    leadMagnetId: tool.id,
    state: committedState,
  });
}

/** After this many unparseable attempts at one field, stop asking and get a human. */
export const MAX_ATTEMPTS_PER_FIELD = 3;

async function countAttempts(sessionId: string, fieldKey: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('lead_answers')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('field_key', fieldKey);
  return count ?? 0;
}

// ---------------------------------------------------------------------------

async function finalize(
  session: SessionRow,
  identity: LeadIdentity,
  tool: AcquisitionTool,
  profile: LeadProfileValues,
): Promise<ManyChatResponsePayload> {
  await commitState(session, 'result_generating', null);

  const result = await generateAndStore({
    sessionId: session.id,
    leadIdentityId: identity.id,
    toolId: tool.id,
    profile,
  });

  if (!result) {
    await commitState(session, 'failed', null);
    return buildResponse({
      sessionId: session.id,
      action: 'retry_later',
      message: 'Give me a moment, I will come right back to you with this.',
      state: 'failed',
    });
  }

  await commitState(session, 'result_sent', null);
  await recordEvent('lead_result_sent', {
    leadIdentityId: identity.id,
    sessionId: session.id,
    resultId: result.resultId,
  });

  // ---- 9. Side effects are QUEUED, never awaited. The DM returns now. ----
  await enqueue('result_not_viewed_check', {
    leadIdentityId: identity.id,
    sessionId: session.id,
    resultId: result.resultId,
    delaySeconds: 60 * 60 * 24,
    idempotencyKey: `not_viewed:${result.resultId}`,
  });

  return buildResponse({
    sessionId: session.id,
    action: 'send_result',
    message: result.headline
      ? `${result.headline}. Here is the full breakdown:`
      : 'Here is your breakdown:',
    resultUrl: result.resultUrl || null,
    leadMagnetId: tool.id,
    state: 'result_sent',
  });
}

async function loadOrCreateSession(
  payload: ManyChatInboundPayload,
  identity: LeadIdentity,
): Promise<SessionRow> {
  const toolId = payload.lead_magnet_id ?? DEFAULT_TOOL_ID;

  const { data: open } = await supabaseAdmin
    .from('lead_sessions')
    .select('id, state, lead_magnet_id, revision')
    .eq('lead_identity_id', identity.id)
    .eq('lead_magnet_id', toolId)
    .eq('status', 'open')
    .maybeSingle();

  if (open) return open as SessionRow;

  const { data, error } = await supabaseAdmin
    .from('lead_sessions')
    .insert({
      lead_identity_id: identity.id,
      lead_magnet_id: toolId,
      source_platform: 'instagram',
      creator_account: payload.creator_account,
      source_post_id: payload.source_post_id,
      keyword: payload.keyword,
      conversation_id: payload.conversation_id,
      referring_url: payload.referring_url,
      utm_source: payload.utm_source,
      utm_medium: payload.utm_medium,
      utm_campaign: payload.utm_campaign,
      utm_content: payload.utm_content,
      state: 'initiated',
      status: 'open',
      orchestration_version: ORCHESTRATION_VERSION,
    })
    .select('id, state, lead_magnet_id, revision')
    .single();

  if (error) {
    // 23505 = uq_lead_sessions_open_per_tool. A concurrent start already made it. Use theirs.
    if (error.code === '23505') {
      const { data: raced } = await supabaseAdmin
        .from('lead_sessions')
        .select('id, state, lead_magnet_id, revision')
        .eq('lead_identity_id', identity.id)
        .eq('lead_magnet_id', toolId)
        .eq('status', 'open')
        .maybeSingle();
      if (raced) return raced as SessionRow;
    }
    throw error;
  }

  await recordEvent('lead_session_started', {
    leadIdentityId: identity.id,
    sessionId: String(data.id),
    metadata: { tool: toolId, keyword: payload.keyword, sourcePost: payload.source_post_id },
  });

  return data as SessionRow;
}

async function commitState(session: SessionRow, state: LeadSessionState, questionKey: string | null): Promise<void> {
  await supabaseAdmin
    .from('lead_sessions')
    .update({
      state,
      status: statusFor(state),
      current_question_key: questionKey,
      last_activity_at: new Date().toISOString(),
      revision: session.revision + 1,
    })
    .eq('id', session.id);
  session.state = state;
  session.revision += 1;
}

/**
 * Append-only. A correction supersedes the old row; it never overwrites it.
 *
 * INSERT FIRST, then point the old rows at the new one. The previous version of this did
 * `.update({ superseded_by: null }).is('superseded_by', null)`, which sets null to null: a
 * no-op. Every re-answer left another row with `superseded_by IS NULL`, so "the current
 * answer for this field" became ambiguous and the idx_lead_answers_current partial index was
 * indexing several rows that all claimed to be current.
 */
async function storeRawAnswer(
  sessionId: string,
  identityId: string,
  payload: ManyChatInboundPayload,
): Promise<void> {
  const { data: inserted } = await supabaseAdmin
    .from('lead_answers')
    .insert({
      session_id: sessionId,
      lead_identity_id: identityId,
      field_key: payload.question_key,
      raw_value: payload.answer, // EXACTLY what they typed. Untouched.
      source: 'instagram_dm',
      extraction_method: 'direct',
      external_event_id: payload.event_id ?? null,
      answered_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  // Retire every earlier answer for this field by pointing it at the new one. `.neq(id)`
  // stops the new row from superseding itself.
  if (inserted?.id) {
    await supabaseAdmin
      .from('lead_answers')
      .update({ superseded_by: inserted.id })
      .eq('session_id', sessionId)
      .eq('field_key', payload.question_key as string)
      .neq('id', inserted.id)
      .is('superseded_by', null);
  }

  await supabaseAdmin.from('lead_conversation_messages').insert({
    session_id: sessionId,
    direction: 'inbound',
    role: 'lead',
    content: payload.answer,
    message_type: 'text',
    external_message_id: payload.event_id ?? null,
    provider: 'manychat',
  });
}

async function recentHistory(sessionId: string): Promise<{ role: 'lead' | 'crwn'; content: string }[]> {
  const { data } = await supabaseAdmin
    .from('lead_conversation_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .is('redacted_at', null)
    .order('created_at', { ascending: false })
    .limit(6);

  return (data ?? [])
    .reverse()
    .filter((m) => m.content)
    .map((m) => ({ role: m.role === 'lead' ? ('lead' as const) : ('crwn' as const), content: String(m.content) }));
}

/**
 * Recompute the score.
 *
 * This used to pass EMPTY_BEHAVIOR: a hardcoded blank. Every behavioral signal the scorer
 * computes (result viewed, recalculated, account claimed, setup done) was thrown away, so the
 * score froze at DM time and never moved again. The first real lead came through with 100,000
 * monthly listeners, opened her result, edited the assumptions, and CRWN filed her as
 * "unqualified" and alerted nobody.
 *
 * recomputeScore() reads what she has ACTUALLY done, from the database.
 */
async function rescore(
  identityId: string,
  sessionId: string,
  _profile: LeadProfileValues,
  claudeSignal: number,
): Promise<void> {
  await recomputeScore(identityId, {
    sessionId,
    claudeSignal,
    sourceEvent: 'orchestration',
  });
}

export { resume };
