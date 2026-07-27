import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Admin read-only rollup of the prospect (pre-signup) nurture funnel. Server-side admin auth,
// service-role reads. No mutation here: pausing/removing an enrollment is a separate action route
// if needed later; this is the inspection surface the spec asks for.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin' ? user : null;
}

async function count(table: string, build: (q: any) => any): Promise<number> {
  const { count: c } = await build(supabaseAdmin.from(table).select('*', { count: 'exact', head: true }));
  return c || 0;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  // Enrollment rows (capped). Early-stage volume; aggregate in JS for a clear rollup.
  const { data: rows } = await supabaseAdmin
    .from('prospect_nurture_enrollments')
    .select('id, email, tool_slug, phase, status, current_step, exit_reason, created_at, last_sent_at, next_send_at')
    .order('created_at', { ascending: false })
    .limit(2000);

  const enrollments = rows || [];
  const byStatus: Record<string, number> = {};
  const byTool: Record<string, number> = {};
  const byPhase: Record<string, number> = {};
  const byExit: Record<string, number> = {};
  for (const e of enrollments) {
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    byTool[e.tool_slug] = (byTool[e.tool_slug] || 0) + 1;
    if (e.status === 'active' && e.phase) byPhase[e.phase] = (byPhase[e.phase] || 0) + 1;
    if (e.exit_reason) byExit[e.exit_reason] = (byExit[e.exit_reason] || 0) + 1;
  }

  const [totalSent, opened, clicked, bounced] = await Promise.all([
    count('prospect_nurture_sends', (q) => q),
    count('prospect_nurture_sends', (q) => q.not('opened_at', 'is', null)),
    count('prospect_nurture_sends', (q) => q.not('clicked_at', 'is', null)),
    count('prospect_nurture_sends', (q) => q.eq('status', 'bounced')),
  ]);

  // Conversions attributed to nurture: enrollments that exited because an account was created.
  const converted = byExit['account_created'] || 0;

  return NextResponse.json({
    totals: {
      enrollments: enrollments.length,
      active: byStatus['active'] || 0,
      completed: byStatus['completed'] || 0,
      canceled: byStatus['canceled'] || 0,
      converted,
    },
    sends: { totalSent, opened, clicked, bounced },
    byTool,
    byPhase,
    byExit,
    recent: enrollments.slice(0, 25).map((e) => ({
      id: e.id,
      // Never leak a full email in the admin list; mask the local part.
      email: maskEmail(e.email),
      tool_slug: e.tool_slug,
      phase: e.phase,
      status: e.status,
      step: e.current_step,
      exit_reason: e.exit_reason,
      created_at: e.created_at,
      last_sent_at: e.last_sent_at,
      next_send_at: e.next_send_at,
    })),
    sequenceVersion: 1,
  });
}

function maskEmail(email: string): string {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return '***';
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}
