// Conversion adapters map a generated result's `conversionPayload` into a PREFILLED
// navigation URL for an existing CRWN builder. We prefill the existing flow rather
// than duplicating its create/validation logic (discovery: Missions, Proof of Demand,
// and Bounties builders own their own validation). Builders read these `lm_*` params
// and hydrate their draft state; the artist still reviews and clicks the real submit.

import type { LeadMagnetConfig } from './types';

type Params = Record<string, string>;

function proofOfDemandParams(p: Record<string, unknown>): Params {
  const out: Params = {};
  if (p.title) out.lm_title = String(p.title);
  if (p.description) out.lm_description = String(p.description);
  if (p.signal_type) out.lm_signal = String(p.signal_type);
  if (p.goal_count) out.lm_goal = String(p.goal_count);
  if (p.test_price != null) out.lm_price_cents = String(p.test_price);
  if (p.unlock_message) out.lm_unlock = String(p.unlock_message);
  return out;
}

function missionParams(p: Record<string, unknown>): Params {
  const out: Params = {};
  if (p.type) out.lm_type = String(p.type);
  if (p.title) out.lm_title = String(p.title);
  if (p.description) out.lm_description = String(p.description);
  if (p.goal_count) out.lm_goal = String(p.goal_count);
  if (p.reward_type) out.lm_reward_type = String(p.reward_type);
  if (p.reward_detail) out.lm_reward_detail = String(p.reward_detail);
  if (p.cta) out.lm_cta = String(p.cta);
  if (p.audience) out.lm_audience = String(p.audience);
  return out;
}

function bountyParams(p: Record<string, unknown>): Params {
  const out: Params = {};
  if (p.title) out.lm_title = String(p.title);
  if (p.description) out.lm_description = String(p.description);
  if (p.bountyType) out.lm_bounty_type = String(p.bountyType);
  if (p.rewardType) out.lm_reward_type = String(p.rewardType);
  if (p.rewardDetail) out.lm_reward_detail = String(p.rewardDetail);
  if (p.eligibility) out.lm_eligibility = String(p.eligibility);
  if (p.approvalRequired != null) out.lm_approval = p.approvalRequired ? '1' : '0';
  return out;
}

const ADAPTERS: Record<string, (p: Record<string, unknown>) => Params> = {
  proofOfDemand: proofOfDemandParams,
  mission: missionParams,
  bounty: bountyParams,
};

/**
 * Build the prefilled builder URL for a tool's conversion, or null if the tool
 * degrades to a saved plan (no live-feature route/adapter).
 */
export function buildConversionUrl(
  config: LeadMagnetConfig,
  conversionPayload: Record<string, unknown>,
  opts?: { returnTo?: string; resultId?: string },
): string | null {
  const { route, adapterKey } = config.conversionTarget;
  if (!route || !adapterKey) return null;
  const adapter = ADAPTERS[adapterKey];
  if (!adapter) return null;

  const params = new URLSearchParams({ lm_prefill: '1', lm_tool: config.slug, ...adapter(conversionPayload) });
  if (opts?.resultId) params.set('lm_result', opts.resultId);
  if (opts?.returnTo) params.set('returnTo', opts.returnTo);
  return `${route}?${params.toString()}`;
}
