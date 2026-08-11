// recommendationStore.ts — the only writer of constraint_recommendations.
//
// SERVICE ROLE ONLY. The table has no client write policy (see
// supabase/schema-phase3-recommendation-outcomes.sql), so every insert and update lands here. An
// artist can read their own history through RLS and can never author it.
//
// FAILS SOFT, ALWAYS. Recording evidence must never cost an artist their dashboard: if the
// migration has not been applied yet (42P01) or a write races, the caller gets its normal answer
// and nothing is recorded. A missing row is a gap in CRWN's evidence, which is recoverable. A
// dashboard that 500s because a bookkeeping insert failed is not.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConstraintResult, ConstraintType } from './types';
import { isDiagnosed } from './types';
import {
  actionKeyFor,
  classifyOutcome,
  issuedFrom,
  isDueForMeasurement,
  type IssuedRecommendation,
  type ObservedMetric,
  type OutcomeState,
} from './recommendationOutcome';

const TABLE = 'constraint_recommendations';

export interface OpenRecommendationRow {
  id: string;
  artist_id: string;
  constraint_type: ConstraintType;
  action_key: string;
  verified_by: string | null;
  baseline_evidence: ObservedMetric[];
  action_completed_at: string | null;
  issued_at: string;
  measure_after_days: number | null;
  outcome: OutcomeState;
}

/**
 * Record that CRWN issued this recommendation, exactly once while it stays open.
 *
 * IDEMPOTENT BY CONSTRUCTION. The dashboard calls the constraint route on every load, and any
 * other surface rendering the same diagnosis calls the same path; a partial unique index on
 * (artist_id, constraint_type) WHERE outcome = 'not_measured_yet' makes every one of those resolve
 * to the SAME row. Repeat calls do nothing at all: notably they do NOT refresh the baseline, or a
 * week of dashboard visits would quietly slide the "before" picture forward until it matched the
 * "after" and every recommendation looked like it changed nothing.
 *
 * An `insufficient_evidence` result is never recorded. CRWN staying silent is not a recommendation.
 */
export async function recordIssuedRecommendation(
  db: SupabaseClient,
  artistId: string,
  result: ConstraintResult,
): Promise<void> {
  const issued = issuedFrom(result);
  if (!issued) return;

  try {
    const { error } = await db.from(TABLE).insert({
      artist_id: artistId,
      constraint_type: issued.constraint,
      action_key: issued.actionKey,
      verified_by: issued.verifiedBy,
      confidence: issued.confidence,
      baseline_evidence: issued.baseline,
      measure_after_days: issued.measureAfterDays,
      issued_at: issued.issuedAt,
      outcome: 'not_measured_yet',
    });
    // supabase-js RETURNS an {error} rather than throwing (CLAUDE.md: the single most common
    // silent-failure bug in this codebase), so the catch below is not what handles a rejected
    // insert. This is.
    //
    // Two codes are EXPECTED and stay silent:
    //   23505 - the partial unique index rejected a duplicate. That is the idempotency guarantee
    //           doing its job on a repeat dashboard load, i.e. the success case.
    //   42P01 - the table does not exist because the migration has not been applied yet. Silent by
    //           design: the product must behave exactly as before until it runs.
    // Anything else is a real fault. It must not cost the artist their dashboard, but CRWN needs to
    // be able to see it, or evidence collection could fail silently forever and look like an artist
    // who was simply never diagnosed.
    if (error && !isExpectedWriteError(error)) {
      console.error('constraint recommendation not recorded:', error.code, error.message);
    }
  } catch (err) {
    // A genuine throw (network, client misconfiguration). Same rule: soft for the artist, visible.
    console.error('constraint recommendation insert threw:', err);
  }
}

/** Codes that mean "working as intended", not "something is wrong". */
function isExpectedWriteError(error: { code?: string | null }): boolean {
  return error.code === '23505' || error.code === '42P01';
}

/**
 * Mark the action done, once, when the DomainCheck that proves it now passes.
 *
 * Completion is NOT success and is stored in its own column for that reason. The caller supplies
 * the verdict from the Quest Engine's evaluator; this module never evaluates a DomainCheck itself,
 * because a second completion oracle is the exact mistake the Constraint Engine was built to avoid.
 * Only ever set from null, so the first completion timestamp is the one that survives.
 */
export async function markActionCompleted(
  db: SupabaseClient,
  recommendationId: string,
  at: string,
): Promise<void> {
  try {
    const { error } = await db
      .from(TABLE)
      .update({ action_completed_at: at })
      .eq('id', recommendationId)
      .is('action_completed_at', null);
    // Silent only where silence is correct (table not yet created). A real failure here means CRWN
    // would record recommendations forever and never notice anyone acting on them.
    if (error && !isExpectedWriteError(error)) {
      console.error('constraint action completion not recorded:', error.code, error.message);
    }
  } catch (err) {
    console.error('constraint action completion threw:', err);
  }
}

/** Open recommendations across all artists, oldest first, for the measurement cron. */
export async function openRecommendations(
  db: SupabaseClient,
  limit = 200,
): Promise<OpenRecommendationRow[]> {
  try {
    const { data, error } = await db
      .from(TABLE)
      .select('id, artist_id, constraint_type, action_key, verified_by, baseline_evidence, action_completed_at, issued_at, measure_after_days, outcome')
      .eq('outcome', 'not_measured_yet')
      .order('issued_at', { ascending: true })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data as unknown as OpenRecommendationRow[];
  } catch {
    return [];
  }
}

/**
 * Write the later observation and the outcome.
 *
 * Writes ONLY the observation columns. `baseline_evidence` is never in the update payload, so the
 * "before" picture is immutable once issued, and the row stops being open the moment an outcome is
 * written (the partial unique index then frees the artist+constraint pair for a future diagnosis).
 */
export async function recordMeasuredOutcome(
  db: SupabaseClient,
  recommendationId: string,
  measured: { outcome: OutcomeState; observed: ObservedMetric[]; constraintNow: ConstraintType | null; measuredAt: string },
): Promise<boolean> {
  try {
    const { error } = await db
      .from(TABLE)
      .update({
        outcome: measured.outcome,
        observed_evidence: measured.observed,
        constraint_now: measured.constraintNow,
        measured_at: measured.measuredAt,
      })
      .eq('id', recommendationId)
      .eq('outcome', 'not_measured_yet'); // idempotent: a second cron pass writes nothing
    if (error && !isExpectedWriteError(error)) {
      console.error('constraint outcome not recorded:', error.code, error.message);
    }
    return !error;
  } catch (err) {
    console.error('constraint outcome write threw:', err);
    return false;
  }
}

/**
 * Measure one open recommendation against a freshly-read constraint result.
 *
 * Pure decision, delegated write. Returns false when the row is not due yet, so a cron can hand it
 * every open row without deciding anything itself.
 */
export async function measureOne(
  db: SupabaseClient,
  row: OpenRecommendationRow,
  laterResult: ConstraintResult,
  now: string,
): Promise<boolean> {
  if (!isDueForMeasurement({ issuedAt: row.issued_at, measureAfterDays: row.measure_after_days }, now)) {
    return false;
  }
  const measured = classifyOutcome({ constraint: row.constraint_type }, laterResult, now);
  return recordMeasuredOutcome(db, row.id, measured);
}

/**
 * The artist's own recommendation history, newest first. Read through the CALLER's session client
 * so RLS is the thing enforcing ownership, not a filter this module remembered to add.
 */
export async function readOwnHistory(
  sessionDb: SupabaseClient,
  limit = 20,
): Promise<OpenRecommendationRow[]> {
  try {
    const { data, error } = await sessionDb
      .from(TABLE)
      .select('id, artist_id, constraint_type, action_key, verified_by, baseline_evidence, action_completed_at, issued_at, measure_after_days, outcome')
      .order('issued_at', { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data as unknown as OpenRecommendationRow[];
  } catch {
    return [];
  }
}

/** Re-export so callers need one import for the identity helper. */
export { actionKeyFor, isDiagnosed };
export type { IssuedRecommendation };
