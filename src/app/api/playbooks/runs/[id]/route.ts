import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

async function getArtistId() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).single();
  return artist?.id ?? null;
}

// GET /api/playbooks/runs/[id] — run + steps
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const artistId = await getArtistId();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const { data: run } = await supabaseAdmin.from('artist_playbook_runs').select('*').eq('id', id).eq('artist_id', artistId).single();
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: steps } = await supabaseAdmin.from('artist_playbook_steps').select('*').eq('run_id', id).order('step_index', { ascending: true });
  return NextResponse.json({ run, steps: steps || [] });
}

// PATCH /api/playbooks/runs/[id]  { status }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const artistId = await getArtistId();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const { data: run } = await supabaseAdmin.from('artist_playbook_runs').select('id').eq('id', id).eq('artist_id', artistId).single();
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { status } = await req.json();
  if (!['active', 'paused', 'completed', 'cancelled'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  const patch: Record<string, any> = { status, updated_at: new Date().toISOString() };
  if (status === 'completed') patch.completed_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin.from('artist_playbook_runs').update(patch).eq('id', id).eq('artist_id', artistId).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ run: data });
}
