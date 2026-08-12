import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getQualifyingEarnings, splitAmountForEarning, applyCap } from '@/lib/teamSplits/allocation';
import { fundedReserveFor, accruableAmount, withinFundingBoundary } from '@/lib/teamSplits/funding';
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
  // Earnings that qualified on the split math but carried no funded reserve.
  // A non-zero value here is NOT an error: it is the guard refusing to promise
  // money nobody withheld. It is surfaced so a silent zero-accrual state is
  // visible rather than looking like "no sales".
  let unfundedSkipped = 0;

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
            const capped = applyCap(rawAmount, accrued, deal.cap_amount);
            if (capped <= 0) {
              if (deal.cap_amount != null && accrued >= deal.cap_amount) break; // cap reached
              continue;
            }

            // ---- THE FUNDING GUARD (ratified 2026-08-12) ----
            // A collaborator payable balance may exist ONLY where the money was
            // actually withheld. This loop used to insert a `held` row straight
            // from the split math, which is "accrue first and hope the funds
            // exist later" and is exactly how the platform ended up paying
            // collaborators out of its own Stripe balance.
            //
            // Three ratified rules collapse into this one check, because an
            // earning only carries a reserve if CRWN withheld one at settlement:
            //   * an earning predating the deal has none, so nothing accrues;
            //   * a renewal CRWN could not amend in time has none, so nothing
            //     accrues;
            //   * nothing can accrue beyond what was withheld.
            // The failure mode is "owed nothing", never "owed money nobody funded".
            if (!withinFundingBoundary(e.created_at, (deal as unknown as { starts_at?: string | null }).starts_at ?? deal.created_at)) {
              unfundedSkipped++;
              continue;
            }
            const funded = fundedReserveFor(
              (e as unknown as { metadata?: unknown }).metadata,
              deal.id,
            );
            const amount = accruableAmount(capped, funded);
            if (amount <= 0) {
              unfundedSkipped++;
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
      // Surfaced deliberately. If accrualsWritten is 0 and this is non-zero, the
      // guard is refusing to promise money nobody withheld, which reads very
      // differently from "there were no sales" and should not look the same.
      unfundedSkipped,
    });
  } catch (e) {
    console.error('team-split-accruals cron error:', e);
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}

/**
 * For each refund earning tied to an original earning this deal already accrued,
 * write a proportional negative clawback (idempotent via unique(deal_id, earning_id)).
 *
 * F-19 (audit 2026-08-12): this scan is O(refunds x deals) per day and re-reads every refund
 * row for the artist on every deal. DEFERRED with evidence: production measured on 2026-08-12
 * held 0 refund earnings, 0 active deals and 0 team_split_earnings rows, so bounding it now
 * would trade audited correctness for a performance win nobody can feel. When refund volume
 * becomes real, bound by a created_at horizon WITHOUT changing accounting completeness (a
 * refund must never escape clawback by being older than the horizon; anchor on the deal's
 * last-clawback watermark, not a fixed window).
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
