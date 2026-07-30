// The qualified immediate-call request ("hand-raiser") at the opportunity calculator's save
// boundary.
//
// Three gates, all server-side, all AND-ed: (1) the lead is QUALIFIED under the canonical ICP
// scorer (scoreLead, the same 40/25/20/15 model the Instagram engine uses; no second scoring
// system); (2) the lead EXPLICITLY CONSENTED to a call and text about launching their plan,
// with the consent text version and timestamp stored; (3) the lead ACTIVELY REQUESTED the call
// (the request itself, never inferred interest). Anything less is recorded as a lead event and
// never becomes a founder SMS.
//
// Everything here is pure so it can be tested without a database. The route owns persistence,
// idempotency (acquisition_events insert-as-claim) and the actual send.

import { scoreLead, EMPTY_BEHAVIOR } from './leadScoring';
import type { LeadProfileValues } from './toolAdapters';
import type { LeadScore, ScoreBand } from './types';

/** Version every stored consent record carries. Bump when the consent copy changes. */
export const CALL_CONSENT_VERSION = 'call-consent-2026-07-30.v1';

/** The exact consent copy the artist agrees to. Rendered by the UI and stored by the server. */
export const CALL_CONSENT_TEXT =
  'I agree that CRWN may call and text me at this number about launching my CRWN plan.';

/** The one band that triggers a founder alert. Same threshold the high-intent email alert uses. */
export const QUALIFIED_BAND: ScoreBand = 'sales_priority';

// Mirrors fieldRegistry's MAX_AUDIENCE / MAX_CENTS bounds.
const MAX_COUNT = 100_000_000;
const MAX_CENTS = 100_000_000;

/** Structural subset of a LeadMagnetConfig input, so this lib does not import the registry. */
export interface CalculatorInputDef {
  key: string;
  type: string;
  options?: { value: string }[];
}

export type SanitizedCalculatorInputs = Record<string, number | string>;

/**
 * Allowlist + bound the raw wizard values against the tool's own input definitions.
 * Currency inputs arrive in DOLLARS from the wizard (same convention PublicToolClient uses)
 * and are stored in cents. Unknown keys are dropped, not stored.
 */
export function sanitizeCalculatorInputs(
  defs: CalculatorInputDef[],
  raw: unknown,
): SanitizedCalculatorInputs {
  const out: SanitizedCalculatorInputs = {};
  if (!raw || typeof raw !== 'object') return out;
  const source = raw as Record<string, unknown>;
  for (const def of defs) {
    const v = source[def.key];
    if (v == null) continue;
    if (def.type === 'number') {
      const n = Number(v);
      if (Number.isFinite(n)) out[def.key] = Math.min(MAX_COUNT, Math.max(0, Math.round(n)));
    } else if (def.type === 'currency') {
      const n = Number(v);
      if (Number.isFinite(n)) out[def.key] = Math.min(MAX_CENTS, Math.max(0, Math.round(n * 100)));
    } else if (def.type === 'option') {
      const s = String(v);
      if (def.options?.some((o) => o.value === s)) out[def.key] = s;
    }
  }
  return out;
}

/**
 * Normalize a callback number to E.164. US-biased on purpose (a bare 10-digit number gets +1,
 * matching how artists actually type their number), international accepted with a leading +.
 * Returns null when the number cannot be a real callback number.
 */
export function normalizeCallbackPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (/[A-Za-z]/.test(trimmed)) return null;
  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/**
 * Score the calculator's own answers through the canonical ICP scorer. The unified calculator's
 * keys map onto the lead-profile fields the scorer already reads; `owned_contacts` is the same
 * fact `email_list_size` measures (contacts the artist can reach without an algorithm).
 */
export function scoreCalculatorLead(inputs: SanitizedCalculatorInputs): LeadScore {
  const profile = {
    social_followers: numOrNull(inputs.social_followers),
    monthly_listeners: numOrNull(inputs.monthly_listeners),
    email_list_size: numOrNull(inputs.owned_contacts),
    direct_fan_revenue_cents: numOrNull(inputs.direct_fan_revenue_cents),
    monetization_status: strOrNull(inputs.monetization_status),
  } as unknown as LeadProfileValues;
  // The artist is looking at their result when they raise their hand; nothing else is claimed.
  return scoreLead({ profile, behavior: { ...EMPTY_BEHAVIOR, resultViewed: true } });
}

export interface CallRequestDecision {
  qualified: boolean;
  band: ScoreBand;
  score: number;
  reasons: string[];
}

/** The qualification gate, recomputed server-side from stored inputs. Never trusts a client band. */
export function decideCallRequest(inputs: SanitizedCalculatorInputs): CallRequestDecision {
  const scored = scoreCalculatorLead(inputs);
  return {
    qualified: scored.band === QUALIFIED_BAND,
    band: scored.band,
    score: scored.total,
    reasons: scored.reasonCodes,
  };
}

/** ~1.2M -> "~1.2M", 480000 -> "~480k", 900 -> "~900". Bands only; no false precision in an SMS. */
export function approxCount(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return 'unknown';
  if (n >= 1_000_000) return `~${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `~${Math.round(n / 1_000)}k`;
  return `~${Math.round(n)}`;
}

export interface FounderSmsInput {
  phone: string;
  artistName?: string | null;
  followers: number | null;
  listeners: number | null;
  directRevenueCents: number | null;
  monetizationStatus?: string | null;
  /** One line describing what the calculator recommended, e.g. "$4,200 to $9,800/mo system". */
  planSummary?: string | null;
  band: ScoreBand;
  score: number;
  adminUrl: string;
}

/**
 * Minimum useful context only. No calculator transcript, no email, no full financial detail:
 * an SMS is the least private channel this platform uses.
 */
export function buildFounderSmsBody(input: FounderSmsInput): string {
  const revenue =
    input.directRevenueCents != null && input.directRevenueCents > 0
      ? `$${Math.round(input.directRevenueCents / 100).toLocaleString()}/mo direct today`
      : 'no direct revenue reported';
  const lines = [
    `CRWN hot lead: call requested${input.artistName ? ` by ${input.artistName}` : ''}.`,
    `Call back: ${input.phone}`,
    `${approxCount(input.followers)} followers, ${approxCount(input.listeners)} monthly listeners, ${revenue}`,
    input.planSummary ? `Plan: ${input.planSummary}` : null,
    `Band: ${input.band} (score ${input.score})`,
    input.adminUrl,
  ].filter(Boolean);
  return (lines as string[]).join('\n').slice(0, 900);
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}
