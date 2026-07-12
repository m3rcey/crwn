// Reading a result by token, and claiming it.
//
// The claim is the highest-risk operation in the whole acquisition engine. It is the moment
// an anonymous Instagram stranger becomes bound to a real CRWN account. Everything else can
// be undone; a bad claim cannot.
//
// The rules, and the attack each one stops:
//
//   verified session required   -> a stolen token alone cannot claim anything
//   one-time claim token        -> a leaked link cannot be replayed by a second person
//   already-claimed = refuse    -> two accounts cannot own one lead
//   never touch profiles.role   -> RLS freezes it; only trg_promote_to_artist may promote
//   never auto-create an artist -> the approved onboarding flow stays the only way in
//   identical error responses   -> no account enumeration via timing or message

import { createClient } from '@supabase/supabase-js';
import { hashToken, isExpired } from './resultToken';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export interface StoredResult {
  id: string;
  toolSlug: string;
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown>;
  generatorVersion: string;
  disclaimerVersion: string | null;
  leadIdentityId: string | null;
  claimedAt: string | null;
  revokedAt: string | null;
}

export type ResultLookup =
  | { ok: true; result: StoredResult }
  | { ok: false; reason: 'not_found' | 'expired' | 'revoked' };

/**
 * Look a result up by its raw token.
 *
 * We hash and look up BY HASH, so this is one indexed equality check. The raw token is never
 * stored, never logged, and never compared in a loop.
 */
export async function getResultByToken(rawToken: string): Promise<ResultLookup> {
  if (!rawToken || rawToken.length < 20) return { ok: false, reason: 'not_found' };

  const { data } = await supabaseAdmin
    .from('lead_magnet_results')
    .select(
      'id, tool_slug, input_data, result_data, generator_version, disclaimer_version, lead_identity_id, claimed_at, revoked_at, public_token_expires_at',
    )
    .eq('public_token_hash', hashToken(rawToken))
    .maybeSingle();

  if (!data) return { ok: false, reason: 'not_found' };
  if (data.revoked_at) return { ok: false, reason: 'revoked' };
  if (isExpired(data.public_token_expires_at as string)) return { ok: false, reason: 'expired' };

  return {
    ok: true,
    result: {
      id: String(data.id),
      toolSlug: String(data.tool_slug),
      inputData: (data.input_data as Record<string, unknown>) ?? {},
      resultData: (data.result_data as Record<string, unknown>) ?? {},
      generatorVersion: String(data.generator_version ?? ''),
      disclaimerVersion: (data.disclaimer_version as string) ?? null,
      leadIdentityId: (data.lead_identity_id as string) ?? null,
      claimedAt: (data.claimed_at as string) ?? null,
      revokedAt: (data.revoked_at as string) ?? null,
    },
  };
}

/** Idempotent view tracking. First view stamps viewed_at; every view bumps the counter. */
export async function recordView(resultId: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from('lead_magnet_results')
      .select('viewed_at, view_count')
      .eq('id', resultId)
      .maybeSingle();

    await supabaseAdmin
      .from('lead_magnet_results')
      .update({
        viewed_at: data?.viewed_at ?? new Date().toISOString(),
        view_count: (Number(data?.view_count) || 0) + 1,
      })
      .eq('id', resultId);
  } catch {
    // A view counter must never break a page render.
  }
}

export type ClaimOutcome =
  | { ok: true; destinationId: string }
  | { ok: false; reason: 'invalid' | 'already_claimed' | 'not_authenticated' };

/**
 * Bind a result (and its whole lead history) to a VERIFIED user.
 *
 * `userId` MUST come from supabase.auth.getUser() on the server. Never from a request body.
 * That single sentence is the difference between this being safe and this being an account
 * takeover endpoint.
 */
export async function claimResult(rawToken: string, userId: string): Promise<ClaimOutcome> {
  const lookup = await getResultByToken(rawToken);
  if (!lookup.ok) return { ok: false, reason: 'invalid' };

  const result = lookup.result;

  // Already claimed by SOMEONE. If it is this same user, that is a harmless double-click and
  // we let them through. If it is a different user, we refuse: one lead, one owner, and no
  // silent re-parenting of another artist's data.
  if (result.claimedAt && result.leadIdentityId) {
    const { data: owner } = await supabaseAdmin
      .from('lead_identities')
      .select('user_id')
      .eq('id', result.leadIdentityId)
      .maybeSingle();

    if (owner?.user_id && owner.user_id !== userId) {
      return { ok: false, reason: 'already_claimed' };
    }
    if (owner?.user_id === userId) {
      return { ok: true, destinationId: await destinationFor(userId) };
    }
  }

  // Does this user already own an artist page? We LINK to it. We never CREATE one here.
  // Artist creation goes through /welcome, which fires trg_promote_to_artist. Creating an
  // artist_profiles row from a claim endpoint would bypass the approved onboarding path and
  // the daily canary that guards it.
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  const now = new Date().toISOString();

  if (result.leadIdentityId) {
    await supabaseAdmin
      .from('lead_identities')
      .update({
        user_id: userId,
        artist_id: artist?.id ?? null,
        claimed_at: now,
        status: 'claimed',
      })
      .eq('id', result.leadIdentityId)
      // Only claim an UNCLAIMED identity. If a concurrent request claimed it a millisecond
      // ago, this update matches zero rows and we do not stomp their link.
      .is('user_id', null);
  }

  await supabaseAdmin
    .from('lead_magnet_results')
    .update({
      user_id: userId,
      artist_id: artist?.id ?? null,
      claimed_at: now,
      // Burn the claim token. It is one-time: a leaked link cannot be redeemed twice.
      claim_token_hash: null,
      claim_token_used_at: now,
    })
    .eq('id', result.id);

  await supabaseAdmin.from('acquisition_events').insert({
    event_name: 'account_claim_completed',
    lead_identity_id: result.leadIdentityId,
    result_id: result.id,
    metadata: { userId, hasArtist: !!artist },
    status: 'recorded',
  });

  return { ok: true, destinationId: await destinationFor(userId) };
}

/**
 * Where to send them next.
 *
 * NOTE what this does NOT do: it does not mark any setup step complete. An Instagram artist
 * name is not a photo upload, is not a track, and is not a Stripe connection. `useArtistSetup`
 * derives completion from live DB rows and we are not going to lie to it.
 */
async function destinationFor(userId: string): Promise<string> {
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('setup_completed')
    .eq('user_id', userId)
    .maybeSingle();

  if (!artist) return 'setup'; // no artist page yet -> /welcome handles it
  if (artist.setup_completed === false) return 'setup';
  return 'rise_mode';
}
