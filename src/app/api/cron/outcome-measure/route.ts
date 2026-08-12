import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { expireStallLocks } from '@/lib/ai/coordinationLock';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export const maxDuration = 60;

/**
 * Daily maintenance cron. The NAME is historical.
 *
 * It used to measure "outcomes" for Manager actions executed 7+ days ago: re-snapshot the artist,
 * diff against `baseline_metrics`, store `outcome_delta`, and let the next Manager run score it.
 * That layer was RETIRED on 2026-08-11 and nothing replaces it. Four reasons, in ascending order:
 *
 *  1. The snapshot self-derived MRR and zero-defaulted every field, so a failed query and an
 *     artist with no revenue produced the same row.
 *  2. The "7-day window" was a 7-day MINIMUM capped at 30 (`lte(7d)`, `gte(30d)`) and the elapsed
 *     time was never recorded, so deltas of different lengths were compared to each other.
 *  3. Measurement was per-ARTIST, not per-action: ONE snapshot was diffed against every pending
 *     action's baseline, so everything the account did that week was credited to all of them.
 *  4. The result was scored and fed back as "repeat what worked", which is the causal claim
 *     `constraint/recommendationOutcome.ts` forbids by name.
 *
 * Canonical recommendation-to-outcome evidence is Z3 (`constraint-outcomes` cron). Manager keeps
 * its ACTION TELEMETRY (what it did, when, result, status) and no longer scores itself.
 *
 * THE ROUTE IS NOT DELETED, and must not be: two live consumers that have nothing to do with
 * Manager measurement still run here, and one of them serves the ADMIN agent, not the artist one.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Clean up expired coordination locks. Shared infrastructure: `acquireLock` is called by BOTH
    // /api/ai-manager/execute and /api/admin/agent/execute, so this outlives Manager entirely.
    let expiredLocks = 0;
    try {
      expiredLocks = await expireStallLocks(supabaseAdmin);
    } catch (err) {
      console.error('Lock cleanup failed (non-fatal):', err);
    }

    // Piggyback: refresh the opportunity ledger so captured/remaining stay current for artists who
    // accrue revenue between build events (Vercel Hobby caps crons, so we ride this daily one).
    let opportunityArtists = 0;
    try {
      const { refreshAllOpportunities } = await import('@/lib/analytics/opportunityLedger');
      opportunityArtists = (await refreshAllOpportunities(supabaseAdmin)).artists;
    } catch (err) {
      console.error('Opportunity refresh failed (non-fatal):', err);
    }

    return NextResponse.json({
      // Explicit rather than absent, so an operator reading a cron log sees that the measurement
      // is gone on purpose instead of wondering why `measured` stopped appearing.
      managerOutcomeMeasurement: 'retired',
      expiredLocks,
      opportunityArtists,
    });
  } catch (error) {
    console.error('Maintenance cron error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
