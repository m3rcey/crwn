import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getDealForUser, recordAudit } from '@/lib/teamSplits/server';
import { alertAdmin } from '@/lib/teamSplits/notify';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// POST /api/team-splits/:id/disputes -> either party opens a dispute
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await getDealForUser(supabaseAdmin, id, user.id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  if (!body.description) return NextResponse.json({ error: 'Describe the issue.' }, { status: 400 });

  const { data: dispute, error } = await supabaseAdmin.from('team_split_disputes').insert({
    deal_id: id,
    opened_by_user_id: user.id,
    dispute_type: body.disputeType || 'other',
    description: body.description,
  }).select('*').single();
  if (error) return NextResponse.json({ error: 'Could not open dispute' }, { status: 500 });

  // Freeze the deal: 'disputed' is excluded from the accrual cron and release.
  await supabaseAdmin.from('team_split_deals')
    .update({ status: 'disputed' })
    .eq('id', id)
    .in('status', ['active', 'paused', 'accepted']);
  await recordAudit(supabaseAdmin, id, user.id, 'dispute_opened', { dispute_type: body.disputeType });
  await alertAdmin('Dispute opened', `A dispute was opened on deal "${ctx.deal.title}" (${id}). Type: ${body.disputeType || 'other'}.`);

  return NextResponse.json({ dispute });
}
