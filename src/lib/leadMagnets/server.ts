// Server-only helpers for lead-magnet API routes. NEVER import into a client bundle.
// Follows the repo pattern of taking the caller's service-role client as an argument
// (like recordFanEvent), so each route keeps building its own build-safe admin client.

import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// High-entropy, URL-safe token for public (pre-signup) result resume.
export function generatePublicToken(): string {
  return randomBytes(24).toString('base64url');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}
export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

// Respect the global suppression list before any transactional send.
export async function isEmailSuppressed(admin: SupabaseClient, email: string): Promise<boolean> {
  try {
    const { data } = await admin.from('email_suppressions').select('email').ilike('email', email).maybeSingle();
    return !!data;
  } catch {
    return false; // fail open: a suppression-lookup error must not silently block a legit send path
  }
}

// Best-effort analytics insert. Never throws (mirrors recordFanEvent).
export async function recordLmEvent(
  admin: SupabaseClient,
  event: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await admin.from('lead_magnet_events').insert({
      event_type: event,
      tool_slug: str(meta.toolSlug),
      context: enumOrNull(meta.context, ['public', 'artist']),
      authed: typeof meta.authed === 'boolean' ? meta.authed : null,
      step: intOrNull(meta.step),
      total_steps: intOrNull(meta.totalSteps),
      source: str(meta.source),
      utm_source: str(meta.utmSource),
      utm_medium: str(meta.utmMedium),
      utm_campaign: str(meta.utmCampaign),
      utm_content: str(meta.utmContent),
      result_id: uuidOrNull(meta.resultId),
      conversion_target: str(meta.conversionTarget),
      generator_version: str(meta.generatorVersion),
      reason_code: str(meta.reasonCode),
    });
  } catch {
    // swallow
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v.slice(0, 200) : null);
const intOrNull = (v: unknown): number | null => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
const enumOrNull = (v: unknown, allowed: string[]): string | null => (typeof v === 'string' && allowed.includes(v) ? v : null);
const uuidOrNull = (v: unknown): string | null =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
