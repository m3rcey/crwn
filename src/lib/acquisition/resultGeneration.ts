// Result generation.
//
// This is where the acquisition engine calls the EXISTING lead-magnet engines. It computes
// nothing itself. Every number in a stored result came out of resultGenerators.ts or
// leadCalculator.ts, unchanged, which is what makes "the DM result equals the website
// result" true by construction rather than by test.
//
// Duplicate protection is structural: uq_lm_results_session_tool means a session can have at
// most ONE result per tool. A replayed webhook that reaches this function does not mint a
// second result and does not send a second DM. It returns the first one.

import { supabaseAdmin } from './db';
import { getTool, type LeadProfileValues } from './toolAdapters';
import { buildResultUrl, expiresAt, mintToken, RESULT_TTL_SECONDS } from '../leadResults/resultToken';
import { ESTIMATE_DISCLAIMER } from '../leadMagnets/disclaimers';
import { recordEvent } from './eventOutbox';
import { mirrorFunnelForSession } from '../analytics/acquisitionFunnelMirror';
import type { AcquisitionResult } from './types';

const DISCLAIMER_VERSION = '2026-07-11.v1';

export interface GenerateInput {
  sessionId: string;
  leadIdentityId: string;
  toolId: string;
  profile: LeadProfileValues;
}

/**
 * Rotate a fresh public link to a lead's MOST RECENT result, so it can be re-delivered on a
 * later turn, e.g. emailed to a lead who just handed over her address expecting the result there.
 * Only the token HASH is stored, so we cannot resend the old URL; we mint a new token, replace
 * the hash, and hand back a live link. Returns null when the lead has no result yet.
 */
export async function reissueLatestResultLink(
  leadIdentityId: string,
): Promise<{ resultId: string; toolSlug: string; url: string; headline: string } | null> {
  const { data: row } = await supabaseAdmin
    .from('lead_magnet_results')
    .select('id, tool_slug, result_data')
    .eq('lead_identity_id', leadIdentityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return null;

  const rd = (row.result_data as Record<string, unknown>) ?? {};
  const rotated = mintToken();
  await supabaseAdmin
    .from('lead_magnet_results')
    .update({
      public_token_hash: rotated.hash,
      public_token_expires_at: expiresAt(RESULT_TTL_SECONDS),
      revoked_at: null,
    })
    .eq('id', row.id);

  return {
    resultId: String(row.id),
    toolSlug: String(row.tool_slug),
    url: buildResultUrl(String(row.tool_slug), rotated.raw),
    headline: String(rd.headline ?? ''),
  };
}

/**
 * Run the tool and persist an immutable snapshot.
 *
 * Returns the EXISTING result if one is already on file for this session and tool. That is
 * the duplicate-generation guard the state machine relies on.
 */
export async function generateAndStore(input: GenerateInput): Promise<AcquisitionResult | null> {
  const tool = getTool(input.toolId);
  if (!tool) return null;

  // Already generated? Do NOT recompute (the result is immutable), but DO issue a fresh link.
  //
  // Only the token HASH is stored, so the original raw token is genuinely unrecoverable. That
  // is the correct trade (a database read must never yield a working link), but it means
  // "send it to me again" cannot mean "resend the old URL". It has to mean ROTATE: mint a new
  // token, replace the hash, and the previous link stops working.
  //
  // The first version of this returned an empty string here, and finalize() cheerfully sent
  // the artist a DM that said "Here is your breakdown:" with no link in it. A dead end at the
  // exact moment of payoff. Rotation is both the fix and the right behavior.
  const { data: existing } = await supabaseAdmin
    .from('lead_magnet_results')
    .select('id, result_data, tool_slug')
    .eq('lead_session_id', input.sessionId)
    .eq('tool_slug', tool.id)
    .maybeSingle();

  if (existing) {
    const rd = (existing.result_data as Record<string, unknown>) ?? {};
    const rotated = mintToken();

    await supabaseAdmin
      .from('lead_magnet_results')
      .update({
        public_token_hash: rotated.hash,
        public_token_expires_at: expiresAt(RESULT_TTL_SECONDS),
        // A rotated link is a live link again, even if the old one had been revoked.
        revoked_at: null,
      })
      .eq('id', existing.id);

    return {
      resultId: String(existing.id),
      toolSlug: String(existing.tool_slug),
      publicToken: rotated.raw,
      resultUrl: buildResultUrl(String(existing.tool_slug), rotated.raw),
      headline: String(rd.headline ?? ''),
      shareSummary: String(rd.shareSummary ?? ''),
    };
  }

  // ---- The only place a result is computed. Calls the EXISTING pure engine. ----
  const generated = tool.execute(input.profile);

  const { raw, hash } = mintToken();

  const { data, error } = await supabaseAdmin
    .from('lead_magnet_results')
    .insert({
      tool_slug: tool.id,
      lead_session_id: input.sessionId,
      lead_identity_id: input.leadIdentityId,
      status: 'completed',
      source: 'public',
      title: generated.headline,
      // BOTH snapshots. original_input_data is frozen forever; input_data moves when the
      // artist corrects an assumption and recalculates.
      input_data: input.profile,
      original_input_data: input.profile,
      result_data: generated,
      generator_version: generated.generatorVersion,
      calculator_id: tool.calculatorId,
      formula_version: tool.formulaVersion,
      disclaimer_version: tool.requiresEstimateDisclaimer ? DISCLAIMER_VERSION : null,
      public_token_hash: hash,
      public_token_expires_at: expiresAt(RESULT_TTL_SECONDS),
    })
    .select('id')
    .single();

  if (error) {
    // 23505 = a concurrent duplicate webhook beat us here. Re-read and return theirs rather
    // than minting a second result.
    if (error.code === '23505') {
      const { data: raced } = await supabaseAdmin
        .from('lead_magnet_results')
        .select('id, result_data, tool_slug')
        .eq('lead_session_id', input.sessionId)
        .eq('tool_slug', tool.id)
        .maybeSingle();
      if (raced) {
        // Same rule as the already-exists path above: rotate, so the caller always gets a
        // usable link. Never return an empty URL; a linkless result DM is a dead end.
        const rd = (raced.result_data as Record<string, unknown>) ?? {};
        const rotated = mintToken();
        await supabaseAdmin
          .from('lead_magnet_results')
          .update({
            public_token_hash: rotated.hash,
            public_token_expires_at: expiresAt(RESULT_TTL_SECONDS),
          })
          .eq('id', raced.id);

        return {
          resultId: String(raced.id),
          toolSlug: String(raced.tool_slug),
          publicToken: rotated.raw,
          resultUrl: buildResultUrl(String(raced.tool_slug), rotated.raw),
          headline: String(rd.headline ?? ''),
          shareSummary: String(rd.shareSummary ?? ''),
        };
      }
    }
    console.error('[acquisition] result insert failed:', error.code);
    return null;
  }

  await recordEvent('lead_result_generated', {
    leadIdentityId: input.leadIdentityId,
    sessionId: input.sessionId,
    resultId: String(data.id),
    metadata: { tool: tool.id, calculatorId: tool.calculatorId, formulaVersion: tool.formulaVersion },
  });

  // Mirror into the funnel (ManyChat path) -> calculator_completed, with the IG post as the video.
  await mirrorFunnelForSession(supabaseAdmin, input.sessionId, 'calculator_completed', String(data.id), {
    resultId: String(data.id),
  });

  return {
    resultId: String(data.id),
    toolSlug: tool.id,
    publicToken: raw,
    resultUrl: buildResultUrl(tool.id, raw),
    headline: generated.headline,
    shareSummary: generated.shareSummary,
  };
}

export { ESTIMATE_DISCLAIMER, DISCLAIMER_VERSION };
