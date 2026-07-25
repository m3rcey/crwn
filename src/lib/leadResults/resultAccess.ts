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

/**
 * Idempotent view tracking. First view stamps viewed_at; every view bumps the counter.
 *
 * The FIRST view also emits a lead_result_viewed event, which is a real scoring signal (an
 * artist who opened the link is worth more than one who did not) and the thing the
 * "result not viewed after 24h" follow-up checks against. The idempotency key makes the
 * event fire exactly once no matter how many times they reload.
 */
export async function recordView(resultId: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from('lead_magnet_results')
      .select('viewed_at, view_count, lead_identity_id, lead_session_id')
      .eq('id', resultId)
      .maybeSingle();

    const firstView = !data?.viewed_at;

    await supabaseAdmin
      .from('lead_magnet_results')
      .update({
        viewed_at: data?.viewed_at ?? new Date().toISOString(),
        view_count: (Number(data?.view_count) || 0) + 1,
      })
      .eq('id', resultId);

    if (firstView) {
      await supabaseAdmin.from('acquisition_events').insert({
        event_name: 'lead_result_viewed',
        result_id: resultId,
        lead_identity_id: data?.lead_identity_id ?? null,
        session_id: data?.lead_session_id ?? null,
        // Fires once, ever, per result. A reload is not a second view.
        idempotency_key: `viewed:${resultId}`,
        status: 'recorded',
      });

      // Mirror into the funnel (ManyChat path) -> result_revealed, with the IG post as the video.
      const { mirrorFunnelForSession } = await import('../analytics/acquisitionFunnelMirror');
      await mirrorFunnelForSession(supabaseAdmin, data?.lead_session_id ?? null, 'result_revealed', `ig_reveal:${resultId}`, {
        resultId,
      });

      // They looked but have not saved it. That is a warmer problem than "never opened it",
      // and it gets its own follow-up in 48 hours. If they claim before then, the handler
      // sees claimed_at and stays quiet.
      await supabaseAdmin.from('acquisition_events').insert({
        event_name: 'result_viewed_not_claimed',
        result_id: resultId,
        lead_identity_id: data?.lead_identity_id ?? null,
        session_id: data?.lead_session_id ?? null,
        idempotency_key: `viewed_unclaimed:${resultId}`,
        status: 'pending',
        next_attempt_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      });

      // Opening the result is a real signal, so the score has to move. It used to not: the
      // orchestrator passed EMPTY_BEHAVIOR, so the score froze at DM time and nothing she did
      // afterwards ever counted. A hot lead stayed "unqualified" and nobody was told.
      if (data?.lead_identity_id) {
        const { recomputeScore } = await import('../acquisition/rescore');
        await recomputeScore(String(data.lead_identity_id), {
          sessionId: (data.lead_session_id as string) ?? null,
          sourceEvent: 'result_viewed',
        });
      }
    }
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
  //
  // Check the RESULT's own owner first, not just the identity's. A result can carry a
  // claimed_at with a null lead_identity_id (an admin action, a deleted identity), and the
  // earlier version of this fell straight through that case and happily re-claimed a result
  // that already belonged to someone else.
  if (result.claimedAt) {
    const { data: row } = await supabaseAdmin
      .from('lead_magnet_results')
      .select('user_id')
      .eq('id', result.id)
      .maybeSingle();

    if (row?.user_id && row.user_id !== userId) {
      return { ok: false, reason: 'already_claimed' };
    }
    if (row?.user_id === userId) {
      return { ok: true, destinationId: await destinationFor(userId) };
    }

    if (result.leadIdentityId) {
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

// ===========================================================================
// The handoff bridge: make a calculator result survive anonymous -> signup ->
// verification -> setup -> Rise Mode WITHOUT depending on browser storage.
//
// `claimResult` (above) handles the precise, one-time DM/claim token. This adds
// the two DURABLE, server-side paths that carry data the rest of the way:
//
//   1. A token carried through signup in Supabase user_metadata (NOT localStorage).
//      Resolves both token schemes: hashed (acquisition) and raw public_token (web).
//   2. VERIFIED-email match. The single robust key that survives a different device,
//      a cleared cache, or incognito. Only ever anchored on the AUTH side's verified
//      email (the caller MUST pass a verified address), which is why binding a
//      self-entered lead email to it is safe: an attacker cannot verify a victim's
//      inbox, and inheriting a result someone else typed your address into is inert.
//
// Every write is guarded to touch ONLY unclaimed rows and is fully idempotent, so
// this can fire on every auth event and re-run to backfill artist_id after /welcome.
// ===========================================================================

/** Bind ONE result row to a user (and artist, if known). Only claims an UNCLAIMED row. */
async function bindResultRow(
  resultId: string,
  userId: string,
  artistId: string | null,
): Promise<void> {
  await supabaseAdmin
    .from('lead_magnet_results')
    .update({
      user_id: userId,
      artist_id: artistId,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', resultId)
    // Never stomp a row a concurrent request already claimed.
    .is('user_id', null);
}

/** Claim a WEB result addressed by its plaintext `public_token`. Returns true if bound. */
async function claimByRawToken(
  rawToken: string,
  userId: string,
  artistId: string | null,
): Promise<boolean> {
  const { data: row } = await supabaseAdmin
    .from('lead_magnet_results')
    .select('id, user_id, lead_id, public_token_expires_at')
    .eq('public_token', rawToken)
    .maybeSingle();

  if (!row) return false;
  if (row.user_id) return row.user_id === userId; // already ours = success; another's = refuse
  if (isExpired(row.public_token_expires_at as string)) return false;

  await bindResultRow(String(row.id), userId, artistId);
  if (row.lead_id) {
    await supabaseAdmin
      .from('lead_magnet_leads')
      .update({ converted_user_id: userId, converted_artist_id: artistId })
      .eq('id', row.lead_id)
      .is('converted_user_id', null);
  }
  return true;
}

/** Claim every UNCLAIMED result tied to a VERIFIED email, via leads and lead_identities. */
async function claimByEmail(
  userId: string,
  email: string,
  artistId: string | null,
): Promise<number> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return 0;
  let claimed = 0;

  // A) Web capture path: lead_magnet_leads holds the self-entered email.
  const { data: leads } = await supabaseAdmin
    .from('lead_magnet_leads')
    .select('id')
    .ilike('email', normalized);
  const leadIds = (leads ?? []).map((l: { id: string }) => l.id);
  if (leadIds.length) {
    const { data: rows } = await supabaseAdmin
      .from('lead_magnet_results')
      .select('id')
      .in('lead_id', leadIds)
      .is('user_id', null);
    for (const r of rows ?? []) {
      await bindResultRow(String((r as { id: string }).id), userId, artistId);
      claimed++;
    }
    await supabaseAdmin
      .from('lead_magnet_leads')
      .update({ converted_user_id: userId, converted_artist_id: artistId })
      .in('id', leadIds)
      .is('converted_user_id', null);
  }

  // B) Acquisition path: lead_identities holds a VERIFIED email (set only after verification).
  const { data: identities } = await supabaseAdmin
    .from('lead_identities')
    .select('id, user_id')
    .ilike('email', normalized);
  const freeIdentityIds = (identities ?? [])
    .filter((i: { user_id: string | null }) => !i.user_id)
    .map((i: { id: string }) => i.id);
  if (freeIdentityIds.length) {
    await supabaseAdmin
      .from('lead_identities')
      .update({
        user_id: userId,
        artist_id: artistId,
        claimed_at: new Date().toISOString(),
        status: 'claimed',
      })
      .in('id', freeIdentityIds)
      .is('user_id', null);

    const { data: rows } = await supabaseAdmin
      .from('lead_magnet_results')
      .select('id')
      .in('lead_identity_id', freeIdentityIds)
      .is('user_id', null);
    for (const r of rows ?? []) {
      await bindResultRow(String((r as { id: string }).id), userId, artistId);
      claimed++;
    }
  }

  return claimed;
}

export interface AutoClaimInput {
  /** The user's VERIFIED email, or null when the session's email is not yet confirmed. */
  email?: string | null;
  /** A token carried through signup (Supabase user_metadata). Hashed OR raw public_token. */
  token?: string | null;
}

/**
 * Attach any lead-magnet result that belongs to this user but was created before they had an
 * account. Idempotent and safe to call on every authenticated load. Never throws for a caller:
 * a failed claim must never break auth or a page render, so all faults are swallowed here.
 */
export async function autoClaimForUser(
  userId: string,
  input: AutoClaimInput,
): Promise<{ claimed: number }> {
  let claimed = 0;

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  const artistId = (artist?.id as string) ?? null;

  // 1. Precise token from signup. Try the hashed (claim) scheme first, then the raw web token.
  if (input.token) {
    try {
      const byClaim = await claimResult(input.token, userId);
      if (byClaim.ok) claimed++;
      else if (await claimByRawToken(input.token, userId, artistId)) claimed++;
    } catch {
      /* a bad token must never break the session */
    }
  }

  // 2. Durable verified-email match.
  if (input.email) {
    try {
      claimed += await claimByEmail(userId, input.email, artistId);
    } catch {
      /* email match is best-effort */
    }
  }

  // 3. Backfill artist_id onto anything this user already owns (e.g. claimed pre-/welcome).
  if (artistId) {
    try {
      await supabaseAdmin
        .from('lead_magnet_results')
        .update({ artist_id: artistId })
        .eq('user_id', userId)
        .is('artist_id', null);
      await supabaseAdmin
        .from('lead_identities')
        .update({ artist_id: artistId })
        .eq('user_id', userId)
        .is('artist_id', null);
    } catch {
      /* backfill is best-effort */
    }
  }

  if (claimed > 0) {
    try {
      await supabaseAdmin.from('acquisition_events').insert({
        event_name: 'account_auto_claim_completed',
        metadata: { userId, claimed, hasArtist: !!artistId, via: input.token ? 'token+email' : 'email' },
        status: 'recorded',
      });
    } catch {
      /* the event log is not load-bearing */
    }
  }

  return { claimed };
}
