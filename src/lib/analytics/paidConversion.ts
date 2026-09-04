// paidConversion.ts — the ONE definition of an artist's first paid fan conversion.
//
// The `first_paid_conversion` funnel stage already existed and was already emitted from two
// of the six paid rails (subscription checkout and product purchase). It was emitted inline,
// twice, with no attribution dimensions. This module exists for two reasons:
//
//   1. COVERAGE. A track sale, a booking, a live ticket or a live tip is money from a fan to
//      an artist. With only two rails wired, an artist whose first dollar arrived any other
//      way read as "never converted" forever, because the stage is deduped per artist and the
//      first event is the only one that ever lands.
//   2. ATTRIBUTION. The inline calls passed artistId and nothing else, so the row could not be
//      joined back to the calculator the artist came in through. That join is the entire point
//      of carrying the funnel below signup: it is what answers "which tool produces artists
//      who actually get paid". Resolving it in one place is also why this is a module rather
//      than six copies of a lookup that would drift after the first edit.
//
// The dedupe key is the ARTIST id, enforced by a unique index on funnel_events.dedupe_key with
// ON CONFLICT DO NOTHING. That single fact delivers most of the required behavior for free:
// webhook retries collapse, later conversions collapse, and two rails racing on the same
// artist collapse. There is no read-then-write, so there is no race to lose.

import { recordFunnelEvent, type RecordFunnelInput } from './funnelEvents';
import { getLeadMagnetSeed } from '@/lib/leadResults/handoffSeed';
import { attributionDimsFor } from './attributionLookup';
import type { FunnelAttributionDims } from './campaignAttribution';

/**
 * Which rail produced the first dollar. Kept in metadata rather than in the stage name so the
 * funnel keeps ONE stage (the artist converted) while analysis can still separate a membership
 * from a tip. A tip is real money and counts as converted; it is tagged so that a stricter
 * reading ("recurring only") remains possible later without a backfill.
 */
export const PAID_CONVERSION_KINDS = [
  'subscription',
  'product',
  'track',
  'booking',
  'live_ticket',
  'live_tip',
] as const;

export type PaidConversionKind = (typeof PAID_CONVERSION_KINDS)[number];

const KIND_SET = new Set<string>(PAID_CONVERSION_KINDS);

export function isPaidConversionKind(v: unknown): v is PaidConversionKind {
  return typeof v === 'string' && KIND_SET.has(v);
}

export interface BuildPaidConversionInput {
  artistId: string;
  kind: PaidConversionKind;
  /** Tool slug of the artist's claimed calculator result, when they have one. */
  calculator?: string | null;
  /** The claimed result row id, so the event joins straight back to the modeled number. */
  resultId?: string | null;
  userId?: string | null;
  /** The campaign tag the artist arrived through, so the first dollar joins back to a VIDEO. */
  attribution?: FunnelAttributionDims;
}

/**
 * Build the funnel input for a first paid conversion. Pure, so the dedupe key and the
 * attribution dimensions are testable without a database or a Stripe event.
 *
 * Returns null for a missing artist or an unknown kind rather than writing an unattributable
 * row: a first-conversion event that names no artist is not recoverable later.
 */
export function buildPaidConversionEvent(input: BuildPaidConversionInput): RecordFunnelInput | null {
  if (!input.artistId || typeof input.artistId !== 'string') return null;
  if (!isPaidConversionKind(input.kind)) return null;

  const attr = input.attribution ?? {};
  return {
    stage: 'first_paid_conversion',
    artistId: input.artistId,
    userId: input.userId || null,
    calculator: input.calculator || null,
    resultId: input.resultId || null,
    // The content that produced this artist. This is the row the whole attribution layer exists
    // for: it is the only place a video can be connected to real money.
    campaign: attr.campaign ?? null,
    referrer: attr.referrer ?? null,
    video: attr.video ?? null,
    // Per ARTIST, not per payment: this stage means "this artist has been paid, once, ever".
    dedupeKey: input.artistId,
    metadata: { ...(attr.metadata ?? {}), kind: input.kind },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

/**
 * Record an artist's first paid conversion, stamped with the calculator they came in through.
 *
 * Called from every paid webhook rail at the point where the money is already known to have
 * landed (after the earning row is written), never at intent. Refunds are handled by the
 * existing refund path and deliberately do NOT retract this event: "this artist has been paid
 * at least once" is a historical fact about the funnel, and un-converting it would make the
 * calculator-to-first-dollar rate depend on later, unrelated events.
 *
 * Never throws. A failure here must never roll back a payment webhook.
 */
export async function recordFirstPaidConversion(
  db: Db,
  args: {
    artistId: string;
    kind: PaidConversionKind;
    userId?: string | null;
    /**
     * What Stripe ACTUALLY collected on this event, in cents.
     *
     * REQUIRED, and the guard lives here rather than at the six call sites so a rail added
     * later cannot forget it. "First paid" means an artist has been paid; a $0 invoice is
     * not a payment. Fully discounted subscriptions are real (SEC-006 already books their
     * gross as 0), and a prize membership is the case that makes this urgent: without the
     * guard, giving a fan twelve free months would permanently mark an artist as having
     * earned their first dollar. `dedupeKey` is the artist id forever, so a false event
     * cannot be corrected later by a real payment.
     */
    grossAmountCents: number;
  },
): Promise<void> {
  try {
    // No money, no conversion. Non-finite or negative is treated as no money too: a
    // refund or a malformed amount is certainly not a first dollar.
    if (!Number.isFinite(args.grossAmountCents) || args.grossAmountCents <= 0) return;
    // Attribution: the artist's own claimed calculator result. Best-effort by design, since an
    // artist who signed up without a calculator is a normal case, not an error.
    let calculator: string | null = null;
    let resultId: string | null = null;
    try {
      const seed = await getLeadMagnetSeed(db, { userId: args.userId || '', artistId: args.artistId });
      if (seed) {
        calculator = seed.toolSlug;
        resultId = seed.resultId;
      }
    } catch {
      /* unattributed is acceptable; unrecorded is not */
    }

    // Which video/campaign produced this artist. Same best-effort discipline: an unattributed
    // first dollar is still a first dollar, and must still be recorded.
    let attribution: FunnelAttributionDims = {};
    try {
      attribution = await attributionDimsFor(db, { userId: args.userId, artistId: args.artistId });
    } catch {
      /* unattributed is acceptable; unrecorded is not */
    }

    const event = buildPaidConversionEvent({
      artistId: args.artistId,
      kind: args.kind,
      calculator,
      resultId,
      userId: args.userId,
      attribution,
    });
    if (!event) return;

    await recordFunnelEvent(db, event);
  } catch {
    // Analytics never breaks a money path.
  }
}
