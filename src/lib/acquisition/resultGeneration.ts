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
import type { AcquisitionResult } from './types';

const DISCLAIMER_VERSION = '2026-07-11.v1';

export interface GenerateInput {
  sessionId: string;
  leadIdentityId: string;
  toolId: string;
  profile: LeadProfileValues;
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

  // Already generated? Return it. Do not recompute, do not re-mint a token, do not re-send.
  const { data: existing } = await supabaseAdmin
    .from('lead_magnet_results')
    .select('id, result_data, tool_slug')
    .eq('lead_session_id', input.sessionId)
    .eq('tool_slug', tool.id)
    .maybeSingle();

  if (existing) {
    // The raw token was returned exactly once, at mint time, and only the hash was stored.
    // We genuinely cannot reconstruct the URL here, and that is the correct trade: a
    // database read must not yield a working link. The caller re-sends the stored result via
    // the admin "resend link" action, which mints a fresh token deliberately.
    const rd = (existing.result_data as Record<string, unknown>) ?? {};
    return {
      resultId: String(existing.id),
      toolSlug: String(existing.tool_slug),
      publicToken: '',
      resultUrl: '',
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
        const rd = (raced.result_data as Record<string, unknown>) ?? {};
        return {
          resultId: String(raced.id),
          toolSlug: String(raced.tool_slug),
          publicToken: '',
          resultUrl: '',
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
