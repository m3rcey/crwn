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

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

/**
 * Timeout in MILLISECONDS (the TS SDK's unit; the Python SDK uses seconds, and mixing them
 * up produces a 10-second timeout that looks like a 10-millisecond one).
 *
 * A ManyChat External Request has its own timeout, and an Instagram DM that takes 30
 * seconds to reply is a dead conversation. So we cap hard and fall back to the
 * deterministic engine rather than making the artist wait.
 */
export const DECISION_TIMEOUT_MS = parseInt(process.env.ANTHROPIC_DECISION_TIMEOUT_MS || '', 10) || 8000;

export const DECISION_MAX_TOKENS = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '', 10) || 1024;

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-anthropic-key-for-build',
      timeout: DECISION_TIMEOUT_MS,
      // The SDK retries 429/5xx/connection errors on its own. One retry, because the
      // caller (a live DM) cannot wait for three, and we have a complete fallback anyway.
      maxRetries: 1,
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
