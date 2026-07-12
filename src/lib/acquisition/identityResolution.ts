// Identity resolution.
//
// THE RULE: an Instagram identity is EVIDENCE. It is never AUTHORIZATION.
//
// This file decides "which lead is this?". It must never decide "which CRWN account is
// this?" from anything an unauthenticated stranger typed. The link between a lead and a real
// user is created in exactly one place (resultClaim.ts) and only after Supabase has verified
// a session. Everything here is about de-duplicating LEADS, not about granting access.
//
// The failure mode we are designing against: someone DMs the CRWN Instagram, types
// "josh@thecrwn.app" as their email, and gets merged into the founder's account. That is why
// an unverified email is NEVER a merge key, no matter how convenient it would be.

import { supabaseAdmin } from './db';
import type { IdentityClaimInput, LeadIdentity } from './types';

/**
 * Resolution precedence, strongest first.
 *
 *   1. authenticated user      - Supabase says who they are. Unforgeable.
 *   2. verified claim token    - a one-time secret we minted and they redeemed.
 *   3. verified email          - verified BY US, not merely typed at us.
 *   4. ManyChat contact id     - provider-assigned, stable, not user-chosen.
 *   5. Instagram user id       - provider-assigned, stable, not user-chosen.
 *
 * Never a merge key, at any strength:
 *   - instagram_username (reassignable; @drake today is someone else next year)
 *   - artist_name / display_name (thousands of artists share a name)
 *   - an unverified email or phone (trivially spoofed, and the takeover vector)
 */
export async function resolveIdentity(input: IdentityClaimInput): Promise<LeadIdentity | null> {
  // 1. Authenticated user. The caller already proved this with a session cookie.
  if (input.authenticatedUserId) {
    const found = await findBy('user_id', input.authenticatedUserId);
    if (found) return found;
  }

  // 2. A verified claim token resolved to a specific identity row upstream.
  if (input.verifiedClaimTokenIdentityId) {
    const found = await findBy('id', input.verifiedClaimTokenIdentityId);
    if (found) return found;
  }

  // 3. Verified email ONLY. Note the `.not('email_verified_at', 'is', null)` guard: an
  // identity row whose email was merely typed into a DM does not qualify, even though the
  // email column is populated. The column being set is not the same as the email being ours.
  if (input.verifiedEmail) {
    const { data } = await supabaseAdmin
      .from('lead_identities')
      .select('*')
      .eq('email', input.verifiedEmail.toLowerCase())
      .not('email_verified_at', 'is', null)
      .maybeSingle();
    if (data) return toIdentity(data);
  }

  // 4/5. Provider identifiers. The artist did not choose these and cannot type them.
  if (input.manychatContactId) {
    const found = await findBy('manychat_contact_id', input.manychatContactId);
    if (found) return found;
  }
  if (input.instagramUserId) {
    const found = await findBy('instagram_user_id', input.instagramUserId);
    if (found) return found;
  }

  return null;
}

/**
 * Resolve, or create a brand new anonymous lead.
 *
 * The created row has user_id = NULL and claimed_at = NULL. It is a lead, not an account,
 * and nothing about it grants access to anything.
 */
export async function resolveOrCreate(input: IdentityClaimInput): Promise<LeadIdentity> {
  const existing = await resolveIdentity(input);

  if (existing) {
    // Backfill provider ids we did not have before. This is safe and additive: filling in a
    // NULL instagram_user_id on a row we already matched by manychat_contact_id is learning
    // more about the same person, not merging two people.
    const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
    if (!existing.manychatContactId && input.manychatContactId) patch.manychat_contact_id = input.manychatContactId;
    if (!existing.instagramUserId && input.instagramUserId) patch.instagram_user_id = input.instagramUserId;
    // Username is refreshed for display but is NOT a merge key. See the module header.
    if (input.instagramUsername) patch.instagram_username = input.instagramUsername;

    const { data } = await supabaseAdmin
      .from('lead_identities')
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();
    return data ? toIdentity(data) : existing;
  }

  const { data, error } = await supabaseAdmin
    .from('lead_identities')
    .insert({
      manychat_contact_id: input.manychatContactId ?? null,
      instagram_user_id: input.instagramUserId ?? null,
      instagram_username: input.instagramUsername ?? null,
      status: 'active',
    })
    .select('*')
    .single();

  if (error) {
    // 23505 = a concurrent request for the SAME contact won the race. That is not an error,
    // it is the unique index doing exactly its job. Re-resolve and use their row.
    if (error.code === '23505') {
      const raced = await resolveIdentity(input);
      if (raced) return raced;
    }
    throw error;
  }

  return toIdentity(data);
}

async function findBy(column: string, value: string): Promise<LeadIdentity | null> {
  const { data } = await supabaseAdmin.from('lead_identities').select('*').eq(column, value).maybeSingle();
  return data ? toIdentity(data) : null;
}

function toIdentity(row: Record<string, unknown>): LeadIdentity {
  return {
    id: String(row.id),
    manychatContactId: (row.manychat_contact_id as string) ?? null,
    instagramUserId: (row.instagram_user_id as string) ?? null,
    instagramUsername: (row.instagram_username as string) ?? null,
    email: (row.email as string) ?? null,
    emailVerifiedAt: (row.email_verified_at as string) ?? null,
    phone: (row.phone as string) ?? null,
    userId: (row.user_id as string) ?? null,
    artistId: (row.artist_id as string) ?? null,
    claimedAt: (row.claimed_at as string) ?? null,
    consentDm: row.consent_dm === true,
    consentEmail: row.consent_email === true,
    consentSms: row.consent_sms === true,
    status: (row.status as LeadIdentity['status']) ?? 'active',
  };
}
