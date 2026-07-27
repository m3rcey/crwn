// Server helpers to enroll an email-only lead into prospect nurture, and to exit them the instant
// they create an account. NEVER import into a client bundle.
//
// Both follow the repo convention (recordFanEvent / recordLmEvent): they take the caller's
// service-role client and NEVER throw for the caller. A nurture failure must never break the
// capture flow or an auth event.

import type { SupabaseClient } from '@supabase/supabase-js';
import { generatePublicToken, isEmailSuppressed, normalizeEmail, recordLmEvent } from '@/lib/leadMagnets/server';
import { PROSPECT_NURTURE_SEQUENCE, PROSPECT_NURTURE_VERSION } from './sequence';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface EnrollInput {
  leadId: string;
  email: string;
  toolSlug: string;
  resultId: string | null;
  // The lead's marketing consent. Nurture is marketing, so we enroll ONLY with explicit consent.
  // The transactional result email is sent separately and does not depend on this.
  emailConsent: boolean;
}

export type EnrollOutcome =
  | { enrolled: true; action: 'created' | 'refreshed'; enrollmentId: string }
  | { enrolled: false; reason: 'no_consent' | 'suppressed' | 'invalid' | 'error' };

/**
 * Enroll a lead into the universal core nurture, or refresh an already-active enrollment.
 *
 * Rules enforced here:
 *   - consent: marketing nurture requires emailConsent === true.
 *   - suppression: a globally suppressed address is never enrolled.
 *   - dedup: at most one ACTIVE nurture per email. A second calculator refreshes the existing
 *     enrollment's personalization instead of opening an overlapping sequence.
 */
export async function enrollProspect(admin: SupabaseClient, input: EnrollInput): Promise<EnrollOutcome> {
  try {
    const email = normalizeEmail(input.email);
    if (!email || !input.leadId || !input.toolSlug) return { enrolled: false, reason: 'invalid' };
    if (input.emailConsent !== true) return { enrolled: false, reason: 'no_consent' };
    if (await isEmailSuppressed(admin, email)) return { enrolled: false, reason: 'suppressed' };

    // Dedup: refresh personalization on an existing ACTIVE enrollment rather than creating a second.
    const { data: existing } = await admin
      .from('prospect_nurture_enrollments')
      .select('id')
      .eq('email', email)
      .eq('status', 'active')
      .maybeSingle();

    if (existing?.id) {
      await admin
        .from('prospect_nurture_enrollments')
        .update({ tool_slug: input.toolSlug, result_id: input.resultId, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      await recordLmEvent(admin, 'prospect_nurture_refreshed', { toolSlug: input.toolSlug, resultId: input.resultId ?? undefined });
      return { enrolled: true, action: 'refreshed', enrollmentId: String(existing.id) };
    }

    const firstDelayDays = PROSPECT_NURTURE_SEQUENCE.emails[0]?.dayOffset ?? 1;
    const nextSendAt = new Date(Date.now() + firstDelayDays * DAY_MS).toISOString();

    const { data: created, error } = await admin
      .from('prospect_nurture_enrollments')
      .insert({
        lead_id: input.leadId,
        email,
        tool_slug: input.toolSlug,
        result_id: input.resultId,
        sequence_version: PROSPECT_NURTURE_VERSION,
        phase: 'delivery',
        current_step: 0,
        status: 'active',
        next_send_at: nextSendAt,
        unsub_token: generatePublicToken(),
      })
      .select('id')
      .single();

    if (error || !created) {
      // A unique-violation here means a concurrent request already created the active enrollment.
      // That is the dedup guarantee doing its job, not a failure.
      return { enrolled: false, reason: 'error' };
    }

    await recordLmEvent(admin, 'prospect_nurture_enrolled', { toolSlug: input.toolSlug, resultId: input.resultId ?? undefined });
    return { enrolled: true, action: 'created', enrollmentId: String(created.id) };
  } catch {
    return { enrolled: false, reason: 'error' };
  }
}

/**
 * Exit a prospect from nurture the moment they become an account holder. Idempotent and safe to
 * call on every auth event. Cancels every active enrollment tied to this user, by verified email
 * and by any lead already marked converted to this user.
 */
export async function exitProspectNurtureForUser(
  admin: SupabaseClient,
  input: { userId: string; email?: string | null },
): Promise<{ exited: number }> {
  try {
    const now = new Date().toISOString();
    const emails = new Set<string>();
    if (input.email) {
      const e = normalizeEmail(input.email);
      if (e) emails.add(e);
    }

    // Any lead converted to this user contributes its email too (covers token-only claims where the
    // signup email differs from the self-entered lead email).
    const { data: leads } = await admin
      .from('lead_magnet_leads')
      .select('email')
      .eq('converted_user_id', input.userId);
    for (const l of leads || []) {
      const e = normalizeEmail((l as { email: string }).email || '');
      if (e) emails.add(e);
    }

    if (emails.size === 0) return { exited: 0 };

    const { data: canceled } = await admin
      .from('prospect_nurture_enrollments')
      .update({ status: 'canceled', exit_reason: 'account_created', next_send_at: null, updated_at: now })
      .in('email', Array.from(emails))
      .eq('status', 'active')
      .select('id');

    const exited = (canceled || []).length;
    if (exited > 0) {
      await recordLmEvent(admin, 'prospect_nurture_exited', { reasonCode: 'account_created' });
    }
    return { exited };
  } catch {
    return { exited: 0 };
  }
}
