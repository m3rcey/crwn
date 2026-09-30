// The Anthropic client.
//
// CRWN's existing AI code (src/lib/ai/*, /api/admin/agent/*) uses the `openai` SDK pointed
// at DeepSeek via a baseURL override. That is a separate provider for a separate job (the
// artist-facing AI manager) and is left completely alone.
//
// This client is for the acquisition decision service only, and it is Anthropic-native.
//
// Build safety (CLAUDE.md): the key falls back to a dummy string. NEVER use `!` on an env
// var here. Vercel collects static pages at build time with no secrets present, and a
// non-null assertion crashes that build. `isAnthropicConfigured()` is the runtime check.

import Anthropic from '@anthropic-ai/sdk';

/**
 * Haiku 4.5: the cheapest and fastest current model, and the job is small (read one DM
 * reply, extract a field, write one sentence). Opus 4.8 was the default until 2026-09-29 and
 * took 5 to 7s per call, so 12 of 28 of its replies (all at 9s or more of server time)
 * outlived ManyChat's External Request timeout and never reached the lead.
 *
 * Changing this via ANTHROPIC_MODEL? The request shape depends on the model, see
 * decisionRequestOptions() below. Opus 5.5 and Fable 5.1 reject the forced tool_choice this
 * service relies on, so they would fall back on every call.
 */
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

/**
 * Timeout in MILLISECONDS (the TS SDK's unit; the Python SDK uses seconds, and mixing them
 * up produces a 10-second timeout that looks like a 10-millisecond one).
 *
 * The budget is ManyChat's, not ours: its External Request gives up at roughly 9 to 10s and
 * then sends NOTHING, while CRWN keeps going and advances state the lead never saw. The rest
 * of an answer turn takes 2 to 3s, so the model gets 4s and the deterministic engine takes
 * over past that.
 */
export const DECISION_TIMEOUT_MS = parseInt(process.env.ANTHROPIC_DECISION_TIMEOUT_MS || '', 10) || 4000;

/**
 * Per-model request options. The same call is not valid on every model:
 * - Haiku 4.5 (and Sonnet 4.5) REJECT `output_config.effort` with a 400, so it is omitted.
 * - Sonnet 5 and Opus 5 run adaptive thinking when `thinking` is omitted, which is slower
 *   and does not combine with a forced tool call, so thinking is disabled explicitly.
 * - Everything else (the Opus 4.x line, Sonnet 4.6) keeps low effort with no thinking, which
 *   is what omitting `thinking` means there.
 */
export function decisionRequestOptions(model: string): {
  output_config?: { effort: 'low' };
  thinking?: { type: 'disabled' };
} {
  if (/^claude-(haiku-4-5|sonnet-4-5)/.test(model)) return {};
  if (/^claude-(sonnet-5|opus-5)(?!-5)/.test(model)) {
    return { output_config: { effort: 'low' }, thinking: { type: 'disabled' } };
  }
  return { output_config: { effort: 'low' } };
}

export const DECISION_MAX_TOKENS = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '', 10) || 1024;

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-anthropic-key-for-build',
      timeout: DECISION_TIMEOUT_MS,
      // No retries. The SDK retries timeouts too, so one retry doubled the worst case to
      // 2 x the timeout, well past ManyChat's limit. A live DM cannot wait for a second
      // attempt, and the deterministic fallback is always there.
      maxRetries: 0,
    });
  }
  return client;
}

/**
 * Is Claude actually usable right now?
 *
 * Every call site checks this and routes to fallbackDecision() when it is false. That means
 * CRWN can ship this entire feature with ANTHROPIC_API_KEY unset and the acquisition flow
 * still works end to end, just with deterministic question ordering instead of natural
 * conversation. Claude is an upgrade, not a dependency.
 */
export function isAnthropicConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return !!key && key !== 'dummy-anthropic-key-for-build' && key.length > 10;
}
