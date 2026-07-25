// Opportunity recompute: read an artist's calculator reveals and their real revenue, and upsert
// the current month's opportunity_ledger rows (one per feature). Fail-safe: analytics never breaks
// the flow it measures, so a missing table or any error is swallowed.
//
// Accuracy rules (see opportunity.ts for the arithmetic):
//   revealed  = MAX monthly estimate across the artist's calculators for the feature (dedup)
//   captured  = this month's real net revenue for the feature, refunds netted back by payment id
//   activated = the feature actually exists (a live tier / a live session / referral turned on)
//   remaining = max(0, revealed - captured)

import type { Db } from '@/lib/leadResults/handoffSeed';
import { getClaimedResults } from '@/lib/leadResults/handoffSeed';
import { monthlyCentsOf } from '@/lib/leadResults/leadMagnetMissions';
import {
  revealedByFeature,
  buildOpportunityRow,
  capturedFromEarnings,
  type Reveal,
  type OpportunityFeature,
  type Period,
  type EarningRow,
  EARNING_TYPE_TO_FEATURE,
} from './opportunity';

function monthBounds(p: Period): { start: string; end: string } {
  const start = new Date(Date.UTC(p.year, p.month - 1, 1));
  const end = new Date(Date.UTC(p.year, p.month, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function periodOf(d: Date): Period {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** This month's captured net revenue per feature, refunds netted. */
async function capturedByFeature(
  db: Db,
  artistId: string,
  start: string,
  end: string,
): Promise<Record<OpportunityFeature, number>> {
  const result: Record<OpportunityFeature, number> = { membership: 0, live: 0, referral: 0 };

  // membership + live from the unified earnings ledger (net_amount is already fee-netted).
  try {
    const { data } = await db
      .from('earnings')
      .select('type, net_amount, stripe_payment_id')
      .eq('artist_id', artistId)
      .gte('created_at', start)
      .lt('created_at', end);
    const rows = (data ?? []) as EarningRow[];
    const { captured, unresolvedRefunds } = capturedFromEarnings(rows);
    result.membership += captured.membership;
    result.live += captured.live;

    // Refund rows whose original earning is not in this month's batch: resolve their original type
    // with ONE lookup and net them onto the right feature.
    if (unresolvedRefunds.length) {
      const bases = [...new Set(unresolvedRefunds.map((u) => u.base))];
      const { data: origs } = await db
        .from('earnings')
        .select('stripe_payment_id, type')
        .in('stripe_payment_id', bases);
      const typeByPi = new Map<string, string>(
        (origs ?? []).map((o: { stripe_payment_id: string; type: string }) => [o.stripe_payment_id, o.type]),
      );
      for (const u of unresolvedRefunds) {
        const f = EARNING_TYPE_TO_FEATURE[typeByPi.get(u.base) ?? ''];
        if (f) result[f] += u.amount;
      }
    }
  } catch {
    /* earnings unavailable -> captured stays 0 for these features */
  }

  // referral from its own ledger (disjoint from earnings; the realized referral throughput).
  try {
    const { data } = await db
      .from('referral_earnings')
      .select('commission_amount')
      .eq('artist_id', artistId)
      .gte('created_at', start)
      .lt('created_at', end);
    result.referral += (data ?? []).reduce(
      (s: number, r: { commission_amount: number }) => s + (Number(r.commission_amount) || 0),
      0,
    );
  } catch {
    /* referral ledger unavailable -> referral captured stays 0 */
  }

  return {
    membership: Math.max(0, result.membership),
    live: Math.max(0, result.live),
    referral: Math.max(0, result.referral),
  };
}

/** Whether each feature is actually built (the Activated signal, read from real state not a flag). */
async function activatedByFeature(db: Db, artistId: string): Promise<Record<OpportunityFeature, boolean>> {
  const activated: Record<OpportunityFeature, boolean> = { membership: false, live: false, referral: false };
  try {
    const [tiers, lives, artist] = await Promise.all([
      db.from('subscription_tiers').select('id', { count: 'exact', head: true }).eq('artist_id', artistId).eq('is_active', true),
      db.from('live_sessions').select('id', { count: 'exact', head: true }).eq('artist_id', artistId),
      db.from('artist_profiles').select('referral_commission_rate').eq('id', artistId).maybeSingle(),
    ]);
    activated.membership = (tiers.count ?? 0) > 0;
    activated.live = (lives.count ?? 0) > 0;
    activated.referral = Number(artist.data?.referral_commission_rate ?? 0) > 0;
  } catch {
    /* leave all false */
  }
  return activated;
}

/**
 * Recompute and upsert an artist's opportunity ledger for the current month. Idempotent: the unique
 * (artist, feature, year, month) key means re-running only updates the current month's rows, never
 * adds duplicates. Returns how many rows were written.
 */
export async function recomputeArtistOpportunity(
  db: Db,
  artistId: string,
  nowIso?: string,
): Promise<{ updated: number }> {
  try {
    const seeds = await getClaimedResults(db, { artistId });
    const reveals: Reveal[] = seeds
      .map((s) => ({ calculator: s.toolSlug, monthlyCents: monthlyCentsOf(s) ?? 0, revealedAt: s.createdAt }))
      .filter((r) => r.monthlyCents > 0);

    const featureReveals = revealedByFeature(reveals);
    if (featureReveals.length === 0) return { updated: 0 };

    const now = nowIso ? new Date(nowIso) : new Date();
    const period = periodOf(now);
    const { start, end } = monthBounds(period);

    const captured = await capturedByFeature(db, artistId, start, end);
    const activated = await activatedByFeature(db, artistId);

    let updated = 0;
    for (const fr of featureReveals) {
      const row = buildOpportunityRow(fr, captured[fr.feature], activated[fr.feature], period);
      const { error } = await db.from('opportunity_ledger').upsert(
        {
          artist_id: artistId,
          feature: row.feature,
          calculator: row.calculator,
          revealed_cents: row.revealedCents,
          captured_cents: row.capturedCents,
          remaining_cents: row.remainingCents,
          activated: row.activated,
          activated_at: row.activated ? now.toISOString() : null,
          revealed_at: row.revealedAt,
          period_month: row.periodMonth,
          period_year: row.periodYear,
          last_recomputed_at: now.toISOString(),
        },
        { onConflict: 'artist_id,feature,period_year,period_month' },
      );
      if (!error) updated++;
    }
    return { updated };
  } catch {
    return { updated: 0 };
  }
}

/**
 * Refresh the opportunity ledger for every artist who has completed a calculator. Used by the daily
 * piggybacked cron so captured stays current for artists who accrue revenue between build events.
 * Fail-safe and bounded; returns how many artists were recomputed.
 */
export async function refreshAllOpportunities(db: Db, opts?: { limit?: number }): Promise<{ artists: number }> {
  try {
    // Only artists who actually revealed an opportunity (have a claimed result tied to an artist).
    const { data } = await db
      .from('lead_magnet_results')
      .select('artist_id')
      .not('artist_id', 'is', null)
      .limit(opts?.limit ?? 5000);
    const artistIds = [...new Set((data ?? []).map((r: { artist_id: string }) => r.artist_id).filter(Boolean))];
    for (const artistId of artistIds) {
      await recomputeArtistOpportunity(db, String(artistId));
    }
    return { artists: artistIds.length };
  } catch {
    return { artists: 0 };
  }
}
