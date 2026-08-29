/**
 * The one contract every platform adapter implements.
 *
 * Deliberately narrow. An adapter is handed already-public media URLs, an already-validated
 * caption and the platform's own extras, and it returns an id and a permalink or throws a
 * classified error. It does NOT read the database, sign R2 URLs, decide whether it is allowed to
 * run, or know what time it is. All of that belongs to the tick, once, rather than six times.
 *
 * ONE FAILURE SHAPE. Every adapter throws PublishError with the same classification the Instagram
 * path established, so the tick's retry decision is a single branch that never learns a platform.
 * When in doubt an adapter classifies a failure as PERMANENT: a human reading a failed row is
 * safer than a loop hammering a provider with something it will never accept.
 */

import type { PostKind, Platform } from './capabilities';

export type FailureKind =
  | 'rate_limit'
  | 'server'
  | 'auth'
  | 'media_fetch'
  | 'media_format'
  | 'audit_required'
  | 'billing'
  | 'permanent';

export interface FailureClassification {
  retryable: boolean;
  kind: FailureKind;
  message: string;
  code?: number | string;
}

export class PublishError extends Error {
  classification: FailureClassification;
  constructor(message: string, classification: FailureClassification) {
    super(message);
    this.name = 'PublishError';
    this.classification = classification;
  }
}

/**
 * Everything an adapter is given. Media URLs are ALREADY PUBLIC and ALREADY IN ORDER: the tick
 * signs them fresh at publish time, and the position in the array is the position in the post.
 */
export interface PublishRequest {
  kind: PostKind;
  caption: string;
  /** Public HTTPS URLs, in display order. Empty for text-only kinds. */
  mediaUrls: string[];
  /**
   * Platform-specific extras, validated by the adapter. Examples:
   *   youtube:  { title, privacyStatus, tags }
   *   x:        { parts: string[] } for a thread, { title, blocks } for an article
   *   facebook: { scheduledFor: ISO string } to hand the clock to the platform
   */
  payload: Record<string, unknown>;
  /** Present only when the tick wants the platform to own the timing (Facebook). */
  scheduledFor?: Date;
}

export interface PublishResult {
  providerPostId: string;
  permalink: string | null;
  /**
   * True when the platform accepted the post to publish LATER on its own clock. The tick stores
   * this as 'handed_off' and never touches it again.
   */
  handedOff?: boolean;
  /** Anything worth keeping for a debugger. Must already have credentials stripped. */
  providerResponse?: Record<string, unknown>;
}

export interface PlatformAdapter {
  platform: Platform;
  /**
   * Whether the platform can publish at a future time itself. When true the tick hands the slot
   * over rather than waiting for it, which is strictly more reliable: CRWN's downtime can no
   * longer miss the post.
   */
  supportsNativeScheduling: boolean;
  publish(req: PublishRequest): Promise<PublishResult>;
}

/**
 * Remove credentials from anything about to be logged or stored.
 * Tokens ride in query strings, headers and request bodies, so an unredacted error would put
 * one into the function log and, worse, into social_post_targets.last_error.
 */
export function redactSecrets(text: string, secrets: Array<string | undefined>): string {
  let out = String(text ?? '');
  for (const s of secrets) {
    if (s && s.length >= 8) out = out.split(s).join('[REDACTED]');
  }
  return out
    .replace(/(access_token=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/g, '$1[REDACTED]');
}

/** Read one required extra from the payload, or throw a permanent error naming it. */
export function requireString(payload: Record<string, unknown>, key: string, platform: string): string {
  const v = payload[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new PublishError(`${platform} needs payload.${key}`, {
      retryable: false,
      kind: 'permanent',
      message: `missing ${key}`,
    });
  }
  return v.trim();
}

/** Shared HTTP classification for the providers that speak plain status codes. */
export function classifyHttp(status: number, message: string, code?: number | string): FailureClassification {
  if (status === 429) return { retryable: true, kind: 'rate_limit', message, code };
  if (status >= 500) return { retryable: true, kind: 'server', message, code };
  if (status === 401 || status === 403) return { retryable: false, kind: 'auth', message, code };
  if (status === 402) return { retryable: false, kind: 'billing', message, code };
  return { retryable: false, kind: 'permanent', message, code };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll something until it settles. Shared by every provider with an async processing step
 * (Meta containers, YouTube processing, TikTok publish status, X media processing).
 */
export async function pollUntil<T>(
  read: () => Promise<{ done: boolean; ok: boolean; value?: T; message?: string }>,
  label: string,
  maxAttempts = 30,
  intervalMs = 2000
): Promise<T | undefined> {
  for (let i = 0; i < maxAttempts; i++) {
    const s = await read();
    if (s.done) {
      if (!s.ok) {
        throw new PublishError(`${label}: ${s.message ?? 'processing failed'}`, {
          retryable: false,
          kind: 'media_format',
          message: s.message ?? 'processing failed',
        });
      }
      return s.value;
    }
    await sleep(intervalMs);
  }
  // Timing out is retryable: the provider may simply still be working, and the next tick can
  // pick it up.
  throw new PublishError(`${label} did not finish in time`, {
    retryable: true,
    kind: 'server',
    message: 'processing timeout',
  });
}
