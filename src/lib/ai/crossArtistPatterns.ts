import { SupabaseClient } from '@supabase/supabase-js';
import { PastOutcome } from './generateActions';

export interface CrossArtistPattern {
  action_type: string;
  sample_size: number;
  positive_rate: number;  // 0-100%
  avg_mrr_delta: number;  // cents
  avg_sub_delta: number;
  avg_churn_delta: number;
  confidence: 'high' | 'medium' | 'low';
  summary: string;        // human-readable insight for the AI prompt
}

/**
 * Aggregates measured outcomes across ALL artists to find patterns.
 * Returns high-confidence patterns the individual artist agent should know about.
 */
export async function getCrossArtistPatterns(
  supabaseAdmin: SupabaseClient,
  excludeArtistId?: string,
): Promise<CrossArtistPattern[]> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

  // Fetch all measured outcomes across all artists
  const query = supabaseAdmin
    .from('artist_agent_actions')
    .select('artist_id, action_type, action_label, outcome_delta')
    .in('status', ['auto_executed', 'executed'])
    .not('outcome_measured_at', 'is', null)
    .not('outcome_delta', 'is', null)
    .gte('executed_at', ninetyDaysAgo)
    .order('executed_at', { ascending: false })
    .limit(200);

  const { data: outcomes } = await query;
  if (!outcomes || outcomes.length === 0) return [];

  // Filter out the current artist's own outcomes (they already get those directly)
  const crossOutcomes = excludeArtistId
    ? outcomes.filter(o => o.artist_id !== excludeArtistId)
    : outcomes;

  if (crossOutcomes.length === 0) return [];

  // Group by action_type
  const groups: Record<string, {
    deltas: Array<{ mrr: number; activeSubs: number; churnRate: number }>;
    labels: string[];
  }> = {};

  for (const outcome of crossOutcomes) {
    const delta = outcome.outcome_delta as Record<string, number>;
    if (!delta) continue;

    const type = outcome.action_type;
    if (!groups[type]) groups[type] = { deltas: [], labels: [] };

    groups[type].deltas.push({
      mrr: delta.mrr || 0,
      activeSubs: delta.activeSubs || 0,
      churnRate: delta.churnRate || 0,
    });
    groups[type].labels.push(outcome.action_label);
  }

  // Build patterns for action types with enough data
  const patterns: CrossArtistPattern[] = [];

  for (const [actionType, group] of Object.entries(groups)) {
    const n = group.deltas.length;
    if (n < 2) continue; // Need at least 2 data points

    const avgMrr = Math.round(group.deltas.reduce((s, d) => s + d.mrr, 0) / n);
    const avgSubs = Math.round(group.deltas.reduce((s, d) => s + d.activeSubs, 0) / n * 10) / 10;
    const avgChurn = Math.round(group.deltas.reduce((s, d) => s + d.churnRate, 0) / n * 100) / 100;

    // Score each outcome: positive = good
    const positiveCount = group.deltas.filter(d => {
      const score = d.mrr + d.activeSubs * 100 - d.churnRate * 500;
      return score > 0;
    }).length;

    const positiveRate = Math.round((positiveCount / n) * 100);
    const confidence = n >= 10 && positiveRate >= 70 ? 'high'
      : n >= 5 && positiveRate >= 60 ? 'medium'
      : 'low';

    // Only include patterns with enough signal
    if (confidence === 'low' && n < 3) continue;

    // Build human-readable summary
    const $ = (cents: number) => `$${(Math.abs(cents) / 100).toFixed(0)}`;
    const verb = positiveRate >= 60 ? 'improved' : 'worsened';
    const effects: string[] = [];
    if (Math.abs(avgMrr) > 50) effects.push(`MRR ${avgMrr > 0 ? '+' : '-'}${$(avgMrr)}`);
    if (Math.abs(avgSubs) >= 0.5) effects.push(`${avgSubs > 0 ? '+' : ''}${avgSubs} subs`);
    if (Math.abs(avgChurn) >= 0.5) effects.push(`churn ${avgChurn > 0 ? '+' : ''}${avgChurn}%`);

    const effectStr = effects.length > 0 ? effects.join(', ') : 'minimal change';
    const summary = `Across ${n} artists, "${actionType}" ${verb} metrics: ${effectStr} (${positiveRate}% positive)`;

    patterns.push({
      action_type: actionType,
      sample_size: n,
      positive_rate: positiveRate,
      avg_mrr_delta: avgMrr,
      avg_sub_delta: avgSubs,
      avg_churn_delta: avgChurn,
      confidence,
      summary,
    });
  }

  // Sort by confidence then sample size
  patterns.sort((a, b) => {
    const confOrder = { high: 0, medium: 1, low: 2 };
    if (confOrder[a.confidence] !== confOrder[b.confidence]) {
      return confOrder[a.confidence] - confOrder[b.confidence];
    }
    return b.sample_size - a.sample_size;
  });

  return patterns.slice(0, 5); // Top 5 patterns for the prompt
}

/**
 * Formats cross-artist patterns for injection into the AI prompt.
 */
export function formatPatternsForPrompt(patterns: CrossArtistPattern[]): string {
  if (patterns.length === 0) return '';

  const lines: string[] = [
    '',
    '=== CROSS-ARTIST INTELLIGENCE (what works across all CRWN artists) ===',
  ];

  for (const p of patterns) {
    const icon = p.positive_rate >= 70 ? 'RECOMMENDED' :
                 p.positive_rate <= 30 ? 'AVOID' : 'MIXED';
    lines.push(`  [${icon}] ${p.summary} (confidence: ${p.confidence})`);
  }

  lines.push('Weight these patterns when choosing actions. High-confidence recommendations should be preferred.');

  return lines.join('\n');
}
