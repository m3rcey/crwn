import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

async function getCaller(): Promise<{ artistId: string; userId: string } | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: artist } = await supabase
    .from('artist_profiles').select('id').eq('user_id', user.id).single();
  if (!artist) return null;
  return { artistId: artist.id, userId: user.id };
}

// POST /api/crm/notes  { fanId, note }
export async function POST(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const { fanId, note } = await req.json();
  if (!fanId || !note?.trim()) {
    return NextResponse.json({ error: 'Missing fanId or note' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('fan_growth_notes')
    .insert({
      artist_id: caller.artistId,
      fan_id: fanId,
      note: note.trim().slice(0, 2000),
      created_by: caller.userId,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}

// DELETE /api/crm/notes  { id }
export async function DELETE(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await supabaseAdmin
    .from('fan_growth_notes')
    .delete()
    .eq('id', id)
    .eq('artist_id', caller.artistId);

  return NextResponse.json({ success: true });
}
