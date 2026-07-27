// Server-only experiment helpers. Take the caller's service-role admin client as an argument (the
// repo pattern). Everything is fail-safe: a missing table (pre-migration) or any error resolves to
// "no experiment" / "not recorded", so the flow it measures is never broken.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getExperimentConfig,
  isKnownExperience,
  isKnownVariant,
  type ExperimentConfigDef,
} from './registry';
import { assignVariant, evenAllocation, type AllocationEntry } from './assignment';
import { isTaxonomyEvent, isActualBasis } from './taxonomy';

/** admin_settings feature flag, same shape as quest_engine/royalty_readiness. */
export async function isExperimentsEnabled(admin: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await admin.from('admin_settings').select('value').eq('key', 'experiments').maybeSingle();
    return !!(data?.value as { enabled?: boolean } | null)?.enabled;
  } catch {
    return false;
  }
}

export interface RunningExperiment {
  config: ExperimentConfigDef;
  configVersion: string;
  allocation: AllocationEntry[];
}

/** The running experiment covering an experience, or null. Requires the flag ON and status running.
 *  Allocation comes from the DB row, falling back to an even split of the config's variants. */
export async function getRunningExperimentForExperience(
  admin: SupabaseClient,
  experienceKey: string,
): Promise<RunningExperiment | null> {
  if (!isKnownExperience(experienceKey)) return null;
  if (!(await isExperimentsEnabled(admin))) return null;
  try {
    const { data } = await admin
      .from('experiments')
      .select('key, status, allocation, config_version, start_at, end_at')
      .eq('status', 'running')
      .limit(50);
    if (!Array.isArray(data)) return null;

    const now = Date.now();
    for (const row of data as {
      key: string;
      allocation: Record<string, number> | null;
      config_version: string | null;
      start_at: string | null;
      end_at: string | null;
    }[]) {
      const cfg = getExperimentConfig(row.key);
      if (!cfg || !cfg.experienceKeys.includes(experienceKey)) continue;
      if (row.start_at && new Date(row.start_at).getTime() > now) continue;
      if (row.end_at && new Date(row.end_at).getTime() < now) continue;

      const allocation: AllocationEntry[] = [];
      const raw = row.allocation && typeof row.allocation === 'object' ? row.allocation : {};
      for (const v of cfg.variants) {
        const pct = Number(raw[v.key]);
        if (Number.isFinite(pct) && pct > 0) allocation.push({ variantKey: v.key, pct });
      }
      return {
        config: cfg,
        configVersion: row.config_version || cfg.configVersion,
        allocation: allocation.length ? allocation : evenAllocation(cfg.variants.map((v) => v.key)),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Deterministically resolve the variant for an aid under a running experiment (tamper-proof:
 *  the server derives it, the client can never pick its own arm). */
export function resolveVariant(aid: string, exp: RunningExperiment): string | null {
  return assignVariant(aid, exp.config.key, exp.configVersion, exp.allocation);
}

export interface ExperimentEventInput {
  aid: string;
  experimentKey: string;
  experienceKey: string;
  variantKey: string | null;
  configVersion: string;
  eventName: string;
  userId?: string | null;
  artistId?: string | null;
  toolKey?: string | null;
  opportunityKey?: string | null;
  sourceVideo?: string | null;
  campaign?: string | null;
  keyword?: string | null;
  leadMagnet?: string | null;
  valueCents?: number | null;
  dedupeKey?: string | null;
}

const RESERVED_EVENTS = new Set(['assigned', 'exposed']);
const clip = (v: unknown): string | null => (typeof v === 'string' && v ? v.slice(0, 200) : null);

/** Validate + record one experiment event. Rejects unknown event names and unknown variants, drops
 *  any value_cents on a non-actual event (a projection can never masquerade as captured money). */
export async function recordExperimentEvent(admin: SupabaseClient, input: ExperimentEventInput): Promise<boolean> {
  // Validate against the CODE registry + taxonomy. No arbitrary event or variant is accepted.
  if (!input.aid || !isKnownExperience(input.experienceKey)) return false;
  if (!RESERVED_EVENTS.has(input.eventName) && !isTaxonomyEvent(input.eventName)) return false;
  if (input.variantKey && !isKnownVariant(input.experimentKey, input.variantKey)) return false;

  // Financial value is allowed ONLY on an actual-basis outcome event.
  const valueCents =
    input.valueCents != null && Number.isFinite(input.valueCents) && isActualBasis(input.eventName)
      ? Math.max(0, Math.round(input.valueCents))
      : null;

  try {
    await admin.from('experiment_events').upsert(
      {
        aid: clip(input.aid),
        user_id: input.userId || null,
        artist_id: input.artistId || null,
        experiment_key: clip(input.experimentKey),
        experience_key: clip(input.experienceKey),
        variant_key: input.variantKey ? clip(input.variantKey) : null,
        config_version: clip(input.configVersion) || '1',
        event_name: clip(input.eventName),
        tool_key: clip(input.toolKey),
        opportunity_key: clip(input.opportunityKey),
        source_video: clip(input.sourceVideo),
        campaign: clip(input.campaign),
        keyword: clip(input.keyword),
        lead_magnet: clip(input.leadMagnet),
        value_cents: valueCents,
        dedupe_key: input.dedupeKey ? clip(input.dedupeKey) : null,
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    );
    return true;
  } catch {
    return false; // pre-migration or DB error: never break the flow
  }
}
