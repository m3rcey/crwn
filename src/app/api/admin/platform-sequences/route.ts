import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin' ? user : null;
}

// GET: list all platform sequences with steps and enrollment stats
export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { data: sequences } = await supabaseAdmin
    .from('platform_sequences')
    .select('*')
    .order('created_at', { ascending: true });

  if (!sequences) return NextResponse.json({ sequences: [] });

  // Get steps for each sequence
  const seqIds = sequences.map(s => s.id);
  const { data: steps } = await supabaseAdmin
    .from('platform_sequence_steps')
    .select('*')
    .in('sequence_id', seqIds)
    .order('step_number', { ascending: true });

  // Get enrollment stats
  const { data: enrollments } = await supabaseAdmin
    .from('platform_sequence_enrollments')
    .select('sequence_id, status')
    .in('sequence_id', seqIds);

  const stepsBySeq: Record<string, typeof steps> = {};
  (steps || []).forEach(s => {
    if (!stepsBySeq[s.sequence_id]) stepsBySeq[s.sequence_id] = [];
    stepsBySeq[s.sequence_id]!.push(s);
  });

  const statsBySeq: Record<string, { active: number; completed: number; canceled: number }> = {};
  (enrollments || []).forEach(e => {
    if (!statsBySeq[e.sequence_id]) statsBySeq[e.sequence_id] = { active: 0, completed: 0, canceled: 0 };
    if (e.status === 'active') statsBySeq[e.sequence_id].active++;
    else if (e.status === 'completed') statsBySeq[e.sequence_id].completed++;
    else if (e.status === 'canceled') statsBySeq[e.sequence_id].canceled++;
  });

  const enriched = sequences.map(s => ({
    ...s,
    steps: stepsBySeq[s.id] || [],
    enrollments: statsBySeq[s.id] || { active: 0, completed: 0, canceled: 0 },
  }));

  return NextResponse.json({ sequences: enriched });
}

// POST: update a sequence (toggle active, update steps)
export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { id, action, steps, name } = body;

  if (!id) return NextResponse.json({ error: 'Missing sequence ID' }, { status: 400 });

  if (action === 'toggle') {
    const { data: seq } = await supabaseAdmin
      .from('platform_sequences')
      .select('is_active')
      .eq('id', id)
      .single();

    if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });

    await supabaseAdmin
      .from('platform_sequences')
      .update({ is_active: !seq.is_active, updated_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({ success: true, is_active: !seq.is_active });
  }

  if (action === 'update_steps') {
    if (!steps || !Array.isArray(steps)) {
      return NextResponse.json({ error: 'Missing steps' }, { status: 400 });
    }

    // Update name if provided
    if (name) {
      await supabaseAdmin
        .from('platform_sequences')
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq('id', id);
    }

    // Delete existing steps and re-insert
    await supabaseAdmin
      .from('platform_sequence_steps')
      .delete()
      .eq('sequence_id', id);

    if (steps.length > 0) {
      const stepRecords = steps.map((s: { delay_days: number; subject: string; body: string }, i: number) => ({
        sequence_id: id,
        step_number: i + 1,
        delay_days: s.delay_days,
        subject: s.subject.trim(),
        body: s.body.trim(),
      }));

      const { error } = await supabaseAdmin
        .from('platform_sequence_steps')
        .insert(stepRecords);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
