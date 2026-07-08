import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getDealForUser, recordAudit, deliverablesApproved } from '@/lib/teamSplits/server';
import { notifyPayoutReleased } from '@/lib/teamSplits/notify';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// POST /api/team-splits/:id/release -> artist releases accrued (held) payouts.
// This is the manual-release gate: nothing becomes cashable until the artist
// releases it (and, on top of that, the refund hold must clear).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await getDealForUser(supabaseAdmin, id, user.id);
  if (!ctx || !ctx.isArtist) return NextResponse.json({ error: 'Only the artist can release payouts' }, { status: 403 });
  const deal = ctx.deal;

  // Deliverable gate.
  if (deal.payout_starts_after_deliverable_approval) {
    const ok = await deliverablesApproved(supabaseAdmin, id);
    if (!ok) {
      return NextResponse.json({ error: 'Approve the required deliverables before releasing payouts.' }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  // Find held, positive, not-yet-released accruals for this deal.
  const { data: held } = await supabaseAdmin
    .from('team_split_earnings')
    .select('id, commission_amount')
    .eq('deal_id', id)
    .eq('status', 'held')
    .is('released_at', null)
    .gt('commission_amount', 0);

  const ids = (held || []).map((r) => r.id);
  const total = (held || []).reduce((s, r) => s + r.commission_amount, 0);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, released: 0, message: 'Nothing new to release.' });
  }

  await supabaseAdmin
    .from('team_split_earnings')
    .update({ released_at: now, status: 'released' })
    .in('id', ids);
  await recordAudit(supabaseAdmin, id, user.id, 'payout_released', { count: ids.length, amount: total });

  // Does the collaborator still need payout setup?
  let needsSetup = true;
  if (deal.collaborator_user_id) {
    const { data: p } = await supabaseAdmin.from('profiles').select('stripe_connect_id').eq('id', deal.collaborator_user_id).maybeSingle();
    needsSetup = !p?.stripe_connect_id;
    await notifyPayoutReleased(supabaseAdmin, {
      collaboratorUserId: deal.collaborator_user_id,
      dealTitle: deal.title,
      amountCents: total,
      needsPayoutSetup: needsSetup,
      dealId: id,
    });
  }

  return NextResponse.json({ ok: true, released: total, count: ids.length, collaboratorNeedsPayoutSetup: needsSetup });
}
