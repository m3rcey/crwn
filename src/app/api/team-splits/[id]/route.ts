import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getDealForUser, recordAudit, collaboratorBalance } from '@/lib/teamSplits/server';
import type { TeamSplitDeal } from '@/lib/teamSplits/types';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// GET /api/team-splits/:id -> full deal detail (scoped to the caller)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await getDealForUser(supabaseAdmin, id, user.id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { deal, isArtist, isCollaborator } = ctx;

  // Mark first collaborator view.
  if (isCollaborator && !deal.collaborator_viewed_at && ['sent'].includes(deal.status)) {
    await supabaseAdmin
      .from('team_split_deals')
      .update({ collaborator_viewed_at: new Date().toISOString(), status: deal.status === 'sent' ? 'viewed' : deal.status })
      .eq('id', id);
    await recordAudit(supabaseAdmin, id, user.id, 'viewed');
  }

  const [{ data: deliverables }, { data: versions }, { data: disputes }, { data: earnings }] = await Promise.all([
    supabaseAdmin.from('team_split_deliverables').select('*').eq('deal_id', id).order('created_at'),
    supabaseAdmin.from('team_split_deal_versions').select('*').eq('deal_id', id).order('version_number'),
    supabaseAdmin.from('team_split_disputes').select('*').eq('deal_id', id).order('created_at', { ascending: false }),
    supabaseAdmin.from('team_split_earnings').select('*').eq('deal_id', id).order('created_at', { ascending: false }).limit(200),
  ]);

  const balance = deal.collaborator_user_id
    ? await collaboratorBalance(supabaseAdmin, deal.collaborator_user_id, id)
    : { estimatedHeld: 0, available: 0, paid: 0, reversed: 0 };

  return NextResponse.json({
    deal, deliverables: deliverables || [], versions: versions || [],
    disputes: disputes || [], earnings: earnings || [], balance, isArtist, isCollaborator,
  });
}

// PATCH /api/team-splits/:id -> artist lifecycle actions
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await getDealForUser(supabaseAdmin, id, user.id);
  if (!ctx || !ctx.isArtist) return NextResponse.json({ error: 'Only the artist can manage this deal' }, { status: 403 });
  const deal = ctx.deal;

  const body = await req.json();
  const action: string = body.action;
  const now = new Date().toISOString();

  // Milestone bonus: artist confirms the milestone is reached -> one held accrual.
  if (action === 'award_milestone') {
    if (!deal.milestone_amount || deal.milestone_amount <= 0) {
      return NextResponse.json({ error: 'This deal has no milestone bonus.' }, { status: 400 });
    }
    if (!deal.collaborator_user_id) {
      return NextResponse.json({ error: 'The collaborator must accept before a bonus can be awarded.' }, { status: 400 });
    }
    const { data: existing } = await supabaseAdmin
      .from('team_split_earnings').select('id').eq('deal_id', id).eq('reason', 'milestone').maybeSingle();
    if (existing) return NextResponse.json({ error: 'The milestone bonus was already awarded.' }, { status: 400 });

    await supabaseAdmin.from('team_split_earnings').insert({
      deal_id: id,
      artist_id: deal.artist_id,
      collaborator_user_id: deal.collaborator_user_id,
      earning_id: null,
      source_type: deal.revenue_source_type,
      source_id: deal.revenue_source_id,
      basis: deal.payout_basis,
      basis_amount: deal.milestone_amount,
      percentage: null,
      gross_amount: deal.milestone_amount,
      commission_amount: deal.milestone_amount,
      status: 'held',
      cleared_at: new Date(Date.now() + (deal.hold_period_days || 7) * 86400000).toISOString(),
      reason: 'milestone',
    });
    await recordAudit(supabaseAdmin, id, user.id, 'milestone_awarded', { amount: deal.milestone_amount });
    return NextResponse.json({ ok: true, awarded: deal.milestone_amount });
  }

  let update: Partial<TeamSplitDeal> = {};
  const auditType = action;

  switch (action) {
    case 'pause':
      if (deal.status !== 'active') return NextResponse.json({ error: 'Only active deals can be paused.' }, { status: 400 });
      update = { status: 'paused', paused_at: now };
      break;
    case 'resume':
      if (deal.status !== 'paused') return NextResponse.json({ error: 'Only paused deals can be resumed.' }, { status: 400 });
      update = { status: 'active', paused_at: null };
      break;
    case 'terminate':
      if (['completed', 'terminated', 'cancelled', 'archived'].includes(deal.status))
        return NextResponse.json({ error: 'This deal is already closed.' }, { status: 400 });
      update = { status: 'terminated', terminated_at: now };
      break;
    case 'cancel':
      if (!['draft', 'sent', 'viewed', 'changes_requested'].includes(deal.status))
        return NextResponse.json({ error: 'Only a deal not yet active can be cancelled.' }, { status: 400 });
      update = { status: 'cancelled' };
      break;
    case 'archive':
      update = { status: 'archived' };
      break;
    case 'complete':
      update = { status: 'completed', completed_at: now };
      break;
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  await supabaseAdmin.from('team_split_deals').update(update).eq('id', id);
  await recordAudit(supabaseAdmin, id, user.id, auditType);
  return NextResponse.json({ ok: true, status: update.status });
}
