import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export const maxDuration = 30;

/**
 * Daily agent health check — runs after all other crons to verify the swarm is healthy.
 *
 * Checks:
 * 1. AI manager ran today and processed artists
 * 2. Admin autonomous agent ran today
 * 3. Outcome measurement ran (if actions are pending measurement)
 * 4. No stuck coordination locks
 * 5. Agent action success rate
 * 6. Cross-artist pattern coverage
 *
 * Alerts admin if any check fails.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();
    const yesterdayIso = new Date(today.getTime() - 86400000).toISOString();

    const issues: { severity: 'critical' | 'warning' | 'info'; message: string }[] = [];
    const stats: Record<string, number | string> = {};

    // 1. Check AI manager runs today
    const { count: aiManagerRuns } = await supabaseAdmin
      .from('artist_agent_runs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayIso);

    stats.aiManagerRunsToday = aiManagerRuns || 0;
    if ((aiManagerRuns || 0) === 0) {
      // Check if it ran yesterday (maybe cron hasn't fired yet today)
      const { count: yesterdayRuns } = await supabaseAdmin
        .from('artist_agent_runs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', yesterdayIso)
        .lt('created_at', todayIso);

      if ((yesterdayRuns || 0) === 0) {
        issues.push({ severity: 'critical', message: 'AI Manager has not run in 24+ hours' });
      }
    }

    // 2. Check admin autonomous runs today
    const { count: adminRuns } = await supabaseAdmin
      .from('autonomous_run_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayIso);

    stats.adminRunsToday = adminRuns || 0;

    // 3. Check for actions awaiting measurement that are overdue
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
    const { count: overdueMeasurements } = await supabaseAdmin
      .from('artist_agent_actions')
      .select('id', { count: 'exact', head: true })
      .in('status', ['auto_executed', 'executed'])
      .not('baseline_metrics', 'is', null)
      .is('outcome_measured_at', null)
      .lt('executed_at', tenDaysAgo);

    stats.overdueMeasurements = overdueMeasurements || 0;
    if ((overdueMeasurements || 0) > 10) {
      issues.push({ severity: 'warning', message: `${overdueMeasurements} actions overdue for outcome measurement (10+ days)` });
    }

    // 4. Check for stuck coordination locks
    const { count: stuckLocks } = await supabaseAdmin
      .from('agent_coordination')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'running')
      .lt('expires_at', new Date().toISOString());

    stats.stuckLocks = stuckLocks || 0;
    if ((stuckLocks || 0) > 0) {
      issues.push({ severity: 'warning', message: `${stuckLocks} stuck coordination lock(s) — will be cleaned up by outcome-measure cron` });
    }

    // 5. Agent action success rate (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count: totalActions } = await supabaseAdmin
      .from('artist_agent_actions')
      .select('id', { count: 'exact', head: true })
      .in('status', ['auto_executed', 'executed', 'failed'])
      .gte('created_at', sevenDaysAgo);

    const { count: failedActions } = await supabaseAdmin
      .from('artist_agent_actions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', sevenDaysAgo);

    const total = totalActions || 0;
    const failed = failedActions || 0;
    const successRate = total > 0 ? Math.round(((total - failed) / total) * 100) : 100;
    stats.actionSuccessRate7d = `${successRate}%`;
    stats.totalActions7d = total;
    stats.failedActions7d = failed;

    if (successRate < 80 && total >= 5) {
      issues.push({ severity: 'warning', message: `Agent action success rate is ${successRate}% (${failed}/${total} failed in 7 days)` });
    }

    // 6. Pending actions awaiting artist approval
    const { count: pendingActions } = await supabaseAdmin
      .from('artist_agent_actions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    stats.pendingActions = pendingActions || 0;
    if ((pendingActions || 0) > 20) {
      issues.push({ severity: 'info', message: `${pendingActions} actions pending artist approval — artists may not be checking` });
    }

    // 7. Cross-artist pattern coverage
    const { count: measuredOutcomes } = await supabaseAdmin
      .from('artist_agent_actions')
      .select('id', { count: 'exact', head: true })
      .not('outcome_measured_at', 'is', null)
      .gte('executed_at', new Date(Date.now() - 90 * 86400000).toISOString());

    stats.measuredOutcomes90d = measuredOutcomes || 0;
    if ((measuredOutcomes || 0) < 5) {
      issues.push({ severity: 'info', message: `Only ${measuredOutcomes} measured outcomes in 90 days — cross-artist intelligence needs more data` });
    }

    // Determine overall health
    const hasCritical = issues.some(i => i.severity === 'critical');
    const hasWarning = issues.some(i => i.severity === 'warning');
    const health = hasCritical ? 'broken' : hasWarning ? 'degraded' : 'healthy';
    stats.health = health;

    // Alert admin if issues found
    if (hasCritical || hasWarning) {
      const { data: admin } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .limit(1)
        .single();

      if (admin) {
        const issueList = issues
          .filter(i => i.severity !== 'info')
          .map(i => `[${i.severity.toUpperCase()}] ${i.message}`)
          .join('\n');

        await createNotification(
          supabaseAdmin,
          admin.id,
          'system',
          `Agent Swarm: ${health}`,
          issueList,
          '/admin'
        );
      }
    }

    return NextResponse.json({
      health,
      stats,
      issues,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Agent health check error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
