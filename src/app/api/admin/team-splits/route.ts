import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@supabase/supabase-js';
import { recordAudit } from '@/lib/teamSplits/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// GET /api/admin/team-splits?filter=high_risk|disputed|all
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const filter = req.nextUrl.searchParams.get('filter') || 'high_risk';
  let q = supabaseAdmin.from('team_split_deals').select('*').order('created_at', { ascending: false }).limit(200);
  if (filter === 'high_risk') q = q.eq('is_high_risk', true);
  if (filter === 'disputed') q = q.eq('status', 'disputed');
  const { data: deals } = await q;

  const { data: openDisputes } = await supabaseAdmin
    .from('team_split_disputes')
    .select('*')
    .in('status', ['open', 'under_review', 'escalated'])
    .order('created_at', { ascending: false });

  return NextResponse.json({ deals: deals || [], disputes: openDisputes || [] });
}

// PATCH /api/admin/team-splits  { action, dealId?, disputeId?, resolution?, status? }
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const now = new Date().toISOString();

  if (body.action === 'resolve_dispute' && body.disputeId) {
    await supabaseAdmin.from('team_split_disputes').update({
      status: body.status || 'resolved',
      resolution: body.resolution || null,
      resolved_by: admin.id,
      resolved_at: now,
      updated_at: now,
    }).eq('id', body.disputeId);

    // Optionally un-freeze the deal.
    if (body.dealId && body.reactivate) {
      await supabaseAdmin.from('team_split_deals').update({ status: 'active' }).eq('id', body.dealId).eq('status', 'disputed');
      await recordAudit(supabaseAdmin, body.dealId, admin.id, 'dispute_resolved', { resolution: body.resolution });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'clear_flag' && body.dealId) {
    await supabaseAdmin.from('team_split_deals').update({ is_high_risk: false }).eq('id', body.dealId);
    await recordAudit(supabaseAdmin, body.dealId, admin.id, 'risk_flag_cleared');
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'terminate' && body.dealId) {
    await supabaseAdmin.from('team_split_deals').update({ status: 'terminated', terminated_at: now }).eq('id', body.dealId);
    await recordAudit(supabaseAdmin, body.dealId, admin.id, 'admin_terminated');
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
