// Builds the thin payload ManyChat receives.
//
// This module exists to be a CHOKE POINT. Every response to ManyChat is constructed here
// and nowhere else, so there is exactly one place to audit for leaks.
//
// What must never appear in a response, no matter how convenient:
//   - lead_identity_id, session UUIDs, result UUIDs (opaque session_id only)
//   - the artist's email, phone, or any profile value we hold
//   - Claude's reasoning, confidence, reason codes, or prompt content
//   - database errors, stack traces, or constraint names
//   - the raw result token (it goes out ONLY inside the result_url)
//
// ManyChat custom fields are visible in the ManyChat UI and travel through a third party.
// Treat everything here as public.

import type { AcquisitionAction, LeadSessionState, ManyChatResponsePayload, QuestionInputType } from '../acquisition/types';

export interface BuildResponseInput {
  sessionId: string | null;
  action: AcquisitionAction;
  message: string;
  questionKey?: string | null;
  inputType?: QuestionInputType | null;
  choices?: string[];
  resultUrl?: string | null;
  leadMagnetId?: string | null;
  state?: LeadSessionState | null;
}

export function buildResponse(input: BuildResponseInput): ManyChatResponsePayload {
  return {
    ok: true,
    session_id: input.sessionId,
    action: input.action,
    message: clampMessage(input.message),
    question_key: input.questionKey ?? null,
    input_type: input.inputType ?? null,
    choices: (input.choices ?? []).slice(0, 10),
    result_url: input.resultUrl ?? null,
    resume_token: null,
    lead_magnet_id: input.leadMagnetId ?? null,
    status: input.state ?? null,
    retryable: false,
    error_code: null,
  };
}

/**
 * An error ManyChat can act on. `retryable` drives whether its flow retries or gives up.
 *
 * Note that `message` is a HUMAN-SAFE sentence, not the internal error. If ManyChat is
 * configured to echo `message` into the DM (and it often is), the artist must never see
 * "duplicate key value violates unique constraint uq_lead_sessions_open_per_tool".
 */
export function buildError(
  code: string,
  retryable: boolean,
  humanMessage = 'Something went wrong on our end. Give it a moment and try again.',
): ManyChatResponsePayload {
  return {
    ok: false,
    session_id: null,
    action: retryable ? 'retry_later' : 'human_review',
    message: humanMessage,
    question_key: null,
    input_type: null,
    choices: [],
    result_url: null,
    resume_token: null,
    lead_magnet_id: null,
    status: null,
    retryable,
    error_code: code,
  };
}

/** Instagram DMs are not essays. Keep CRWN's voice short. */
const MAX_MESSAGE_CHARS = 900;

function clampMessage(m: string): string {
  const s = (m || '').trim();
  if (!s) return 'Thanks. Let me pull that together for you.';
  return s.length > MAX_MESSAGE_CHARS ? s.slice(0, MAX_MESSAGE_CHARS - 1).trimEnd() + '…' : s;
}
