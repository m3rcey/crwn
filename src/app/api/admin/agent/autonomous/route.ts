import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export const maxDuration = 60;

// Scopes to cycle through on autonomous runs
const AUTO_SCOPES = ['dashboard', 'pipeline', 'funnel', 'sequences', 'email'];

// Only auto-execute LOW risk actions from these safe types
const SAFE_ACTION_TYPES = [
  'add_pipeline_note',
  'flag_at_risk',
  'enroll_in_sequence',
  'toggle_sequence',
  'cancel_stale_enrollments',
];

export async function POST(req: NextRequest) {
  // Verify cron secret (called from briefing cron or directly)
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get admin user ID for action logging
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();

    if (!adminProfile) {
      return NextResponse.json({ error: 'No admin user found' }, { status: 400 });
    }

    const adminId = adminProfile.id;
    const results: { scope: string; success: boolean; actionsExecuted: number; actionsEscalated: number; summary: string }[] = [];

    // Pick one scope per run to stay within timeout
    // Rotate based on day of month
    const scopeIndex = new Date().getDate() % AUTO_SCOPES.length;
    const scope = AUTO_SCOPES[scopeIndex];

    // Call the analyze endpoint internally
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const analyzeRes = await fetch(`${baseUrl}/api/admin/agent/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: adminId, scope }),
    });

    if (!analyzeRes.ok) {
      const errText = await analyzeRes.text();
      console.error(`Autonomous analyze failed for ${scope}:`, errText);
      // Log the failed run
      await supabaseAdmin.from('autonomous_run_log').insert({
        scope,
        diagnosis_summary: `Analysis failed: ${errText.slice(0, 200)}`,
        severity: 'info',
        actions_recommended: 0,
        actions_auto_executed: 0,
        actions_escalated: 0,
        outcome: 'Analysis failed',
      });
      return NextResponse.json({ error: 'Analyze failed', scope }, { status: 502 });
    }

    const { diagnosis, actions } = await analyzeRes.json();

    let actionsExecuted = 0;
    let actionsEscalated = 0;
    const executedLabels: string[] = [];

    // Auto-execute LOW risk safe actions, escalate the rest
    for (const action of actions || []) {
      if (action.risk === 'low' && SAFE_ACTION_TYPES.includes(action.type)) {
        // Auto-execute
        try {
          const execRes = await fetch(`${baseUrl}/api/admin/agent/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: adminId, action }),
          });

          if (execRes.ok) {
            // Log as autonomous
            await supabaseAdmin.from('agent_action_log').insert({
              admin_id: adminId,
              action_type: action.type,
              action_label: action.label,
              action_params: action.params,
              result: 'success',
              result_message: `Auto-executed by autonomous agent`,
              is_autonomous: true,
              scope,
              diagnosis_summary: diagnosis?.bottleneck || null,
            });
            actionsExecuted++;
            executedLabels.push(action.label);
          } else {
            actionsEscalated++;
          }
        } catch {
          actionsEscalated++;
        }
      } else {
        // Medium/high risk — escalate (just log, don't execute)
        actionsEscalated++;
      }
    }

    const outcome = actionsExecuted > 0
      ? `Auto-executed: ${executedLabels.join('; ')}`
      : diagnosis?.severity === 'info'
        ? 'No issues requiring action'
        : `${actionsEscalated} action(s) escalated for admin review`;

    // Log the autonomous run
    await supabaseAdmin.from('autonomous_run_log').insert({
      scope,
      diagnosis_summary: diagnosis?.bottleneck || 'No issues found',
      severity: diagnosis?.severity || 'info',
      actions_recommended: (actions || []).length,
      actions_auto_executed: actionsExecuted,
      actions_escalated: actionsEscalated,
      outcome,
    });

    results.push({
      scope,
      success: true,
      actionsExecuted,
      actionsEscalated,
      summary: diagnosis?.bottleneck || 'No issues found',
    });

    return NextResponse.json({
      success: true,
      results,
      totalExecuted: actionsExecuted,
      totalEscalated: actionsEscalated,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Autonomous agent error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
