import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getDealForUser, recordAudit } from '@/lib/teamSplits/server';
import { notifyDeliverableSubmitted, notifyDeliverableDecision } from '@/lib/teamSplits/notify';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// PATCH /api/team-splits/:id/deliverables/:deliverableId
//   collaborator: { action: 'submit', fileUrl?, externalLink?, note? }
//   artist:       { action: 'approve' | 'reject', revisionNotes?, rejectionReason? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; deliverableId: string }> }) {
  const { id, deliverableId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await getDealForUser(supabaseAdmin, id, user.id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: deliverable } = await supabaseAdmin
    .from('team_split_deliverables').select('*').eq('id', deliverableId).eq('deal_id', id).maybeSingle();
  if (!deliverable) return NextResponse.json({ error: 'Deliverable not found' }, { status: 404 });

  const body = await req.json();
  const action: string = body.action;
  const now = new Date().toISOString();

  // artist user id for notifications
  const { data: artistProfile } = await supabaseAdmin
    .from('artist_profiles').select('user_id').eq('id', ctx.deal.artist_id).maybeSingle();

  if (action === 'submit') {
    if (!ctx.isCollaborator) return NextResponse.json({ error: 'Only the collaborator can submit' }, { status: 403 });
    await supabaseAdmin.from('team_split_deliverables').update({
      status: 'submitted', submitted_at: now, submitted_by: user.id,
      file_url: body.fileUrl || deliverable.file_url,
      external_link: body.externalLink || deliverable.external_link,
      updated_at: now,
    }).eq('id', deliverableId);
    await recordAudit(supabaseAdmin, id, user.id, 'deliverable_submitted', { title: deliverable.title });
    if (artistProfile?.user_id) await notifyDeliverableSubmitted(supabaseAdmin, artistProfile.user_id, ctx.deal.title, deliverable.title, id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'approve') {
    if (!ctx.isArtist) return NextResponse.json({ error: 'Only the artist can approve' }, { status: 403 });
    await supabaseAdmin.from('team_split_deliverables').update({
      status: 'approved', approved_at: now, approved_by: user.id, updated_at: now,
    }).eq('id', deliverableId);
    await recordAudit(supabaseAdmin, id, user.id, 'deliverable_approved', { title: deliverable.title });
    await notifyDeliverableDecision(supabaseAdmin, ctx.deal.collaborator_user_id, id, deliverable.title, true);
    return NextResponse.json({ ok: true });
  }

  if (action === 'reject') {
    if (!ctx.isArtist) return NextResponse.json({ error: 'Only the artist can request revisions' }, { status: 403 });
    if (!body.rejectionReason && !body.revisionNotes) {
      return NextResponse.json({ error: 'Add a reason so the collaborator knows what to fix.' }, { status: 400 });
    }
    await supabaseAdmin.from('team_split_deliverables').update({
      status: 'revision_requested', rejected_at: now,
      rejection_reason: body.rejectionReason || null, revision_notes: body.revisionNotes || null, updated_at: now,
    }).eq('id', deliverableId);
    await recordAudit(supabaseAdmin, id, user.id, 'deliverable_revision_requested', { title: deliverable.title });
    await notifyDeliverableDecision(supabaseAdmin, ctx.deal.collaborator_user_id, id, deliverable.title, false);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
