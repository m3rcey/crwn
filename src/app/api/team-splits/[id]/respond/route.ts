import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getDealForUser, recordAudit, recordVersion } from '@/lib/teamSplits/server';
import { notifyArtistResponse } from '@/lib/teamSplits/notify';
import { TEAM_SPLIT_AGREEMENT_VERSION } from '@/lib/teamSplits/disclaimer';
import type { TeamSplitDeal } from '@/lib/teamSplits/types';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// POST /api/team-splits/:id/respond  { action: accept|reject|request_changes, note?, agreementAccepted? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await getDealForUser(supabaseAdmin, id, user.id);
  if (!ctx || !ctx.isCollaborator) return NextResponse.json({ error: 'Only the collaborator can respond' }, { status: 403 });
  const deal = ctx.deal;

  if (!['sent', 'viewed', 'changes_requested'].includes(deal.status)) {
    return NextResponse.json({ error: 'This deal can no longer be responded to.' }, { status: 400 });
  }

  const body = await req.json();
  const action: string = body.action;
  const now = new Date().toISOString();

  // artist user id for notifications
  const { data: artistProfile } = await supabaseAdmin
    .from('artist_profiles').select('user_id').eq('id', deal.artist_id).maybeSingle();
  const artistUserId = artistProfile?.user_id;
  const { data: me } = await supabaseAdmin.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  const myName = deal.collaborator_name || me?.display_name || 'Your collaborator';

  if (action === 'accept') {
    if (!body.agreementAccepted) {
      return NextResponse.json({ error: 'You must accept the terms to accept this deal.' }, { status: 400 });
    }
    // Set the activation window. On-accept deals go active now; others wait.
    const goActive = deal.start_trigger === 'on_accept';
    const startsAt = deal.starts_at || (goActive ? now : null);
    let endsAt = deal.ends_at;
    if (!endsAt && deal.duration_days && startsAt) {
      endsAt = new Date(new Date(startsAt).getTime() + deal.duration_days * 86400000).toISOString();
    }
    const update: Partial<TeamSplitDeal> = {
      status: goActive ? 'active' : 'accepted',
      collaborator_accepted_at: now,
      accepted_at: now,
      agreement_version: TEAM_SPLIT_AGREEMENT_VERSION,
      starts_at: startsAt,
      ends_at: endsAt,
    };
    await supabaseAdmin.from('team_split_deals').update(update).eq('id', id);
    await recordVersion(supabaseAdmin, { ...deal, ...update } as TeamSplitDeal, user.id, 'accepted', 'Collaborator accepted');
    await recordAudit(supabaseAdmin, id, user.id, 'accepted', { agreement_version: TEAM_SPLIT_AGREEMENT_VERSION });
    if (artistUserId) await notifyArtistResponse(supabaseAdmin, { artistUserId, collaboratorName: myName, dealTitle: deal.title, action: 'accepted', dealId: id });
    return NextResponse.json({ ok: true, status: update.status });
  }

  if (action === 'reject') {
    await supabaseAdmin.from('team_split_deals').update({ status: 'cancelled', rejected_at: now }).eq('id', id);
    await recordAudit(supabaseAdmin, id, user.id, 'rejected', { note: body.note || null });
    if (artistUserId) await notifyArtistResponse(supabaseAdmin, { artistUserId, collaboratorName: myName, dealTitle: deal.title, action: 'rejected', dealId: id });
    return NextResponse.json({ ok: true, status: 'cancelled' });
  }

  if (action === 'request_changes') {
    await supabaseAdmin.from('team_split_deals').update({ status: 'changes_requested', changes_requested_at: now }).eq('id', id);
    await recordAudit(supabaseAdmin, id, user.id, 'change_request', { note: body.note || null });
    if (artistUserId) await notifyArtistResponse(supabaseAdmin, { artistUserId, collaboratorName: myName, dealTitle: deal.title, action: 'requested changes', dealId: id });
    return NextResponse.json({ ok: true, status: 'changes_requested' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
