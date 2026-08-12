// GET /api/admin/manager-ops — operational truth about the ARTIST-FACING Manager.
//
// ADMIN ONLY, and read-only. There is no POST. Nothing on this path can approve, execute,
// unexpire, re-prioritise or reactivate anything: it is an instrument, not a cockpit.
//
// SCOPE, and the distinction that matters most here: this reports the **artist Manager**
// (`artist_agent_actions` / `artist_agent_runs` / `ai_insights`). It is NOT CRWN's own internal
// business agent (the admin agent routes, `autonomous_run_log`, AgentInsights, AutonomousOpsBar),
// which diagnoses the PLATFORM funnel and has nothing to do with any artist's account. Two different
// agents, two different subjects; merging them would be the same "which subsystem do I believe"
// problem the One Operating Flow removed on the artist side.
//
// Every read is capped, aggregated, and fail-safe: a missing table yields an empty section rather
// than a 500, because an observability page that dies is worse than one that says "no data".

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { staleBefore } from '@/lib/ai/actionValidity';
import {
  deriveCronState,
  summarizeActions,
  approvalFacts,
  classifyFailure,
  lastMeaningfulActivity,
  type ActionRow,
} from '@/lib/admin/managerOps';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ROW_CAP = 500;

/** Artists are identified by SLUG, which is already public. Never display_name or email. */
async function slugMap(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  try {
    const { data } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, slug')
      .in('id', ids.slice(0, 200));
    const m: Record<string, string> = {};
    for (const r of data ?? []) m[r.id] = r.slug ?? '(no slug)';
    return m;
  } catch {
    return {};
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const now = new Date();
  const cutoff = staleBefore(now);

  // ---- Actions -------------------------------------------------------------
  // NOTE the explicit column list. `select('*')` would drag the retired `outcome_delta` /
  // `outcome_metrics` / `baseline_metrics` columns into an admin payload, and the fact that they
  // still physically exist is not permission to ship them anywhere.
  let actionRows: (ActionRow & { artist_id: string; action_label: string })[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('artist_agent_actions')
      .select('artist_id, action_type, action_label, risk, status, result_message, created_at, executed_at, reviewed_at')
      .order('created_at', { ascending: false })
      .limit(ROW_CAP);
    actionRows = (data ?? []) as typeof actionRows;
  } catch {
    actionRows = [];
  }

  const summary = summarizeActions(actionRows, cutoff, now);
  const approvals = approvalFacts(summary);

  // ---- Runs ----------------------------------------------------------------
  let runs: { created_at: string; severity: string | null; actions_recommended: number | null; actions_auto_executed: number | null; actions_escalated: number | null; outcome: string | null }[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('artist_agent_runs')
      .select('created_at, severity, actions_recommended, actions_auto_executed, actions_escalated, outcome')
      .order('created_at', { ascending: false })
      .limit(10);
    runs = data ?? [];
  } catch {
    runs = [];
  }

  // ---- Insights (counts + shape only, never the generated body) ------------
  let insightTotal = 0;
  let insightActive = 0;
  const insightsByType: Record<string, number> = {};
  let lastInsightAt: string | null = null;
  try {
    const { data } = await supabaseAdmin
      .from('ai_insights')
      .select('type, created_at, expires_at, is_dismissed')
      .order('created_at', { ascending: false })
      .limit(ROW_CAP);
    const nowIso = now.toISOString();
    for (const i of data ?? []) {
      insightTotal++;
      insightsByType[i.type] = (insightsByType[i.type] || 0) + 1;
      if (!i.is_dismissed && (i.expires_at ?? '') > nowIso) insightActive++;
      if (lastInsightAt === null || i.created_at > lastInsightAt) lastInsightAt = i.created_at;
    }
  } catch {
    // leave zeroed
  }

  // ---- Scheduled-generation liveness --------------------------------------
  // Read from the heartbeat the cron writes, and shown VERBATIM. The heartbeat's own detail string
  // is what distinguishes "ran and had nothing to do" from "ran and worked", which is exactly the
  // distinction the four-month outage needed and did not have.
  let heartbeat: { detail: string | null; created_at: string } | null = null;
  try {
    const { data } = await supabaseAdmin
      .from('cron_heartbeat')
      .select('detail, created_at')
      .eq('job', 'ai-manager')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    heartbeat = data ?? null;
  } catch {
    heartbeat = null;
  }

  // ---- Recent activity table ----------------------------------------------
  const recent = actionRows.slice(0, 25);
  const slugs = await slugMap([...new Set(recent.map((r) => r.artist_id))]);
  const recentActions = recent.map((r) => ({
    artist: slugs[r.artist_id] ?? '(unknown)',
    type: r.action_type,
    label: r.action_label,
    risk: r.risk ?? 'unknown',
    status: r.status,
    createdAt: r.created_at,
    ageDays: Math.floor((now.getTime() - new Date(r.created_at).getTime()) / 86400000),
    expired: r.status === 'pending' && r.created_at < cutoff,
    executedAt: r.executed_at,
    failureKind: r.status === 'failed' ? classifyFailure(r.result_message) : null,
    // The raw message is operationally useful and is CRWN's own text, not model output or a secret.
    resultMessage: r.result_message,
  }));

  return NextResponse.json({
    generatedAt: now.toISOString(),
    validityCutoff: cutoff,
    status: {
      // The artist-triggered path has no schedule and no gate beyond ownership; it runs when an
      // artist asks. Reported as availability, not as a health verdict CRWN cannot measure.
      artistRequested: 'available',
      // Founder decision 2026-08-11. Deliberately NOT an error state.
      scheduledAutonomy: 'dormant_by_decision',
      cronState: deriveCronState(heartbeat, now),
      heartbeat,
      lastMeaningfulActivity: lastMeaningfulActivity([
        lastInsightAt,
        actionRows[0]?.created_at ?? null,
        runs[0]?.created_at ?? null,
      ]),
    },
    actions: summary,
    approvals,
    insights: { total: insightTotal, active: insightActive, byType: insightsByType, lastAt: lastInsightAt },
    runs,
    recentActions,
  });
}
