import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get sequence
  const { data: sequence } = await supabaseAdmin
    .from('sequences')
    .select('id, artist_id, is_active')
    .eq('id', id)
    .single();

  if (!sequence) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });

  // Verify ownership
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', sequence.artist_id)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your sequence' }, { status: 403 });

  // If activating, check that it has at least one step
  if (!sequence.is_active) {
    const { count } = await supabaseAdmin
      .from('sequence_steps')
      .select('id', { count: 'exact', head: true })
      .eq('sequence_id', id);

    if (!count || count === 0) {
      return NextResponse.json({ error: 'Add at least one step before activating' }, { status: 400 });
    }
  }

  const { error } = await supabaseAdmin
    .from('sequences')
    .update({ is_active: !sequence.is_active, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If deactivating, cancel all active enrollments
  if (sequence.is_active) {
    await supabaseAdmin
      .from('sequence_enrollments')
      .update({ status: 'canceled' })
      .eq('sequence_id', id)
      .eq('status', 'active');
  }

  return NextResponse.json({ success: true, is_active: !sequence.is_active });
}
