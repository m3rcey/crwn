// Shared fan-action event log. This is the "completion source" that Missions,
// Squads, Clip Bounties and City Unlocks read from to know what a fan actually
// DID. Emitted best-effort from existing code paths — recordFanEvent NEVER
// throws, so wiring it into money flows (Stripe webhook, referral processing)
// can't break them. Table: supabase/schema-phase2-fan-events.sql

export type FanEventType =
  | 'share'
  | 'clip'
  | 'referral'
  | 'subscribe'
  | 'purchase'
  | 'rsvp'
  | 'vote'
  | 'live_join'
  | 'comment'
  | 'like'
  | 'presave'
  | 'city_contribution'
  | 'bounty_submit'
  | 'mission_join'
  | 'custom';

export type FanEventRefKind =
  | 'mission'
  | 'offer'
  | 'tier'
  | 'product'
  | 'track'
  | 'album'
  | 'live'
  | 'demand_test'
  | 'smart_link'
  | 'campaign'
  | 'city_unlock'
  | 'bounty'
  | 'squad';

export interface RecordFanEventParams {
  artistId: string;
  fanId: string;
  eventType: FanEventType;
  source?: string;
  refKind?: FanEventRefKind;
  refId?: string | null;
  value?: number; // 1 for a countable action, or cents for a revenue event
  city?: string | null;
  region?: string | null;
  country?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append a fan event. Best-effort: swallows all errors and returns a boolean so
 * callers on critical paths (webhooks) can fire-and-forget without a try/catch.
 * Requires the service-role (admin) Supabase client — RLS only allows service inserts.
 */
export async function recordFanEvent(
  supabaseAdmin: any,
  params: RecordFanEventParams,
): Promise<boolean> {
  try {
    if (!params.artistId || !params.fanId || !params.eventType) return false;
    const { error } = await supabaseAdmin.from('fan_events').insert({
      artist_id: params.artistId,
      fan_id: params.fanId,
      event_type: params.eventType,
      source: params.source ?? null,
      ref_kind: params.refKind ?? null,
      ref_id: params.refId ?? null,
      value: params.value ?? 1,
      city: params.city ?? null,
      region: params.region ?? null,
      country: params.country ?? null,
      metadata: params.metadata ?? {},
    });
    if (error) {
      console.error('[fanEvents] insert failed (non-fatal):', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[fanEvents] threw (non-fatal):', err);
    return false;
  }
}

/**
 * Count matching fan events for an artist — the read side that missions / squads
 * / city unlocks use to derive progress. Returns 0 on any error.
 */
export async function countFanEvents(
  supabaseAdmin: any,
  filter: {
    artistId: string;
    eventType?: FanEventType;
    refKind?: FanEventRefKind;
    refId?: string;
    since?: string;
  },
): Promise<number> {
  try {
    let q = supabaseAdmin
      .from('fan_events')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', filter.artistId);
    if (filter.eventType) q = q.eq('event_type', filter.eventType);
    if (filter.refKind) q = q.eq('ref_kind', filter.refKind);
    if (filter.refId) q = q.eq('ref_id', filter.refId);
    if (filter.since) q = q.gte('created_at', filter.since);
    const { count } = await q;
    return count || 0;
  } catch {
    return 0;
  }
}
