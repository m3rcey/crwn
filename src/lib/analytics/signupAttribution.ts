// First-touch attribution across SIGNUP, including Google OAuth. Reporting only (MEASURE-004).
//
// The durable home for attribution is still the result row (`input_data._attribution`), and a
// claimed row always wins. Two signups had nowhere to carry it:
//   1. A Google signup with an unclaimed result: the email path puts the result token in
//      `user_metadata.pending_result_token`, but OAuth cannot set metadata at signup, so the
//      token was dropped and the result (and the video on it) never reached the account.
//   2. Any signup with NO result: the visitor's first-touch snapshot lived only in this browser.
// Both ride the SAME rail the email path already uses, `user_metadata`, written once by the
// fresh account's own session before its first auto-claim. `account_created` dedups on the user
// id, so whatever the first auto-claim sees is what that row keeps forever.
//
// Trust: user_metadata is writable by its owner, so the server re-sanitizes it through the one
// normalizer and uses it only to fill funnel REPORTING dimensions, never a price, a gate or a
// score. The token claims exactly what the email path's token claims: the row it names.

import {
  attributionToFunnelDims,
  hasAttribution,
  sanitizeStoredAttribution,
  type CampaignAttribution,
  type FunnelAttributionDims,
} from './campaignAttribution';

export const SIGNUP_ATTRIBUTION_META_KEY = 'first_touch_attribution';
export const PENDING_RESULT_TOKEN_META_KEY = 'pending_result_token';
/** sessionStorage key that carries the signup page's result token across the Google redirect. */
export const OAUTH_RESULT_TOKEN_STORAGE_KEY = 'crwn_oauth_result_token';

/** Only a just-created account is stamped; a returning login never rewrites its own history. */
export const FRESH_ACCOUNT_WINDOW_MS = 60 * 60 * 1000;

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{8,256}$/;

export function isCarryableResultToken(v: unknown): v is string {
  return typeof v === 'string' && TOKEN_SHAPE.test(v);
}

/**
 * The user_metadata patch a fresh account's session should write before its first auto-claim, or
 * null when there is nothing to add. Never overwrites a value already present.
 */
export function signupMetadataPatch(input: {
  existingMeta: Record<string, unknown> | null | undefined;
  attribution: CampaignAttribution | null | undefined;
  pendingResultToken: string | null | undefined;
  userCreatedAt: string | null | undefined;
  now: number;
}): Record<string, unknown> | null {
  const created = input.userCreatedAt ? Date.parse(input.userCreatedAt) : NaN;
  if (!Number.isFinite(created) || input.now - created > FRESH_ACCOUNT_WINDOW_MS) return null;
  const meta = input.existingMeta ?? {};
  const patch: Record<string, unknown> = {};
  if (!meta[SIGNUP_ATTRIBUTION_META_KEY] && input.attribution && hasAttribution(input.attribution)) {
    patch[SIGNUP_ATTRIBUTION_META_KEY] = input.attribution;
  }
  if (!meta[PENDING_RESULT_TOKEN_META_KEY] && isCarryableResultToken(input.pendingResultToken)) {
    patch[PENDING_RESULT_TOKEN_META_KEY] = input.pendingResultToken;
  }
  return Object.keys(patch).length ? patch : null;
}

function isEmptyDims(d: FunnelAttributionDims): boolean {
  return !d.campaign && !d.referrer && !d.video && !(d.metadata && Object.keys(d.metadata).length);
}

/**
 * The attribution dims for a signup's funnel rows: the claimed result's (first touch, durable)
 * when it has any, otherwise the sanitized first-touch snapshot carried in user_metadata.
 */
export function signupFallbackDims(
  rowDims: FunnelAttributionDims,
  meta: Record<string, unknown> | null | undefined,
): FunnelAttributionDims {
  if (!isEmptyDims(rowDims)) return rowDims;
  const stored = meta?.[SIGNUP_ATTRIBUTION_META_KEY];
  if (!stored) return rowDims;
  const attr = sanitizeStoredAttribution(stored);
  return hasAttribution(attr) ? attributionToFunnelDims(attr) : rowDims;
}
