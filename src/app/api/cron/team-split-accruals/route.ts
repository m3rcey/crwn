import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getQualifyingEarnings, splitAmountForEarning, applyCap } from '@/lib/teamSplits/allocation';
import { generateTeamSplitInsights } from '@/lib/teamSplits/insights';
import type { TeamSplitDeal } from '@/lib/teamSplits/types';

// Daily read-only accrual calculator for Team Splits.
// Reads the `earnings` ledger and WRITES held team_split_earnings rows. It never
// touches the Stripe webhook money path. Nothing becomes cashable until the
// artist releases it (see /api/team-splits/:id/release) and the hold clears.
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Idempotency: once per calendar day.
  const now = new Date();
  const periodKey = now.toISOString().slice(0, 10);
  const { error: lockError } = await supabaseAdmin
    .from('cron_run_log')
    .insert({ job_name: 'team-split-accruals', period_key: periodKey });
  if (lockError) {
    return NextResponse.json({ message: `Already ran for ${periodKey}` });
  }

  const nowIso = now.toISOString();
  let accrualsWritten = 0;
  let clawbacksWritten = 0;
  let dealsProcessed = 0;
  let dealsExpired = 0;

  try {
    // Active revenue-share deals with a percentage.
    const { data: deals } = await supabaseAdmin
      .from('team_split_deals')
      .select('*')
      .eq('status', 'active')
      .not('percentage', 'is', null)
      .not('collaborator_user_id', 'is', null);

    for (const raw of deals || []) {
      const deal = raw as TeamSplitDeal;
      dealsProcessed++;
      try {
        // Expire deals past their end.
        if (deal.ends_at && new Date(deal.ends_at) < now) {
          await supabaseAdmin.from('team_split_deals').update({ status: 'expired' }).eq('id', deal.id);
          dealsExpired++;
          continue;
        }

        // ---- positive accruals ----
        const qualifying = await getQualifyingEarnings(supabaseAdmin, deal);
        if (qualifying.length) {
          // Authoritative accrued-to-date (positive rows only, for the cap).
          const { data: accruedRows } = await supabaseAdmin
            .from('team_split_earnings')
            .select('commission_amount')
            .eq('deal_id', deal.id)
            .gt('commission_amount', 0);
          let accrued = (accruedRows || []).reduce((s, r) => s + r.commission_amount, 0);

          for (const e of qualifying) {
            const rawAmount = splitAmountForEarning(e, deal);
            const amount = applyCap(rawAmount, accrued, deal.cap_amount);
            if (amount <= 0) {
              if (deal.cap_amount != null && accrued >= deal.cap_amount) break; // cap reached
              continue;
            }
            const basisAmount = deal.payout_basis === 'gross_revenue' ? e.gross_amount : e.net_amount;
            const { error: insErr } = await supabaseAdmin.from('team_split_earnings').insert({
              deal_id: deal.id,
              artist_id: deal.artist_id,
              collaborator_user_id: deal.collaborator_user_id,
              earning_id: e.id,
              source_type: deal.revenue_source_type,
              source_id: deal.revenue_source_id,
              basis: deal.payout_basis,
              basis_amount: basisAmount,
              percentage: deal.percentage,
              gross_amount: e.gross_amount,
              commission_amount: amount,
              status: 'held',
              cleared_at: new Date(now.getTime() + (deal.hold_period_days || 7) * 86400000).toISOString(),
            });
            // Unique (deal_id, earning_id) => duplicate is a no-op (idempotent re-run).
            if (!insErr) {
              accrued += amount;
              accrualsWritten++;
            }
            if (deal.cap_amount != null && accrued >= deal.cap_amount) break;
          }

          // Complete the deal if the cap is now fully met.
          if (deal.cap_amount != null && accrued >= deal.cap_amount) {
            await supabaseAdmin.from('team_split_deals')
              .update({ status: 'completed', completed_at: nowIso }).eq('id', deal.id);
          }
        }

        // ---- refund clawbacks (Pitfall 10) ----
        clawbacksWritten += await applyClawbacks(deal, now);
      } catch (dealErr) {
        console.error('team-split accrual failed for deal', deal.id, dealErr);
      }
    }

    // AI Manager nudges (best-effort; never blocks accruals).
    const insightsWritten = await generateTeamSplitInsights(supabaseAdmin);

    return NextResponse.json({
      success: true,
      period: periodKey,
      dealsProcessed, dealsExpired, accrualsWritten, clawbacksWritten, insightsWritten,
    });
  } catch (e) {
    console.error('team-split-accruals cron error:', e);
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}

/**
 * For each refund earning tied to an original earning this deal already accrued,
 * write a proportional negative clawback (idempotent via unique(deal_id, earning_id)).
 */
async function applyClawbacks(deal: TeamSplitDeal, now: Date): Promise<number> {
  // Refund rows for this artist carry metadata.original_earning_id.
  const { data: refunds } = await supabaseAdmin
    .from('earnings')
    .select('id, net_amount, gross_amount, metadata')
    .eq('artist_id', deal.artist_id)
    .eq('type', 'refund');
  if (!refunds || refunds.length === 0) return 0;

  let written = 0;
  for (const r of refunds) {
    const originalId = (r.metadata as Record<string, unknown> | null)?.original_earning_id as string | undefined;
    if (!originalId) continue;

    // Did this deal accrue against that original earning?
    const { data: original } = await supabaseAdmin
      .from('team_split_earnings')
      .select('id, commission_amount, basis_amount')
      .eq('deal_id', deal.id)
      .eq('earning_id', originalId)
      .gt('commission_amount', 0)
      .maybeSingle();
    if (!original) continue;

    // Already clawed back for this refund row?
    const { data: existing } = await supabaseAdmin
      .from('team_split_earnings')
      .select('id')
      .eq('deal_id', deal.id)
      .eq('earning_id', r.id)
      .maybeSingle();
    if (existing) continue;

    const refundedBasis = Math.abs(deal.payout_basis === 'gross_revenue' ? r.gross_amount : r.net_amount);
    const ratio = original.basis_amount > 0 ? Math.min(1, refundedBasis / original.basis_amount) : 1;
    const clawback = -Math.round(original.commission_amount * ratio);
    if (clawback >= 0) continue;

    const { error } = await supabaseAdmin.from('team_split_earnings').insert({
      deal_id: deal.id,
      artist_id: deal.artist_id,
      collaborator_user_id: deal.collaborator_user_id,
      earning_id: r.id,
      source_type: deal.revenue_source_type,
      source_id: deal.revenue_source_id,
      basis: deal.payout_basis,
      basis_amount: -refundedBasis,
      percentage: deal.percentage,
      gross_amount: r.gross_amount,
      commission_amount: clawback,
      status: 'released',      // counts immediately against the balance
      cleared_at: now.toISOString(),
      released_at: now.toISOString(),
      reason: 'refund_clawback',
    });
    if (!error) written++;
  }
  return written;
}
