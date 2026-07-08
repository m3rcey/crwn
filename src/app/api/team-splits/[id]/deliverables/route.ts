import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getDealForUser, recordAudit } from '@/lib/teamSplits/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// POST /api/team-splits/:id/deliverables  -> artist adds a deliverable
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await getDealForUser(supabaseAdmin, id, user.id);
  if (!ctx || !ctx.isArtist) return NextResponse.json({ error: 'Only the artist can add deliverables' }, { status: 403 });

  const body = await req.json();
  if (!body.title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('team_split_deliverables')
    .insert({
      deal_id: id,
      title: body.title,
      description: body.description || null,
      due_at: body.dueAt || null,
      approval_required: body.approvalRequired ?? true,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: 'Could not add deliverable' }, { status: 500 });
  await recordAudit(supabaseAdmin, id, user.id, 'deliverable_added', { title: body.title });
  return NextResponse.json({ deliverable: data });
}
