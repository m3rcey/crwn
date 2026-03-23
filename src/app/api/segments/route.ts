import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: list all segments for the artist
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!artist) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const { data: segments } = await supabaseAdmin
    .from('saved_segments')
    .select('*')
    .eq('artist_id', artist.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ segments: segments || [] });
}

// POST: create or update a segment
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!artist) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const body = await req.json();
  const { id, name, filters, fanCount } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  if (id) {
    // Update existing
    const { error } = await supabaseAdmin
      .from('saved_segments')
      .update({
        name: name.trim(),
        filters: filters || {},
        fan_count: fanCount || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('artist_id', artist.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id });
  } else {
    // Create new
    const { data, error } = await supabaseAdmin
      .from('saved_segments')
      .insert({
        artist_id: artist.id,
        name: name.trim(),
        filters: filters || {},
        fan_count: fanCount || 0,
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data.id });
  }
}

// DELETE: remove a segment
export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!artist) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing segment ID' }, { status: 400 });

  await supabaseAdmin
    .from('saved_segments')
    .delete()
    .eq('id', id)
    .eq('artist_id', artist.id);

  return NextResponse.json({ success: true });
}
