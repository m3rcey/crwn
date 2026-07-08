// Team Splits — AI Manager insights. Writes advisory rows into ai_insights
// (the same table the AiManagerCard renders) so the artist gets Team-Split
// nudges alongside their other AI guidance. Rule-based, dedup-guarded, and
// best-effort — never throws into the caller. AI never sends deals, changes
// terms, approves deliverables, or releases payouts; these are read-only nudges.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TeamSplitDeal } from './types';

const ACTION_URL = '/profile/artist?tab=team';

async function upsertInsight(
  admin: SupabaseClient,
  artistId: string,
  dealId: string,
  code: string,
  priority: 'urgent' | 'high' | 'normal' | 'low',
  title: string,
  body: string,
) {
  // Dedup: skip if a live (non-dismissed) insight with this code+deal exists.
  const { data: existing } = await admin
    .from('ai_insights')
    .select('id')
    .eq('artist_id', artistId)
    .eq('is_dismissed', false)
    .eq('data->>deal_id', dealId)
    .eq('data->>code', code)
    .maybeSingle();
  if (existing) return;

  await admin.from('ai_insights').insert({
    artist_id: artistId,
    type: 'revenue',
    priority,
    title,
    body,
    data: { deal_id: dealId, code, source: 'team_splits' },
    action_type: 'link',
    action_url: ACTION_URL,
    expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
  });
}

/** Generate Team-Split nudges for all of an artist's active deals. Best-effort. */
export async function generateTeamSplitInsights(admin: SupabaseClient): Promise<number> {
  let written = 0;
  try {
    const { data: deals } = await admin
      .from('team_split_deals')
      .select('*')
      .in('status', ['active', 'accepted', 'paused']);

    for (const raw of deals || []) {
      const deal = raw as TeamSplitDeal;
      try {
        // (a) Held accruals ready for the artist to review/release.
        const { data: held } = await admin
          .from('team_split_earnings')
          .select('commission_amount')
          .eq('deal_id', deal.id)
          .eq('status', 'held')
          .is('released_at', null)
          .gt('commission_amount', 0);
        const heldTotal = (held || []).reduce((s, r) => s + r.commission_amount, 0);
        if (heldTotal >= 500) {
          await upsertInsight(admin, deal.artist_id, deal.id, 'ts_ready_to_release', 'high',
            'Team Split payout ready to review',
            `${deal.collaborator_name || 'A collaborator'} has $${(heldTotal / 100).toFixed(2)} in accrued earnings on "${deal.title}". Review deliverables, then release when you're ready.`);
          written++;
        }

        // (b) High-risk terms flagged at creation.
        if (deal.is_high_risk) {
          await upsertInsight(admin, deal.artist_id, deal.id, 'ts_high_risk', 'normal',
            'Review a high-risk Team Split',
            `Your deal "${deal.title}" was flagged (high percentage, no cap, or all-earnings). Consider a cap or a shorter duration to reduce long-term risk.`);
          written++;
        }
      } catch { /* per-deal best-effort */ }
    }
  } catch { /* never break the caller */ }
  return written;
}
