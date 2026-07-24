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
