// Executive Producer Session — server-side gate logic, shared by every route.
// Dark-launched: admin_settings.producer_sessions. Reuses the live-session
// entitlement resolver so "who may submit" never drifts from "who may watch".

/* eslint-disable @typescript-eslint/no-explicit-any */

import { hasPaidLiveTicket, hasTierAccess } from '@/lib/live/access';
import type { SubmissionKind } from '@/types/producer';

export const SUBMISSION_KINDS: SubmissionKind[] = ['beat', 'vocal', 'idea', 'reference', 'other'];

// A file-bearing submission (beat/vocal/other-with-file) goes to private R2. Ideas
// and references are text/link only. Reuses the same audio ceiling as track upload.
export const MAX_SUBMISSION_FILE_BYTES = 100 * 1024 * 1024; // 100MB
export const SUBMISSION_AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'aiff', 'aif', 'opus'];
export const MAX_SUBMISSION_NOTE_LEN = 2000;

/** Is the Executive Producer Sessions dark-launch flag on? */
export async function isProducerSessionsEnabled(admin: any): Promise<boolean> {
  try {
    const { data } = await admin
      .from('admin_settings')
      .select('value')
      .eq('key', 'producer_sessions')
      .maybeSingle();
    return !!data?.value?.enabled;
  } catch {
    return false;
  }
}

export interface SubmitGate {
  ok: boolean;
  reason:
    | 'ok'
    | 'disabled'
    | 'not_found'
    | 'not_accepting'
    | 'closed'
    | 'no_access';
  session?: {
    id: string;
    artist_id: string;
    accepts_submissions: boolean;
    submission_deadline: string | null;
  };
}

/**
 * May THIS user submit to THIS session right now? Service-role callers only.
 * Gates on: flag on, session exists + active, accepts submissions, deadline not
 * passed, and the fan can actually get into the session (free OR allowed tier OR
 * paid ticket). The artist owner does NOT submit to their own session.
 */
export async function canSubmitToSession(
  admin: any,
  sessionId: string,
  userId: string
): Promise<SubmitGate> {
  if (!(await isProducerSessionsEnabled(admin))) return { ok: false, reason: 'disabled' };

  const { data: session } = await admin
    .from('live_sessions')
    .select('id, artist_id, is_active, is_free, allowed_tier_ids, accepts_submissions, submission_deadline, status, submission_tier_ids')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session || !session.is_active) return { ok: false, reason: 'not_found' };
  if (!session.accepts_submissions) return { ok: false, reason: 'not_accepting' };

  // Submissions close at the deadline, or once the session has ended.
  const deadlinePassed =
    (session.submission_deadline && new Date(session.submission_deadline).getTime() < Date.now()) ||
    session.status === 'ended';
  if (deadlinePassed) return { ok: false, reason: 'closed', session };

  // Access: free, an allowed tier, or a paid ticket. Same resolver as the watch gate.
  let allowed = !!session.is_free;
  if (!allowed) {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('tier_id')
      .eq('fan_id', userId)
      .eq('artist_id', session.artist_id)
      .eq('status', 'active')
      .maybeSingle();
    allowed =
      hasTierAccess(session.allowed_tier_ids, sub?.tier_id || null) ||
      (await hasPaidLiveTicket(admin, session.id, userId));
  }
  if (!allowed) return { ok: false, reason: 'no_access', session };

  return { ok: true, reason: 'ok', session };
}

/** Does the signed-in user own this session's artist profile? Service-role callers. */
export async function ownsSession(admin: any, sessionId: string, userId: string): Promise<{ artistId: string } | null> {
  const { data: session } = await admin
    .from('live_sessions')
    .select('artist_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return null;
  const { data: owned } = await admin
    .from('artist_profiles')
    .select('id')
    .eq('id', session.artist_id)
    .eq('user_id', userId)
    .maybeSingle();
  return owned ? { artistId: session.artist_id } : null;
}

/**
 * May this fan SUBMIT material, as opposed to merely reach the session?
 *
 * `submission_tier_ids` NARROWS the session's watch access. It never widens it, which is
 * why this is a separate pure step applied AFTER canSubmitToSession has already proved
 * access: a fan who cannot enter the room can never submit to it, whatever this list says.
 *
 *   null / absent  every fan who can watch may submit (the original behaviour, so an
 *                  existing session keeps its meaning when the column arrives)
 *   []             nobody may submit; the artist has closed submissions to every rung
 *                  while leaving the room open. Deliberately NOT read as "everyone":
 *                  an empty allow list meaning "allow all" is how paid content leaks.
 *   [ids]          only a fan holding one of these tiers may submit
 *
 * A paid ticket is not enough once a list is set. The ticket buys entry to the room and
 * that promise is kept elsewhere; submitting is what the artist sells on a monthly rung.
 */
export function submissionTierAllows(
  submissionTierIds: unknown,
  fanTierId: string | null,
): boolean {
  if (submissionTierIds === null || submissionTierIds === undefined) return true;
  if (!Array.isArray(submissionTierIds)) return true; // malformed: fall back to watch access
  const allowed = submissionTierIds.filter((x): x is string => typeof x === 'string');
  return !!fanTierId && allowed.includes(fanTierId);
}

/**
 * The gate for actually UPLOADING something: session access, then the submission rung.
 *
 * Deliberately separate from canSubmitToSession, which the in-session POLL VOTE route also
 * uses as its access check. Narrowing that shared helper would have stopped a Gold member
 * voting in a room where only Platinum may submit, which is precisely the split this
 * feature exists to make possible.
 */
export async function canSubmitMaterial(
  admin: any,
  sessionId: string,
  userId: string,
): Promise<SubmitGate> {
  const gate = await canSubmitToSession(admin, sessionId, userId);
  if (!gate.ok) return gate;

  const submissionTiers = (gate.session as { submission_tier_ids?: unknown } | undefined)?.submission_tier_ids;
  if (submissionTiers === undefined || submissionTiers === null) return gate;

  const { data: sub } = await admin
    .from('subscriptions')
    .select('tier_id')
    .eq('fan_id', userId)
    .eq('artist_id', (gate.session as { artist_id?: string } | undefined)?.artist_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!submissionTierAllows(submissionTiers, sub?.tier_id ?? null)) {
    return { ok: false, reason: 'no_access', session: gate.session };
  }
  return gate;
}
