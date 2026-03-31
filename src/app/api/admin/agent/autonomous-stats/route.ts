import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  // Verify admin
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    // Get total autonomous runs
    const { count: totalRuns } = await supabaseAdmin
      .from('autonomous_run_log')
      .select('id', { count: 'exact', head: true });

    // Get total auto-executed actions
    const { data: runStats } = await supabaseAdmin
      .from('autonomous_run_log')
      .select('actions_auto_executed, actions_escalated');

    const totalActionsExecuted = (runStats || []).reduce((s, r) => s + (r.actions_auto_executed || 0), 0);
    const totalEscalated = (runStats || []).reduce((s, r) => s + (r.actions_escalated || 0), 0);

    // Get last run time
    const { data: lastRun } = await supabaseAdmin
      .from('autonomous_run_log')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get recent runs for the log (last 20)
    const { data: recentRuns } = await supabaseAdmin
      .from('autonomous_run_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    // Get weekly trend data (runs per week for last 8 weeks)
    const { data: allRuns } = await supabaseAdmin
      .from('autonomous_run_log')
      .select('created_at, actions_auto_executed, severity')
      .order('created_at', { ascending: true });

    // Group into weeks for sparkline
    const weeklyData: { week: string; runs: number; fixes: number }[] = [];
    if (allRuns && allRuns.length > 0) {
      const weekMap = new Map<string, { runs: number; fixes: number }>();
      for (const run of allRuns) {
        const d = new Date(run.created_at);
        // Get start of week (Monday)
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(d.setDate(diff));
        const key = weekStart.toISOString().split('T')[0];
        const existing = weekMap.get(key) || { runs: 0, fixes: 0 };
        existing.runs++;
        existing.fixes += run.actions_auto_executed || 0;
        weekMap.set(key, existing);
      }
      // Last 8 weeks
      const sorted = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (const [week, data] of sorted.slice(-8)) {
        weeklyData.push({ week, ...data });
      }
    }

    return NextResponse.json({
      totalRuns: totalRuns || 0,
      totalActionsExecuted,
      totalEscalated,
      lastRunAt: lastRun?.created_at || null,
      recentRuns: recentRuns || [],
      weeklyData,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Autonomous stats error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
