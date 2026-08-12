// adminAgentSignature.ts: proves the params an admin APPROVED are the params the executor RUNS.
//
// THE PROBLEM
// -----------
// SEC-010's payload travels client-side: `/api/admin/agent/analyze` returns actions, the browser
// holds them in React state, and one click POSTs an object back to `/api/admin/agent/execute`.
// Nothing tied the executed object to the proposed one, so the executor was trusting a
// client-posted params bag for platform-wide mutations.
//
// WHY NOT A DATABASE ROW
// ----------------------
// Re-reading a stored proposal by id is the stronger design and is what the artist Manager does
// (`artist_agent_actions` + `actionValidity.ts`). The admin agent has no equivalent table: the only
// admin-agent table is `agent_action_log`, which is an AFTER-THE-FACT audit log, and adding a
// proposal table means a migration this codebase cannot apply itself. A server-computed HMAC over
// the canonical params gives the same property the stored row would give (the executor runs only
// what the server proposed) with no schema change, which is why the audit named it as the
// alternative. If a proposal table ever lands, replace this: read the row, drop the signature.
//
// WHAT IT BINDS
// -------------
//   HMAC(secret, adminId | actionType | issuedAt | canonicalParams)
//
//  - adminId: a proposal made for one admin cannot be replayed by another account.
//  - actionType + canonicalParams: change one id, one stage, one flag, and the signature dies.
//  - issuedAt: an approval is only good for one operating window (see TTL below).
//
// WHAT IT IS NOT
// --------------
// Not authorization (requireAdmin still runs), not validation (validateActionParams still runs),
// and not a defense against the admin themself. It closes "the object that executes is not the
// object that was proposed and shown".

import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalizeAction, type ValidatedParams } from './adminAgentActions';

const VERSION = 'v1';

/**
 * How long an approval stays executable. One hour, matching the coordination lock's stall window in
 * `coordinationLock.ts`: the platform already treats one hour as the life of a single agent run,
 * and an approval should not outlive the run that produced it. The analysis behind the action is
 * also gone by then (the browser holds it in memory only, so a refresh discards it).
 */
export const ACTION_SIGNATURE_TTL_MS = 60 * 60 * 1000;

/**
 * Secret material. Explicit var first so it can be rotated on its own; otherwise the service-role
 * key, which every one of these routes already requires in order to write anything at all.
 *
 * Returns null when only the build-time dummy is present. Callers FAIL CLOSED on null: no signature
 * is issued and no action executes. A deployment that can write to the database always has this.
 */
function signingSecret(): string | null {
  const explicit = process.env.ADMIN_AGENT_SIGNING_SECRET;
  if (explicit && explicit.length >= 16) return explicit;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey && serviceKey !== 'dummy-service-key-for-build' && serviceKey.length >= 16) return serviceKey;
  return null;
}

function digest(secret: string, adminId: string, type: string, issuedAt: number, params: ValidatedParams): string {
  return createHmac('sha256', secret)
    .update(`${adminId}|${type}|${issuedAt}|${canonicalizeAction(type, params)}`)
    .digest('hex');
}

/**
 * Sign a VALIDATED action. Always sign the normalized params, never the model's raw object, or the
 * signature would certify something the executor is about to rewrite.
 *
 * Returns null when no secret is configured. The proposal route then omits the action rather than
 * offering one that can never execute.
 */
export function signAction(adminId: string, type: string, params: ValidatedParams, now: number = Date.now()): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  return `${VERSION}.${now}.${digest(secret, adminId, type, now, params)}`;
}

export type SignatureCheck = { ok: true } | { ok: false; error: string };

/**
 * Re-verify at execution. Every failure mode returns the same shape and the caller refuses; there
 * is no path where a bad or missing signature degrades into "run it anyway".
 */
export function verifyActionSignature(
  signature: unknown,
  adminId: string,
  type: string,
  params: ValidatedParams,
  now: number = Date.now(),
): SignatureCheck {
  const secret = signingSecret();
  if (!secret) return { ok: false, error: 'Action signing is not configured on this deployment' };
  if (typeof signature !== 'string' || !signature) {
    return { ok: false, error: 'This action carries no proposal signature. Re-run the analysis and approve the fresh card.' };
  }

  const parts = signature.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) {
    return { ok: false, error: 'Proposal signature is malformed' };
  }

  const issuedAt = Number(parts[1]);
  if (!Number.isFinite(issuedAt)) return { ok: false, error: 'Proposal signature is malformed' };
  if (now - issuedAt > ACTION_SIGNATURE_TTL_MS) {
    return { ok: false, error: 'This recommendation is over an hour old. Re-run the analysis so it reflects current data.' };
  }
  // A future timestamp means a forged or clock-skewed proposal. Allow a minute of skew, no more.
  if (issuedAt - now > 60_000) return { ok: false, error: 'Proposal signature is not yet valid' };

  const expected = digest(secret, adminId, type, issuedAt, params);
  const got = parts[2];
  // Length AND charset are checked before Buffer.from, because a same-length non-hex string
  // decodes to a shorter buffer and timingSafeEqual throws on mismatched lengths.
  if (got.length !== expected.length || !/^[0-9a-f]+$/.test(got)) {
    return { ok: false, error: 'Approved action does not match the action being executed' };
  }
  if (!timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(expected, 'hex'))) {
    return { ok: false, error: 'Approved action does not match the action being executed' };
  }
  return { ok: true };
}
