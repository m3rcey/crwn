import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { snapshotArtistMetrics, computeOutcomeDelta, MetricSnapshot } from '@/lib/ai/snapshotMetrics';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export const maxDuration = 60;

/**
 * Daily cron: measures outcomes for agent actions executed 7+ days ago.
 * Compares baseline_metrics (snapshot at execution) with current metrics
 * to determine whether the action had a positive or negative effect.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    // Also cap at 30 days old to avoid measuring very stale actions
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    // Find executed actions that:
    // 1. Were executed 7+ days ago
    // 2. Have baseline_metrics (snapshot was captured)
    // 3. Haven't been measured yet
    const { data: actions } = await supabaseAdmin
      .from('artist_agent_actions')
      .select('id, artist_id, action_type, baseline_metrics')
      .in('status', ['auto_executed', 'executed'])
      .not('baseline_metrics', 'is', null)
      .is('outcome_measured_at', null)
      .lte('executed_at', sevenDaysAgo)
      .gte('executed_at', thirtyDaysAgo)
      .order('executed_at', { ascending: true })
      .limit(50); // Process up to 50 per run

    if (!actions || actions.length === 0) {
      return NextResponse.json({ message: 'No actions to measure', measured: 0 });
    }

    // Group by artist to avoid duplicate snapshots
    const artistActions: Record<string, typeof actions> = {};
    for (const action of actions) {
      if (!artistActions[action.artist_id]) {
        artistActions[action.artist_id] = [];
      }
      artistActions[action.artist_id].push(action);
    }

    let measured = 0;
    let failed = 0;

    for (const [artistId, artistActionList] of Object.entries(artistActions)) {
      try {
        // One snapshot per artist (all their actions get the same "after" measurement)
        const outcome = await snapshotArtistMetrics(supabaseAdmin, artistId);
        const now = new Date().toISOString();

        for (const action of artistActionList) {
          try {
            const baseline = action.baseline_metrics as MetricSnapshot;
            const delta = computeOutcomeDelta(baseline, outcome);

            await supabaseAdmin
              .from('artist_agent_actions')
              .update({
                outcome_metrics: outcome,
                outcome_delta: delta,
                outcome_measured_at: now,
              })
              .eq('id', action.id);

            measured++;
          } catch (err) {
            console.error(`Failed to measure action ${action.id}:`, err);
            failed++;
          }
        }
      } catch (err) {
        console.error(`Failed to snapshot artist ${artistId}:`, err);
        failed += artistActionList.length;
      }
    }

    return NextResponse.json({
      measured,
      failed,
      artists: Object.keys(artistActions).length,
    });
  } catch (error) {
    console.error('Outcome measurement cron error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
