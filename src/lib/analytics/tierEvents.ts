// tierEvents.ts — recording how fans interact with each rung of the four-tier ladder.
//
// Two event types and no more, because these are the two the product cannot currently
// answer and everything downstream needs:
//   tier_card_viewed      a fan actually saw this rung (not "the page loaded")
//   tier_checkout_started a fan intentionally began paying for this rung
//
// EVIDENCE ONLY. Nothing here recommends, scores, prices or changes a tier. It writes rows
// so that a later deterministic reader can answer "is this rung working?" without guessing.
//
// TRUST MODEL, and it is the whole reason this file exists rather than a client insert:
//   - The caller supplies a TIER id and never an artist id. artist_id is read back off the
//     tier row, so a forged body can only ever write against the tier it named, and the
//     artist that tier genuinely belongs to. Cross-artist forgery is not possible by
//     construction rather than by policy.
//   - visitor_hash is derived server-side from the request headers. A client cannot choose
//     its own identity and cannot inflate another visitor's row.
//   - Writes go through the service-role client. tier_events has no client INSERT grant.
//
// Fail-safe, like every other recorder in this codebase: analytics must never break the flow
// it measures, so nothing here throws for its caller.

export const TIER_EVENT_TYPES = ['tier_card_viewed', 'tier_checkout_started'] as const;
export type TierEventType = (typeof TIER_EVENT_TYPES)[number];

const TYPE_SET = new Set<string>(TIER_EVENT_TYPES);

export function isTierEventType(v: unknown): v is TierEventType {
  return typeof v === 'string' && TYPE_SET.has(v);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

const MAX_TEXT = 200;

/** Keys that must never reach an analytics row, whatever a caller passes. */
const FORBIDDEN_METADATA = new Set([
  'email',
  'customer',
  'customer_id',
  'stripe_customer_id',
  'session_id',
  'checkout_session_id',
  'payment_intent',
  'payment_intent_id',
  'client_secret',
  'card',
  'name',
  'phone',
]);

function clip(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, MAX_TEXT) : null;
}

/**
 * Strip anything sensitive or unbounded out of caller-supplied context.
 *
 * The table takes free-form jsonb, which is exactly the kind of field a Stripe id ends up in
 * six months from now because it was convenient. Whitelisting the value SHAPES (small scalars)
 * and blacklisting the known-sensitive KEYS makes that mistake fail here instead of in the
 * database. Exported so the rule is testable on its own.
 */
export function sanitizeTierMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(input as Record<string, unknown>)) {
    const key = rawKey.toLowerCase();
    if (FORBIDDEN_METADATA.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) out[rawKey] = value;
    else if (typeof value === 'boolean') out[rawKey] = value;
    else if (typeof value === 'string') {
      const s = clip(value);
      if (s) out[rawKey] = s;
    }
    // objects, arrays, null, undefined and functions are dropped: no nesting, no surprises.
  }
  return out;
}

export interface TierEventRow {
  artist_id: string;
  tier_id: string;
  event_type: TierEventType;
  event_date: string;
  visitor_hash: string;
  fan_id: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
}

export interface BuildTierEventInput {
  artistId: string;
  tierId: string;
  eventType: TierEventType;
  visitorHash: string;
  fanId?: string | null;
  source?: string | null;
  metadata?: unknown;
  /** ISO instant; the DATE bucket is derived from it. Defaults to now. */
  occurredAt?: string | Date | null;
}

/** UTC day bucket, matching artist_page_visits.visit_date so the two tables reconcile. */
export function eventDateOf(when?: string | Date | null): string {
  const d = when ? new Date(when) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  return safe.toISOString().slice(0, 10);
}

/**
 * Build the row from validated, clipped inputs. Pure and exported so tests can assert exactly
 * what would be written without a database. Returns null when the input cannot produce an
 * honest row (unknown event type, or no visitor identity to deduplicate against).
 */
export function buildTierEventRow(input: BuildTierEventInput): TierEventRow | null {
  if (!isTierEventType(input.eventType)) return null;
  if (!input.artistId || !input.tierId) return null;
  // No visitor hash means no dedupe grain, which means unbounded duplicate rows. A row we
  // cannot deduplicate is worse than no row: it silently corrupts every rate derived from it.
  if (!input.visitorHash) return null;

  return {
    artist_id: input.artistId,
    tier_id: input.tierId,
    event_type: input.eventType,
    event_date: eventDateOf(input.occurredAt),
    visitor_hash: input.visitorHash,
    fan_id: input.fanId || null,
    source: clip(input.source),
    metadata: sanitizeTierMetadata(input.metadata),
  };
}

export interface RecordTierEventArgs {
  tierId: string;
  eventType: TierEventType;
  visitorHash: string | null;
  fanId?: string | null;
  source?: string | null;
  metadata?: unknown;
  occurredAt?: string | Date | null;
  /**
   * Expected owner. When supplied (server callers that already resolved the artist), the tier
   * must belong to it or nothing is written. Callers that do not know it get the artist
   * resolved from the tier row instead, which is equally unforgeable.
   */
  expectArtistId?: string | null;
}

export interface RecordTierEventResult {
  recorded: boolean;
  /** Why nothing was written. Present only on a no-op; useful in tests and logs. */
  reason?: 'bot_or_no_hash' | 'unknown_tier' | 'artist_mismatch' | 'free_tier' | 'write_failed' | 'bad_input';
}

/**
 * Record one tier interaction. Idempotent per (artist, tier, type, visitor, day) at the DB via
 * ON CONFLICT DO NOTHING, so a rerender storm, a double tap, or a retried beacon all collapse.
 *
 * Never throws.
 */
export async function recordTierEvent(db: Db, args: RecordTierEventArgs): Promise<RecordTierEventResult> {
  try {
    if (!isTierEventType(args.eventType)) return { recorded: false, reason: 'bad_input' };
    // A bot has no visitor hash. Dropping it here keeps crawler traffic out of the denominator.
    if (!args.visitorHash) return { recorded: false, reason: 'bot_or_no_hash' };
    if (!args.tierId || typeof args.tierId !== 'string') return { recorded: false, reason: 'bad_input' };

    // The artist is READ FROM THE TIER, never taken from the caller. This single lookup is
    // what makes cross-artist forgery impossible rather than merely disallowed.
    const { data: tier } = await db
      .from('subscription_tiers')
      .select('id, artist_id, price, is_active')
      .eq('id', args.tierId)
      .maybeSingle();

    if (!tier?.artist_id) return { recorded: false, reason: 'unknown_tier' };
    if (args.expectArtistId && tier.artist_id !== args.expectArtistId) {
      return { recorded: false, reason: 'artist_mismatch' };
    }

    // A free rung has no checkout. Recording one would put a numerator on a denominator that
    // does not exist and make the free tier look like it converts at 100%.
    if (args.eventType === 'tier_checkout_started' && Number(tier.price) === 0) {
      return { recorded: false, reason: 'free_tier' };
    }

    const row = buildTierEventRow({
      artistId: String(tier.artist_id),
      tierId: String(tier.id),
      eventType: args.eventType,
      visitorHash: args.visitorHash,
      fanId: args.fanId,
      source: args.source,
      metadata: args.metadata,
      occurredAt: args.occurredAt,
    });
    if (!row) return { recorded: false, reason: 'bad_input' };

    const { error } = await db
      .from('tier_events')
      .upsert(row, {
        onConflict: 'artist_id,tier_id,event_type,visitor_hash,event_date',
        ignoreDuplicates: true,
      });
    if (error) return { recorded: false, reason: 'write_failed' };
    return { recorded: true };
  } catch {
    // Analytics never breaks the flow it measures.
    return { recorded: false, reason: 'write_failed' };
  }
}
