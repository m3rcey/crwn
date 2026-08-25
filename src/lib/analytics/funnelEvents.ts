// The lead-magnet funnel recorder.
//
// One function writes one canonical `funnel_events` row for any of the fifteen stages, with the
// five reporting dimensions and a dedup key. Every write is server-side and fail-safe: analytics
// must never break the flow it measures, so nothing here throws for its caller.
//
// "No duplicate events" is enforced at the DB (unique dedupe_key, ON CONFLICT DO NOTHING). Callers
// pass a DETERMINISTIC key for a stage that must fire once (setup_completed:<artistId>); for an
// inherently repeatable stage (a page view) they pass a per-occurrence key (page_viewed:<eventId>)
// so genuine repeats are distinct rows while a retried beacon of the SAME occurrence collapses.

import { randomUUID } from 'crypto';

// The twenty canonical stages. This is the source of truth; the funnel_events CHECK mirrors it.
// The last five extend the spine below the builder: through Stripe, launch, fan import, the
// first invitation and the first paid conversion, so the funnel connects an anonymous
// calculator run to real money.
export const FUNNEL_STAGES = [
  'page_viewed',
  'calculator_started',
  'calculator_completed',
  'result_revealed',
  'assumptions_changed',
  'email_submitted',
  'signup_clicked',
  'account_created',
  'email_verified',
  'setup_started',
  'setup_completed',
  'builder_opened',
  'builder_published',
  'rise_mode_started',
  'mission_completed',
  'call_requested',
  'stripe_connected',
  'fans_imported',
  'fan_invited',
  'first_paid_conversion',
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

const STAGE_SET = new Set<string>(FUNNEL_STAGES);

export function isFunnelStage(s: unknown): s is FunnelStage {
  return typeof s === 'string' && STAGE_SET.has(s);
}

// Map the existing client lead-magnet beacon event names onto funnel stages, so the top of the
// funnel is mirrored into funnel_events from the EXISTING beacon route rather than re-emitted.
// Only the events that ARE funnel stages appear here; the rest (step_completed, shared, ...) stay
// out of the funnel table.
export const LM_EVENT_TO_STAGE: Record<string, FunnelStage> = {
  lead_magnet_viewed: 'page_viewed',
  lead_magnet_directory_viewed: 'page_viewed',
  lead_magnet_started: 'calculator_started',
  lead_magnet_result_generated: 'calculator_completed',
  lead_magnet_result_unlocked: 'result_revealed',
  lead_magnet_signup_clicked: 'signup_clicked',
};

// Minimal shape of the service-role client (the routes already have one).
type Db = { from: (t: string) => any };

export interface FunnelDimensions {
  calculator?: string | null;
  campaign?: string | null;
  referrer?: string | null;
  /** utm_content: the specific video/creative that drove the visit. */
  video?: string | null;
  artistId?: string | null;
  userId?: string | null;
  resultId?: string | null;
  anonId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RecordFunnelInput extends FunnelDimensions {
  stage: FunnelStage | string;
  /** Deterministic per-occurrence key. Omit for a stage where every fire is its own event. */
  dedupeKey?: string | null;
  /** Override the event time (e.g. replaying). Defaults to now() at the DB. */
  occurredAt?: string | null;
}

const MAX_TEXT = 200;
function clip(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, MAX_TEXT) : null;
}

/**
 * Build the funnel_events row from validated, clipped inputs. Pure and exported so tests can
 * assert exactly what gets written without a database. Returns null for an unknown stage.
 */
export function buildFunnelRow(input: RecordFunnelInput): Record<string, unknown> | null {
  if (!isFunnelStage(input.stage)) return null;
  return {
    stage: input.stage,
    calculator: clip(input.calculator),
    campaign: clip(input.campaign),
    referrer: clip(input.referrer),
    video: clip(input.video),
    artist_id: input.artistId || null,
    user_id: input.userId || null,
    result_id: input.resultId || null,
    anon_id: clip(input.anonId),
    // A deterministic key collapses retries of one occurrence; its absence means "always distinct".
    dedupe_key: input.dedupeKey ? `${input.stage}:${input.dedupeKey}`.slice(0, MAX_TEXT) : randomUUID(),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
  };
}

/**
 * Record one funnel event. Fail-safe: an unknown stage, a missing table (pre-migration), or any
 * DB error is swallowed so the funnel it measures is never broken.
 */
export async function recordFunnelEvent(db: Db, input: RecordFunnelInput): Promise<void> {
  const row = buildFunnelRow(input);
  if (!row) return;
  // Founder exclusion (see src/lib/analytics/doNotTrack.ts): an event attributed to an admin
  // user is never recorded. This is the chokepoint that covers server-side call sites
  // (webhooks, auto-claim) where the device cookie never travels. Fails OPEN: an unreadable
  // role must never drop a real user's event.
  if (input.userId) {
    try {
      const { data } = await db.from('profiles').select('role').eq('id', input.userId).maybeSingle();
      if (data?.role === 'admin') return;
    } catch {
      // fail open — record the event
    }
  }
  try {
    // ON CONFLICT (dedupe_key) DO NOTHING — the whole no-duplicate guarantee, at the DB.
    await db.from('funnel_events').upsert(row, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  } catch {
    // Analytics never breaks the funnel.
  }
}
