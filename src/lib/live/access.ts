// Live session access — the ONE place that answers "does this fan hold a paid ticket?"
//
// "Ticket = access" was previously re-implemented at every gate, and the gates
// drifted: the LiveKit token mint honored a ticket, but the watch-page client
// gate, the chat route, the VOD route, and the reminder job did not. A fan who
// bought a ticket without holding a subscription tier could pay, be shown a
// Subscribe wall instead of the Join button, and never reach the token route
// that would have let them in. Every gate now calls through here.
//
// Deliberately NOT gated on live_sessions.price: the ticket row is the proof of
// purchase. If an artist later clears or changes the price, everyone who already
// paid keeps what they bought.
//
// Schema: supabase/schema-phase2-live-tickets.sql

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Does this user hold a PAID ticket for this session? Service-role callers only. */
export async function hasPaidLiveTicket(
  admin: any,
  sessionId: string,
  userId: string
): Promise<boolean> {
  if (!sessionId || !userId) return false;
  const { data } = await admin
    .from('live_ticket_purchases')
    .select('id')
    .eq('session_id', sessionId)
    .eq('buyer_id', userId)
    .eq('status', 'paid')
    .maybeSingle();
  return !!data;
}

/**
 * Buyers holding a paid ticket to any of `sessionIds`, as sessionId -> buyer ids.
 * Batch form for jobs that fan out over many sessions (reminders), so they don't
 * issue one query per fan.
 */
export async function paidTicketBuyersBySession(
  admin: any,
  sessionIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!sessionIds.length) return out;
  const { data } = await admin
    .from('live_ticket_purchases')
    .select('session_id, buyer_id')
    .in('session_id', sessionIds)
    .eq('status', 'paid');
  for (const row of data || []) {
    const arr = out.get(row.session_id) || [];
    arr.push(row.buyer_id);
    out.set(row.session_id, arr);
  }
  return out;
}

/** Does the fan's active tier appear in the session's allow list? */
export function hasTierAccess(
  allowedTierIds: unknown,
  fanTierId: string | null
): boolean {
  const allowed: string[] = Array.isArray(allowedTierIds) ? allowedTierIds : [];
  return !!fanTierId && allowed.includes(fanTierId);
}

/**
 * Does this user hold a Founding Supporter credit that seats them in this session?
 *
 * A session with live_sessions.credit_album_id is the artist's private listening session for that
 * project, and every Founding Supporter whose purchase still stands holds a seat. The credit must
 * be from the SESSION's artist, so pointing a session at another artist's album seats nobody.
 * Schema: supabase/schema-phase2-project-credits.sql. Fails closed: any read error is "no seat",
 * and the tier gate and paid tickets keep working exactly as before.
 */
export async function hasCreditSeat(
  admin: any,
  sessionId: string,
  userId: string
): Promise<boolean> {
  if (!sessionId || !userId) return false;
  try {
    const { data: session, error } = await admin
      .from('live_sessions')
      .select('artist_id, credit_album_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (error || !session?.credit_album_id) return false;
    const { data } = await admin
      .from('project_credits')
      .select('id, purchase:purchases(status)')
      .eq('fan_id', userId)
      .eq('artist_id', session.artist_id)
      .eq('album_id', session.credit_album_id)
      .eq('level', 'founding');
    return ((data as any[]) || []).some((r) => r.purchase?.status === 'completed');
  } catch {
    return false;
  }
}

/**
 * A seat that is not a tier: a paid ticket OR a Founding Supporter credit. Every gate that used to
 * ask only for a ticket asks this, so the two paths can never drift apart.
 */
export async function hasLiveSeat(
  admin: any,
  sessionId: string,
  userId: string
): Promise<boolean> {
  if (await hasPaidLiveTicket(admin, sessionId, userId)) return true;
  return hasCreditSeat(admin, sessionId, userId);
}

/**
 * Batch form of hasLiveSeat for jobs that fan out over sessions (reminders): ticket buyers plus
 * Founding Supporters of each session's project.
 */
export async function seatHoldersBySession(
  admin: any,
  sessionIds: string[]
): Promise<Map<string, string[]>> {
  const out = await paidTicketBuyersBySession(admin, sessionIds);
  if (!sessionIds.length) return out;
  try {
    const { data: sessions, error } = await admin
      .from('live_sessions')
      .select('id, artist_id, credit_album_id')
      .in('id', sessionIds)
      .not('credit_album_id', 'is', null);
    if (error || !sessions?.length) return out;
    for (const s of sessions as any[]) {
      const { data } = await admin
        .from('project_credits')
        .select('fan_id, purchase:purchases(status)')
        .eq('artist_id', s.artist_id)
        .eq('album_id', s.credit_album_id)
        .eq('level', 'founding');
      const holders = ((data as any[]) || [])
        .filter((r) => r.purchase?.status === 'completed')
        .map((r) => r.fan_id as string);
      if (!holders.length) continue;
      const merged = new Set([...(out.get(s.id) || []), ...holders]);
      out.set(s.id, [...merged]);
    }
  } catch {
    /* reminders still go to ticket buyers */
  }
  return out;
}
