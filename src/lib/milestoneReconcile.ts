// milestoneReconcile.ts — activation milestone TRUTH, derived from canonical rows. (F-04)
//
// THE DEFECT THIS CLOSES. Four of the six activation milestones were written only by a
// fire-and-forget browser fetch into a route that swallows every error. The activation nudge
// rules are PREREQUISITE-CHAINED (`activation-nudges` cron), so one lost write permanently
// silenced every downstream lifecycle email for that artist, and nothing ever noticed. The
// admin funnel, the admin agent and the recruiter dashboard all read the same fragile field.
//
// THE PRINCIPLE. Do not trust a browser write where the server can prove the fact. A track
// row proves the first upload; a tier row proves tiers were created; the `setup_completed`
// funnel event proves onboarding finished; a subscription earning proves the first paid
// subscriber. This module derives those truths and materializes them into the existing
// `artist_profiles.activation_milestones` jsonb, which stays as the compatibility cache every
// current reader already consumes. No new engine, no new schema.
//
// WHAT IT NEVER DOES:
//   - It never touches `stripe_connected`. That milestone is canonical only when a live
//     Stripe `charges_enabled` check wrote it (`connectReconcile`), and deriving it from the
//     mere presence of a connect id would launder an unverified account into "money-ready".
//   - It never overwrites an existing timestamp. First write wins, same as
//     `recordActivationMilestone`.
//   - It never stamps `now()`. Every derived value is the historical evidence timestamp
//     (first track's created_at, the setup funnel event's created_at, ...). Where the only
//     evidence is a boolean with no timestamp (legacy pre-wizard artists whose
//     setup_completed was backfilled), the artist's own created_at is used: the earliest
//     defensible date, which by construction can never look like a fresh completion.
//
// BACKFILL WITHOUT A NUDGE STORM (founder Decision D, 2026-08-12). Reconciled truth uses
// historical timestamps, so an artist who stalled six months ago now LOOKS six months
// stalled — which is true, but must not trigger the "you just stalled" lifecycle email. The
// freshness window below separates truth reconciliation from communication eligibility: the
// nudge cron only enrolls when the stall anchor is RECENT. Old stalls are recorded truth,
// not fresh events.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivationMilestone } from '@/lib/activationMilestones';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, any, any>;

/** Milestones this module may derive. stripe_connected and first_subscriber-by-webhook stay canonical. */
export const DERIVABLE_MILESTONES = [
  'onboarding_completed',
  'first_track_uploaded',
  'first_project_created',
  'tiers_created',
  'first_subscriber',
] as const;

export type MilestoneMap = Partial<Record<ActivationMilestone, string>>;

/** A dated row of canonical evidence. */
export interface EvidenceRow {
  artist_id: string;
  created_at: string;
}

export interface ArtistEvidence {
  artistId: string;
  artistCreatedAt: string;
  /** artist_profiles.setup_completed — the wizard-finished flag (backfilled true for legacy artists). */
  setupCompleted: boolean;
  /** created_at of the FIRST setup_completed funnel event, when one exists. */
  setupCompletedEventAt?: string | null;
  /** created_at of the artist's FIRST track row. */
  firstTrackAt?: string | null;
  /** created_at of the artist's FIRST album row. */
  firstAlbumAt?: string | null;
  /** created_at of the artist's FIRST active subscription tier row. */
  firstTierAt?: string | null;
  /** created_at of the artist's FIRST subscription-type earning (paid evidence, not a free join). */
  firstPaidSubEarningAt?: string | null;
}

/**
 * PURE: what milestones does the canonical evidence prove, and when did each become true?
 * Missing evidence stays missing — null never becomes a timestamp, absence never becomes truth.
 */
export function deriveMilestones(e: ArtistEvidence): MilestoneMap {
  const derived: MilestoneMap = {};

  if (e.setupCompletedEventAt) {
    derived.onboarding_completed = e.setupCompletedEventAt;
  } else if (e.setupCompleted) {
    // Legacy artist: the flag is true but predates funnel instrumentation. The signup date is
    // the earliest defensible evidence and can never register as a fresh completion.
    derived.onboarding_completed = e.artistCreatedAt;
  }

  if (e.firstTrackAt) derived.first_track_uploaded = e.firstTrackAt;
  if (e.firstAlbumAt) derived.first_project_created = e.firstAlbumAt;
  if (e.firstTierAt) derived.tiers_created = e.firstTierAt;
  if (e.firstPaidSubEarningAt) derived.first_subscriber = e.firstPaidSubEarningAt;

  return derived;
}

/**
 * PURE: merge derived truth into the existing cache. First write wins — an existing value is
 * already-live truth (possibly written the moment the event happened) and is never replaced
 * by a re-derivation. Returns whether anything changed, so callers write only real deltas.
 */
export function mergeMilestones(
  existing: MilestoneMap,
  derived: MilestoneMap,
): { merged: MilestoneMap; changed: boolean } {
  const merged: MilestoneMap = { ...existing };
  let changed = false;
  for (const [key, value] of Object.entries(derived) as [ActivationMilestone, string][]) {
    if (!merged[key] && value) {
      merged[key] = value;
      changed = true;
    }
  }
  return { merged, changed };
}

// ── Communication eligibility (Decision D) ──────────────────────────────────

/**
 * A stall older than this is recorded truth, not a fresh lifecycle event. The nudge cron
 * refuses to enroll on it, which is what makes historical backfill safe: reconciliation can
 * surface a six-month-old stall without CRWN emailing that artist as though it just happened.
 */
export const MAX_STALL_WINDOW_DAYS = 30;

export interface NudgeRuleShape {
  requiresMilestone: string | null;
  missingMilestone: string;
  stallDays: number;
}

/**
 * PURE: should this rule enroll this artist right now?
 * - prerequisite missing        -> no (not stalled, just early — or truth not yet reconciled)
 * - target milestone present    -> no (already done)
 * - stalled less than stallDays -> no (too early)
 * - stalled beyond the window   -> no (stale stall; truth, not news — Decision D)
 */
export function shouldEnrollForRule(
  rule: NudgeRuleShape,
  milestones: Record<string, string>,
  artistCreatedAt: string,
  now: Date,
): boolean {
  if (milestones[rule.missingMilestone]) return false;

  let anchor: Date;
  if (rule.requiresMilestone) {
    const prereq = milestones[rule.requiresMilestone];
    if (!prereq) return false;
    anchor = new Date(prereq);
  } else {
    anchor = new Date(artistCreatedAt);
  }
  if (Number.isNaN(anchor.getTime())) return false;

  const daysSinceAnchor = (now.getTime() - anchor.getTime()) / 86_400_000;
  return daysSinceAnchor >= rule.stallDays && daysSinceAnchor <= MAX_STALL_WINDOW_DAYS;
}

// ── Batch reconciliation (the one impure entry point) ───────────────────────

/** Reduce dated rows to first-occurrence-per-artist. */
function firstByArtist(rows: EvidenceRow[] | null | undefined): Map<string, string> {
  const first = new Map<string, string>();
  for (const r of rows || []) {
    if (!r.artist_id || !r.created_at) continue;
    const prev = first.get(r.artist_id);
    if (!prev || r.created_at < prev) first.set(r.artist_id, r.created_at);
  }
  return first;
}

/**
 * Reconcile every artist's activation milestones from canonical evidence. Idempotent: a
 * second run derives the same truths and writes nothing. Batched (one query per evidence
 * table), so it is safe to run inside the daily nudge cron ahead of rule evaluation.
 *
 * Returns counts for the cron's report. Never throws for a single bad artist row.
 */
export async function reconcileAllActivationMilestones(
  admin: AdminClient,
): Promise<{ artistsChecked: number; artistsUpdated: number }> {
  const [artistsRes, tracksRes, albumsRes, tiersRes, subEarningsRes, setupEventsRes] = await Promise.all([
    admin.from('artist_profiles').select('id, created_at, setup_completed, activation_milestones'),
    admin.from('tracks').select('artist_id, created_at'),
    admin.from('albums').select('artist_id, created_at'),
    // PAID tiers only: the wizard auto-creates a free Bronze for everyone, and a free tier
    // cannot take money, so it must not satisfy the monetization-chain milestone. (The live
    // client writer is looser; merge is first-write-wins, so this only affects derivation.)
    admin.from('subscription_tiers').select('artist_id, created_at').eq('is_active', true).gt('price', 0),
    admin.from('earnings').select('artist_id, created_at').eq('type', 'subscription'),
    admin.from('funnel_events').select('artist_id, created_at').eq('stage', 'setup_completed'),
  ]);

  const firstTrack = firstByArtist(tracksRes.data as EvidenceRow[] | null);
  const firstAlbum = firstByArtist(albumsRes.data as EvidenceRow[] | null);
  const firstTier = firstByArtist(tiersRes.data as EvidenceRow[] | null);
  const firstSubEarning = firstByArtist(subEarningsRes.data as EvidenceRow[] | null);
  const firstSetupEvent = firstByArtist(setupEventsRes.data as EvidenceRow[] | null);

  let artistsChecked = 0;
  let artistsUpdated = 0;

  for (const artist of artistsRes.data || []) {
    artistsChecked++;
    try {
      const derived = deriveMilestones({
        artistId: artist.id,
        artistCreatedAt: artist.created_at,
        setupCompleted: !!artist.setup_completed,
        setupCompletedEventAt: firstSetupEvent.get(artist.id) ?? null,
        firstTrackAt: firstTrack.get(artist.id) ?? null,
        firstAlbumAt: firstAlbum.get(artist.id) ?? null,
        firstTierAt: firstTier.get(artist.id) ?? null,
        firstPaidSubEarningAt: firstSubEarning.get(artist.id) ?? null,
      });

      const existing = (artist.activation_milestones || {}) as MilestoneMap;
      const { merged, changed } = mergeMilestones(existing, derived);
      if (!changed) continue;

      const { error } = await admin
        .from('artist_profiles')
        .update({ activation_milestones: merged })
        .eq('id', artist.id);
      if (error) {
        // Observable, never fatal: one artist's failed write must not stop the sweep.
        console.error('[milestoneReconcile] update failed for artist', artist.id, error);
        continue;
      }
      artistsUpdated++;
    } catch (err) {
      console.error('[milestoneReconcile] reconcile failed for artist', artist.id, err);
    }
  }

  return { artistsChecked, artistsUpdated };
}
