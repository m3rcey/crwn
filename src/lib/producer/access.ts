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
    .select('id, artist_id, is_active, is_free, allowed_tier_ids, accepts_submissions, submission_deadline, status')
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
