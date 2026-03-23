import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const artistId = req.nextUrl.searchParams.get('artistId');
  if (!artistId) return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });

  // Verify ownership
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  // Get sequences with steps and enrollment counts
  const { data: sequences } = await supabaseAdmin
    .from('sequences')
    .select('*, sequence_steps(*)')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  // Get enrollment counts per sequence
  const sequenceIds = (sequences || []).map(s => s.id);
  let enrollmentCounts: Record<string, { active: number; completed: number; canceled: number }> = {};

  if (sequenceIds.length > 0) {
    const { data: enrollments } = await supabaseAdmin
      .from('sequence_enrollments')
      .select('sequence_id, status')
      .in('sequence_id', sequenceIds);

    (enrollments || []).forEach(e => {
      if (!enrollmentCounts[e.sequence_id]) {
        enrollmentCounts[e.sequence_id] = { active: 0, completed: 0, canceled: 0 };
      }
      if (e.status === 'active') enrollmentCounts[e.sequence_id].active++;
      else if (e.status === 'completed') enrollmentCounts[e.sequence_id].completed++;
      else if (e.status === 'canceled') enrollmentCounts[e.sequence_id].canceled++;
    });
  }

  const result = (sequences || []).map(s => ({
    ...s,
    steps: (s.sequence_steps || []).sort((a: any, b: any) => a.step_number - b.step_number),
    enrollments: enrollmentCounts[s.id] || { active: 0, completed: 0, canceled: 0 },
  }));

  return NextResponse.json({ sequences: result });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, artistId, name, triggerType, steps } = body;

  if (!artistId || !name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify ownership
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  if (id) {
    // Update existing sequence
    const { error: seqError } = await supabaseAdmin
      .from('sequences')
      .update({
        name,
        trigger_type: triggerType || 'new_subscription',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('artist_id', artistId);

    if (seqError) return NextResponse.json({ error: seqError.message }, { status: 500 });

    // Replace steps: delete existing, insert new
    if (steps && Array.isArray(steps)) {
      await supabaseAdmin
        .from('sequence_steps')
        .delete()
        .eq('sequence_id', id);

      if (steps.length > 0) {
        const stepRecords = steps.map((s: any, i: number) => ({
          sequence_id: id,
          step_number: i + 1,
          delay_days: s.delay_days,
          subject: s.subject,
          body: s.body,
        }));

        const { error: stepsError } = await supabaseAdmin
          .from('sequence_steps')
          .insert(stepRecords);

        if (stepsError) return NextResponse.json({ error: stepsError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, id });
  } else {
    // Create new sequence
    const { data: sequence, error: seqError } = await supabaseAdmin
      .from('sequences')
      .insert({
        artist_id: artistId,
        name,
        trigger_type: triggerType || 'new_subscription',
        is_active: false, // Start inactive until steps are added
      })
      .select()
      .single();

    if (seqError) return NextResponse.json({ error: seqError.message }, { status: 500 });

    // Insert steps if provided
    if (steps && Array.isArray(steps) && steps.length > 0) {
      const stepRecords = steps.map((s: any, i: number) => ({
        sequence_id: sequence.id,
        step_number: i + 1,
        delay_days: s.delay_days,
        subject: s.subject,
        body: s.body,
      }));

      const { error: stepsError } = await supabaseAdmin
        .from('sequence_steps')
        .insert(stepRecords);

      if (stepsError) return NextResponse.json({ error: stepsError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: sequence.id });
  }
}
