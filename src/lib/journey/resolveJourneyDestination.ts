// The single post-signup journey resolver.
//
// One place decides where an artist lands after signup + onboarding, given their full context. It
// COMPOSES the pieces that already exist rather than duplicating routing conditionals:
//   - buildDraftConfig (src/lib/leadResults/postSetupDestination.ts) maps a claimed calculator to its
//     real, prefilled builder (OYF -> /own-your-fans/plan, Worth -> /offers/new, ...).
//   - the opportunityFunnels registry supplies opportunity/result versions.
// It adds only the surrounding decision layer: account gate, setup gate, Rise Mode flag fallback,
// experiment passthrough, and an open-redirect-safe returnTo. It NEVER trusts a client id: the caller
// resolves ownership server-side and passes the resolved context in.

import { buildDraftConfig } from '@/lib/leadResults/postSetupDestination';
import { getFunnelByToolKey } from '@/lib/opportunityFunnels/registry';
import type { LeadMagnetSeed } from '@/lib/leadResults/handoffSeed';

const RISE_MODE_ROUTE = '/profile/artist';
const DASHBOARD_ROUTE = '/profile/artist';

/**
 * Validate a returnTo as a SAFE internal path. Prevents open redirects: must be a single-slash
 * relative path, no scheme, no protocol-relative `//`, no backslash, bounded length. Returns null
 * for anything unsafe (the caller then omits returnTo).
 */
export function safeInternalPath(p: string | null | undefined): string | null {
  if (typeof p !== 'string') return null;
  const s = p.trim();
  if (!s || s.length > 512) return null;
  if (!s.startsWith('/')) return null; // must be relative
  if (s.startsWith('//') || s.startsWith('/\\')) return null; // protocol-relative / backslash tricks
  if (/[\\\x00-\x1f]/.test(s)) return null; // control chars / backslashes
  if (s.includes('://')) return null; // belt and suspenders
  return s;
}

export interface JourneyContext {
  /** Does the caller have an artist_profiles row? (Resolved server-side, never from the client.) */
  isArtist: boolean;
  /** artist_profiles.setup_completed. */
  setupComplete: boolean;
  /** The caller's most recent claimed calculator result, or null. */
  seed: LeadMagnetSeed | null;
  /** admin_settings.quest_engine, resolved server-side. */
  questEngineEnabled: boolean;
  /** The experiment variant for this visitor, re-derived server-side. Passthrough only. */
  experimentVariant?: string | null;
  /** A requested return destination (validated here). */
  returnTo?: string | null;
}

export type JourneyReason =
  | 'needs_account'
  | 'setup_incomplete'
  | 'builder_restored'
  | 'fallback_dashboard';

export interface JourneyDestination {
  path: string;
  params: Record<string, string>;
  reason: JourneyReason;
  /** The experience/opportunity this journey belongs to, for analytics. */
  opportunityKey: string | null;
  toolSlug: string | null;
}

/**
 * Resolve the next destination. Pure and deterministic so it is fully testable without a request.
 * Ordering is deliberate: account gate, then setup gate (never bypassed), then the restored builder,
 * then a safe dashboard fallback. Rise Mode only ever adds a returnTo; it never becomes the
 * destination when its flag is off, so no broken quest route is ever exposed.
 */
export function resolveJourneyDestination(ctx: JourneyContext): JourneyDestination {
  const base = { opportunityKey: null as string | null, toolSlug: null as string | null };

  // 1. No account yet -> the real account/publish path. Never fabricate an artist.
  if (!ctx.isArtist) {
    return { path: '/welcome', params: {}, reason: 'needs_account', ...base };
  }

  // 2. Setup not finished -> setup wins. The (main) layout hard-gate would bounce here anyway; do
  //    not bypass required, repository-backed setup.
  if (!ctx.setupComplete) {
    return { path: '/setup', params: {}, reason: 'setup_incomplete', ...base };
  }

  // 3. A claimed calculator -> restore its real prefilled builder (the recommended action).
  const draft = ctx.seed ? buildDraftConfig(ctx.seed) : null;
  if (ctx.seed && draft) {
    const funnel = getFunnelByToolKey(ctx.seed.toolSlug);
    const params: Record<string, string> = {
      lm_prefill: '1',
      lm_tool: ctx.seed.toolSlug,
      lm_tool_name: ctx.seed.toolName,
      lm_result: ctx.seed.resultId,
      ...draft.prefill,
      ...draft.suggest,
    };
    if (ctx.experimentVariant) params.lm_variant = ctx.experimentVariant;

    // Rise Mode flows return to Rise Mode (CLAUDE.md) ONLY when the flag is on for this cohort; an
    // explicit, validated returnTo wins. Otherwise no returnTo (normal back behavior).
    const safeReturn = safeInternalPath(ctx.returnTo);
    if (safeReturn) params.returnTo = safeReturn;
    else if (ctx.questEngineEnabled) params.returnTo = RISE_MODE_ROUTE;

    return {
      path: draft.path,
      params,
      reason: 'builder_restored',
      opportunityKey: funnel?.opportunityKey ?? null,
      toolSlug: ctx.seed.toolSlug,
    };
  }

  // 4. No claimable context / unsupported tool -> the dashboard. Safe, never a dead end or a broken
  //    quest route. (Rise Mode, when enabled, IS the dashboard surface at /profile/artist.)
  return { path: DASHBOARD_ROUTE, params: {}, reason: 'fallback_dashboard', ...base };
}

/** Serialize to a relative URL. */
export function journeyDestinationToUrl(dest: JourneyDestination): string {
  const qs = new URLSearchParams(dest.params).toString();
  return qs ? `${dest.path}?${qs}` : dest.path;
}
