// Re-read stored DM answers with the CURRENT canonical normalizer, and rescore through the
// canonical scorer. Built 2026-09-29 for the negation fix (fieldRegistry.ts negatedValue): the
// old first-match rules stored "I have no paid program or subscriptions" as direct_some.
//
// Reviewable by design. `planRenormalization()` is read-only and returns every proposed change
// with the raw text beside it; `applyRenormalization()` writes ONLY the rows the plan marks
// `repair` or `rescore`, each guarded on the value it read, and records what it replaced in
// field_provenance. Nothing here computes a score: it calls recomputeScore.
//
// A row is corrected only when ALL hold:
//   - the stored value came from the deterministic normalizer (field_provenance source
//     'deterministic'), so re-running that same normalizer is the right authority;
//   - the lead's latest raw answer is retained in lead_answers;
//   - the current normalizer returns a NON-null value that differs from a non-null stored one.
// A null re-read ("the parser cannot tell") is `review`: left untouched for a human.

import { supabaseAdmin } from './db';
import { normalizeDeterministic } from './fieldRegistry';
import { recomputeScore, scoreCurrent } from './rescore';

export const RENORMALIZE_RULE = 'negation-first@2026-09-29';
const FIELD = 'monetization_status';

export interface RenormalizePlanRow {
  leadIdentityId: string;
  instagramUsername: string | null;
  raw: string;
  stored: string;
  proposed: string | null;
  kind: 'repair' | 'review' | 'rescore';
  storedBand: string | null;
  storedScore: number | null;
  /** The canonical scorer's answer for the lead as it stands (before any repair). */
  liveBand: string;
  liveScore: number;
}

type Row = Record<string, unknown>;

export async function planRenormalization(): Promise<RenormalizePlanRow[]> {
  const [{ data: profiles }, { data: answers }, { data: ids }] = await Promise.all([
    supabaseAdmin.from('lead_profiles').select('lead_identity_id, monetization_status, field_provenance, score_band, lead_score'),
    supabaseAdmin.from('lead_answers').select('lead_identity_id, raw_value, created_at').eq('field_key', FIELD),
    supabaseAdmin.from('lead_identities').select('id, instagram_username'),
  ]);
  const handle = new Map(((ids ?? []) as Row[]).map((r) => [String(r.id), (r.instagram_username as string) ?? null]));
  const latestRaw = new Map<string, string>();
  for (const a of ((answers ?? []) as Row[]).sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)))) {
    latestRaw.set(String(a.lead_identity_id), String(a.raw_value ?? ''));
  }

  const plan: RenormalizePlanRow[] = [];
  for (const p of (profiles ?? []) as Row[]) {
    const id = String(p.lead_identity_id);
    const stored = typeof p.monetization_status === 'string' ? p.monetization_status : null;
    const source = ((p.field_provenance as Record<string, { source?: string }> | null) ?? {})[FIELD]?.source;
    const raw = latestRaw.get(id);
    const base = {
      leadIdentityId: id,
      instagramUsername: handle.get(id) ?? null,
      storedBand: (p.score_band as string) ?? null,
      storedScore: typeof p.lead_score === 'number' ? p.lead_score : null,
    };

    if (stored && raw !== undefined && source === 'deterministic') {
      const proposed = normalizeDeterministic(FIELD, raw) as string | null;
      if (proposed !== stored) {
        const live = await scoreCurrent(id);
        plan.push({ ...base, raw, stored, proposed, kind: proposed ? 'repair' : 'review', liveBand: live.band, liveScore: live.total });
        continue;
      }
    }
    // No answer to correct, but the stored band disagrees with the canonical score of the
    // current evidence (e.g. a phantom recalculation that no longer counts). Rescore only.
    if (p.score_band) {
      const live = await scoreCurrent(id);
      if (live.band !== p.score_band) {
        plan.push({ ...base, raw: raw ?? '', stored: stored ?? '', proposed: stored, kind: 'rescore', liveBand: live.band, liveScore: live.total });
      }
    }
  }
  return plan;
}

export async function applyRenormalization(): Promise<{ repaired: number; rescored: number; skipped: number }> {
  const plan = await planRenormalization();
  let repaired = 0;
  let rescored = 0;
  let skipped = 0;
  for (const row of plan) {
    if (row.kind === 'review') {
      skipped++;
      continue;
    }
    if (row.kind === 'repair' && row.proposed) {
      const { data: lp } = await supabaseAdmin
        .from('lead_profiles')
        .select('field_provenance')
        .eq('lead_identity_id', row.leadIdentityId)
        .maybeSingle();
      const provenance = { ...((lp?.field_provenance as Row) ?? {}) };
      const prior = (provenance[FIELD] ?? {}) as Row;
      provenance[FIELD] = {
        ...prior,
        source: 'deterministic',
        confidence: 1,
        verifiedAt: new Date().toISOString(),
        renormalized: { from: row.stored, rule: RENORMALIZE_RULE, at: new Date().toISOString() },
      };
      // Guarded on the value we planned from, so a concurrent answer is never overwritten.
      const { data: updated, error } = await supabaseAdmin
        .from('lead_profiles')
        .update({ [FIELD]: row.proposed, field_provenance: provenance })
        .eq('lead_identity_id', row.leadIdentityId)
        .eq(FIELD, row.stored)
        .select('lead_identity_id');
      if (error || !updated?.length) {
        skipped++;
        continue;
      }
      repaired++;
    } else {
      rescored++;
    }
    await recomputeScore(row.leadIdentityId, { sourceEvent: row.kind === 'repair' ? 'answer_renormalized' : 'rescore_stale_band' });
  }
  return { repaired, rescored, skipped };
}
