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
import { mirrorFunnelDirect } from '../analytics/acquisitionFunnelMirror';
import { LEAD_MAGNETS, getLeadMagnet } from '../leadMagnets/registry';
import { decide } from './claudeDecisionService';
import { getField, normalizeDeterministic } from './fieldRegistry';
import { fallbackDecision } from './fallbackDecision';
import { loadProfile, applyValues } from './progressiveProfiling';
import { generateAndStore, reissueLatestResultLink } from './resultGeneration';
import { send } from './channels';
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

  // A profile_update carries new contact info only (an email she just handed over in-window),
  // which was persisted just above. Acknowledge and STOP here: it must NOT fall through into the
  // question/decision engine below, or handing over an email would spin up a session, re-ask a
  // question, and reopen a conversation she already finished. 'complete' tells ManyChat there is
  // nothing more to do; the ManyChat flow sends its own "got it" and does not render this message.
  if (payload.event_type === 'profile_update') {
    // She handed over an email EXPECTING her result in her inbox, not only in the DM. Honor the
    // promise: rotate a fresh link to her latest result and email it through the compliant send
    // path (suppression + one-click unsubscribe + postal footer are injected there). Fire-safe:
    // the DM already delivered the result via the button, so a failed email must NEVER fail this
    // ack or re-open the finished conversation.
    let emailed = false;
    if (identity.email && identity.consentEmail) {
      try {
        const link = await reissueLatestResultLink(identity.id);
        if (link) {
          const { subject, html } = buildResultCopyEmail(link.headline, link.url, link.toolSlug);
          const outcome = await send({
            identity,
            channel: 'email',
            text: '',
            subject,
            html,
            idempotencyKey: `result_copy:${link.resultId}`,
            // She asked for this copy right now; do not let the 24h nurture cap swallow it.
            transactional: true,
          });
          emailed = outcome.sent;
        }
      } catch {
        // Swallow: the result is already in her DM. The email is a bonus, never a blocker.
      }
    }
    return buildResponse({
      sessionId: null,
      action: 'complete',
      message: emailed
        ? 'Sent. Check your inbox for your copy.'
        : 'Got it, saved. Your breakdown is in the button above.',
      state: null,
    });
  }

  // A lead can switch tools MID-conversation by typing another tool's keyword ("vault", "proof",
  // "mission", "clip", "worth"). ManyChat's waiting question node swallows that word as an
  // ANSWER, so without this check it is rejected as an unparseable number and the old question
  // re-asks forever, trapping the lead in the previous tool. Detect an exact keyword and pivot:
  // treat the turn as a fresh session_start for the requested tool. The flow nodes are
  // tool-agnostic (they render crwn_message), so the conversation seamlessly becomes the new
  // tool's flow even inside the old automation's loop.
  // The pivot also applies to an ASK-IN-OPENER session_start (its body carries a question_key,
  // meaning the reply is fresh Data-Collection input, so a bare keyword there is intent). A
  // BUTTON session_start carries no question_key and its `answer` is just stale last_input_text
  // (often the comment keyword itself), so it must never be pivoted on or stored.
  if (payload.event_type === 'answer' || (payload.event_type === 'session_start' && payload.question_key)) {
    const pivotTool = keywordTool(payload.answer);
    if (pivotTool) {
      payload = {
        ...payload,
        event_type: 'session_start',
        lead_magnet_id: pivotTool,
        question_key: null,
        answer: null,
      };
    }
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

  // A duplicated ManyChat flow that was only HALF-edited is the classic clone mistake: the
  // keyword was changed but lead_magnet_id was not (or vice versa), and the flow silently runs
  // the wrong tool. Both ride in the same body, so disagreement is detectable. Log it loudly;
  // this Vercel log line is the tell whenever "the wrong tool answered".
  if (payload.event_type === 'session_start' && payload.keyword) {
    const kwTool = keywordTool(payload.keyword);
    if (kwTool && kwTool !== tool.id) {
      console.warn(
        `[acquisition] session_start keyword "${payload.keyword}" maps to ${kwTool} but lead_magnet_id is ${tool.id}. A duplicated ManyChat flow is likely half-edited.`,
      );
    }
  }

  // A fresh session_start is a fresh CONVERSATION: clear THIS tool's required fields from the
  // profile so the lead re-answers every one of them. A returning lead was skipping any question
  // whose value was still cached in the shared profile (e.g. audience carried over from a prior
  // Worth run), so the Vault only asked about the vault and not the audience. Clearing gives
  // updated numbers and a consistent multi-question flow. Only THIS tool's required fields are
  // cleared, and they are re-collected in the same conversation, so nothing is lost net.
  if (payload.event_type === 'session_start') {
    const cols: string[] = [];
    const extraKeys: string[] = [];
    for (const k of tool.requiredFields) {
      const def = getField(k);
      if (!def) continue;
      if (def.column) cols.push(def.column);
      else extraKeys.push(k); // column: null fields live in the `extra` jsonb
    }
    if (cols.length > 0 || extraKeys.length > 0) {
      const update: Record<string, unknown> = Object.fromEntries(cols.map((c) => [c, null]));
      if (extraKeys.length > 0) {
        // `extra` is one jsonb column, so read-modify-write to drop just THIS tool's keys and
        // leave any other tool's extra answers intact.
        const { data: cur } = await supabaseAdmin
          .from('lead_profiles')
          .select('extra')
          .eq('lead_identity_id', identity.id)
          .maybeSingle();
        const extra = { ...((cur?.extra as Record<string, unknown>) ?? {}) };
        for (const k of extraKeys) delete extra[k];
        update.extra = extra;
      }
      await supabaseAdmin
        .from('lead_profiles')
        .update(update)
        .eq('lead_identity_id', identity.id);
    }
  }

  // An ASK-IN-OPENER flow collects the first answer inside the opening private reply and sends
  // it WITH session_start (question_key hardcoded in the body, the reply in last_input_text).
  // That saves the lead a whole interaction: one question tool goes reply -> result directly.
  const hasInlineAnswer =
    payload.event_type === 'session_start' && !!payload.question_key && !!payload.answer;

  // ---- 1. Store the raw answer, before anything can reinterpret it. ----
  if ((payload.event_type === 'answer' || hasInlineAnswer) && payload.question_key && payload.answer) {
    await storeRawAnswer(session.id, identity.id, payload);
  }

  // ---- 2 + 3. Normalize deterministically, and load what we already know. ----
  const loaded = await loadProfile(identity);
  const deterministic: Record<string, AttributedValue> = {};

  if ((payload.event_type === 'answer' || hasInlineAnswer) && payload.question_key && payload.answer) {
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

  // A fresh session_start ALWAYS opens with a question, even when every required field is already
  // on file from a previous run. Without this, a RETURNING lead gets send_result immediately on
  // session_start; the ManyChat flow renders that at the waiting question node and then STALLS
  // there, before the email gate and the breakdown link ever fire. Re-asking the first field also
  // lets a returning lead update their numbers. Only session_start is forced; answers resolve
  // normally and still finalize as soon as the last field lands.
  // Not forced when the opener already collected the first answer (ask-in-opener): if it parsed,
  // the flow moves straight to the next question or the result; if it did not parse, the field is
  // still missing and the normal ask path re-asks it anyway.
  const forceOpeningQuestion =
    payload.event_type === 'session_start' && tool.requiredFields.length > 0 && !hasInlineAnswer;

  // ---- Ready to generate? Run the EXISTING calculator and send the link. ----
  if (!forceOpeningQuestion && (committedState === 'ready_for_result' || (missingNow.length === 0 && !facts.needsHumanReview))) {
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
  const askKey = forceOpeningQuestion
    ? tool.requiredFields[0]
    : decision.nextQuestionField ?? missingNow[0] ?? null;
  const def = askKey ? getField(askKey) : null;
  // A forced opening question means the session is collecting again, not ready_for_result.
  const askState = forceOpeningQuestion ? 'collecting_required_metrics' : committedState;

  // If we could not read their last answer, do NOT repeat the question verbatim. Ask again
  // with a concrete example. (Claude's own rephrase is preferred when it produced one, since
  // it can respond to what they actually said.)
  const isRetry = !!stuckOnField && stuckOnField === askKey;
  const message = forceOpeningQuestion
    ? def?.question ?? 'Tell me a bit more.'
    : isRetry
      ? decision.responseMessage && decision.responseMessage !== def?.question
        ? decision.responseMessage
        : `${def?.retryHint ?? def?.question ?? 'Tell me a bit more.'}`
      : decision.responseMessage || def?.question || 'Tell me a bit more.';

  await commitState(session, askState, askKey);
  await recordEvent('lead_question_asked', {
    leadIdentityId: identity.id,
    sessionId: session.id,
    metadata: { field: askKey, state: askState, retry: isRetry },
  });

  return buildResponse({
    sessionId: session.id,
    action: 'ask_question',
    message,
    questionKey: askKey,
    inputType: (def?.inputType ?? 'text') as QuestionInputType,
    choices: def?.values ?? [],
    leadMagnetId: tool.id,
    state: askState,
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
    // TOPLINE ONLY. In the gated flow this message is the free headline number, and the very
    // next node asks for an email before the full breakdown. So it must NOT promise the
    // breakdown inline ("Here is the full breakdown:" then an email ask reads as a broken
    // promise). State the number and stop; the email ask ("Want the full breakdown...") flows
    // straight out of it. resultUrl still rides along for the post-email delivery node.
    message: result.headline ? `${result.headline}.` : 'I ran your numbers.',
    resultUrl: result.resultUrl || null,
    leadMagnetId: tool.id,
    state: 'result_sent',
  });
}

/** The transactional "here is your copy" email sent when a lead hands over an email in-DM. The
 *  one-click unsubscribe + postal footer are injected downstream at the channels.ts send choke
 *  point, so this body must not add its own. No em dash in any user-facing copy (CLAUDE.md). */
function buildResultCopyEmail(
  headline: string,
  url: string,
  toolSlug: string,
): { subject: string; html: string } {
  const cfg = getLeadMagnet(toolSlug);
  const toolName = cfg?.name || 'CRWN';
  const topline = headline.trim() ? `${headline.trim().replace(/\.+$/, '')}.` : 'Your numbers are ready.';
  const subject = `Your ${toolName} breakdown`;
  const html = `
    <div style="max-width:460px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0D0D0D;">
      <p style="font-size:18px;font-weight:600;line-height:1.4;margin:0 0 12px;">${escapeEmailHtml(topline)}</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#333;">Here is your full breakdown, saved so it does not get buried in your DMs. It shows where the money is and what to do next.</p>
      <a href="${escapeEmailHtml(url)}" style="display:inline-block;background:#D4AF37;color:#0D0D0D;font-weight:600;text-decoration:none;padding:12px 26px;border-radius:9999px;font-size:15px;">See my breakdown</a>
    </div>`;
  return { subject, html };
}

function escapeEmailHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The keyword a lead types to start (or switch to) a tool, exactly one bare word. Built from
 * the lead-magnet REGISTRY (each config's dmKeywords), so adding a tool there registers its
 * keywords here automatically; there is no second list to forget. Keep the ManyChat trigger
 * keywords equal to dmKeywords. A sentence never matches, so a real answer that merely
 * mentions a tool cannot be hijacked.
 */
const KEYWORD_TOOLS: Record<string, string> = Object.fromEntries([
  ...LEAD_MAGNETS.flatMap((m) => m.dmKeywords.map((k) => [k.toLowerCase(), m.slug] as [string, string])),
  ['worth', 'worth'],
]);

function keywordTool(answer: string | null | undefined): string | null {
  if (!answer) return null;
  const word = answer.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!word || word.length > 12 || answer.trim().includes(' ')) return null;
  return KEYWORD_TOOLS[word] ?? null;
}

async function loadOrCreateSession(
  payload: ManyChatInboundPayload,
  identity: LeadIdentity,
): Promise<SessionRow> {
  // A CONTINUING turn (answer/next/finalize/event) belongs to the session the lead is already in.
  // It must NOT fall back to DEFAULT_TOOL: the answer request carries no lead_magnet_id, so that
  // fallback silently routed every non-Worth tool's answers into a WORTH session, and a Vault
  // lead got the Worth number on the Worth page. Only session_start carries a lead_magnet_id and
  // starts a new session; every other turn resolves an EXISTING one.
  if (payload.event_type !== 'session_start') {
    // Most precise: the explicit session id (the crwn_session_id pill), when the flow sends it.
    if (payload.session_id) {
      const { data: byId } = await supabaseAdmin
        .from('lead_sessions')
        .select('id, state, lead_magnet_id, revision')
        .eq('id', payload.session_id)
        .eq('lead_identity_id', identity.id)
        .maybeSingle();
      if (byId) return byId as SessionRow;
    }
    // Otherwise the lead's most-recent OPEN session. A lead is in one active conversation, and it
    // is whichever tool they last started, so a Vault answer lands in the Vault session even when
    // the flow does not echo the session id.
    const { data: recent } = await supabaseAdmin
      .from('lead_sessions')
      .select('id, state, lead_magnet_id, revision')
      .eq('lead_identity_id', identity.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent) return recent as SessionRow;
  }

  const toolId = payload.lead_magnet_id ?? DEFAULT_TOOL_ID;

  const { data: open } = await supabaseAdmin
    .from('lead_sessions')
    .select('id, state, lead_magnet_id, revision')
    .eq('lead_identity_id', identity.id)
    .eq('lead_magnet_id', toolId)
    .eq('status', 'open')
    .maybeSingle();

  if (open) {
    // A new session_start is a FRESH conversation: close the prior open session for this tool
    // rather than reusing it, so the lead re-answers, gets a freshly COMPUTED result (never a
    // stale cached one), and the unique open-session-per-tool constraint stays satisfied when we
    // insert below. Only session_start reaches here; continuing turns resolved above.
    await supabaseAdmin
      .from('lead_sessions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', open.id);
  }

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

  // Mirror into the funnel with the IG post as the video dimension (attribution is right here on
  // the payload, so no extra query). One per session -> page_viewed for the ManyChat funnel.
  await mirrorFunnelDirect(supabaseAdmin, 'page_viewed', `ig_view:${data.id}`, {
    calculator: toolId,
    video: payload.source_post_id,
    creatorAccount: payload.creator_account,
    keyword: payload.keyword,
    campaign: payload.utm_campaign,
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
