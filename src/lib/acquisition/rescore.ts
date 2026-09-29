// Recompute a lead's score from LIVE data.
//
// WHY THIS EXISTS
// leadScoring.ts computes a behavior component: result viewed, result recalculated, account
// claimed, setup started, setup completed, lead magnets completed, return visit. Real signals,
// carefully weighted.
//
// And the orchestrator was passing EMPTY_BEHAVIOR. A hardcoded blank. Every one of those
// signals was computed by the scorer and then thrown away, so the score was FROZEN at the
// moment she answered the last DM question and never moved again.
//
// The consequence is not academic. The score decides whether Josh gets an alert. A lead with
// 100,000 monthly listeners who opened her result and sat there editing the assumptions is
// about as hot as this funnel produces, and CRWN filed her as "unqualified" and told nobody.
//
// Found on the first real lead. Fixed here: the score is recomputed from what she has actually
// DONE, every time she does something.

import { supabaseAdmin } from './db';
import { scoreLead, type ScoreBehavior } from './leadScoring';
import { enqueue } from './eventOutbox';
import { inputsChanged } from './inputProvenance';
import type { LeadProfileValues } from './toolAdapters';
import type { LeadScore } from './types';

export interface RescoreOptions {
  sessionId?: string | null;
  claudeSignal?: number | null;
  sourceEvent?: string;
}

/**
 * Load the profile and the REAL behavior, score, persist, and alert if she is hot.
 *
 * Never throws: a scoring failure must not break a live DM or a page render.
 */
export async function recomputeScore(identityId: string, opts: RescoreOptions = {}): Promise<void> {
  try {
    const score = await scoreCurrent(identityId, opts.claudeSignal);

    await supabaseAdmin.from('lead_profiles').upsert(
      {
        lead_identity_id: identityId,
        lead_score: score.total,
        lead_score_version: score.version,
        score_band: score.band,
        ...(opts.claudeSignal != null ? { claude_score_signal: opts.claudeSignal } : {}),
      },
      { onConflict: 'lead_identity_id' },
    );

    await supabaseAdmin.from('lead_score_history').insert({
      lead_identity_id: identityId,
      session_id: opts.sessionId ?? null,
      total_score: score.total,
      score_version: score.version,
      components: score.components,
      reason_codes: score.reasonCodes,
      band: score.band,
      source_event: opts.sourceEvent ?? 'recompute',
    });

    // A lead this warm should not be handled by a robot. Tell Josh, once, ever.
    if (score.band === 'sales_priority') {
      await enqueue('high_intent_alert', {
        leadIdentityId: identityId,
        sessionId: opts.sessionId ?? null,
        idempotencyKey: `high_intent:${identityId}`,
      });
    }
  } catch (err) {
    console.error('[acquisition] rescore failed:', err instanceof Error ? err.message : 'unknown');
  }
}

/**
 * The canonical score of a lead's CURRENT evidence, READ-ONLY: the same profile, the same
 * behavior loader and the same scoreLead() that recomputeScore persists, minus every write and
 * the alert. For a reader that must not trust a stored band that may predate a fix or a
 * progression (founder follow-up). It is not a second scorer; it IS the scorer.
 */
export async function scoreCurrent(identityId: string, claudeSignal?: number | null): Promise<LeadScore> {
  const [{ data: profile }, behavior] = await Promise.all([
    supabaseAdmin.from('lead_profiles').select('*').eq('lead_identity_id', identityId).maybeSingle(),
    loadBehavior(identityId),
  ]);
  return scoreLead({
    profile: (profile ?? {}) as LeadProfileValues,
    behavior,
    claudeSignal: claudeSignal ?? (profile?.claude_score_signal as number | null) ?? 0,
  });
}

/**
 * What she has ACTUALLY done, read from the database.
 *
 * Not what she said. What she did. Behavior outranks claims every time, which is why this is
 * the heaviest bucket in the scorer that is not about who she is.
 */
export async function loadBehavior(identityId: string): Promise<ScoreBehavior> {
  const [{ data: results }, { data: identity }, { count: sessionCount }, { data: booked }] = await Promise.all([
    supabaseAdmin
      .from('lead_magnet_results')
      .select('viewed_at, recalculated_at, claimed_at, tool_slug, input_data, original_input_data')
      .eq('lead_identity_id', identityId),
    supabaseAdmin
      .from('lead_identities')
      .select('user_id, artist_id, claimed_at')
      .eq('id', identityId)
      .maybeSingle(),
    supabaseAdmin
      .from('lead_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('lead_identity_id', identityId),
    // A live booking. 'recorded' excludes one she has since cancelled: putting time in the
    // diary and then taking it back out is not the same signal as putting it in.
    supabaseAdmin
      .from('acquisition_events')
      .select('id')
      .eq('lead_identity_id', identityId)
      .eq('event_name', 'sales_call_booked')
      .eq('status', 'recorded')
      .limit(1)
      .maybeSingle(),
  ]);

  const rows = results ?? [];

  // Did she actually finish setup? Derived from the DB, never assumed. An Instagram artist
  // name is not a photo upload and it is not a track.
  let setupStarted = false;
  let setupCompleted = false;
  if (identity?.artist_id) {
    setupStarted = true;
    const { data: artist } = await supabaseAdmin
      .from('artist_profiles')
      .select('setup_completed')
      .eq('id', identity.artist_id)
      .maybeSingle();
    setupCompleted = artist?.setup_completed === true;
  }

  return {
    resultViewed: rows.some((r) => !!r.viewed_at),
    // She did not just glance at the number. She ARGUED with it. That is the strongest
    // engagement signal in the whole funnel and it was worth nothing until today.
    // A recalculation counts only if it CHANGED a modeled number. Until 2026-09-29 the result page
    // auto-saved its initial values on load, stamping recalculated_at on a mere view; those rows
    // are still in production, and comparing the two snapshots is what stops them counting,
    // with no rewrite of the data.
    resultRecalculated: rows.some((r) => !!r.recalculated_at && inputsChanged(r.original_input_data, r.input_data)),
    accountClaimed: !!identity?.claimed_at || !!identity?.user_id,
    setupStarted,
    setupCompleted,
    leadMagnetsCompleted: new Set(rows.map((r) => r.tool_slug)).size,
    returnVisit: (sessionCount ?? 0) > 1,
    bookedCall: !!booked,
  };
}
