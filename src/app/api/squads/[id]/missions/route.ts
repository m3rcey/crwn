import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

async function ownedSquad(squadId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).single();
  if (!artist) return null;
  const { data } = await supabaseAdmin
    .from('artist_squads').select('id, artist_id').eq('id', squadId).eq('artist_id', artist.id).single();
  return data ? { squad: data, artistId: artist.id } : null;
}

// POST /api/squads/[id]/missions  { missionId }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: squadId } = await params;
  const owned = await ownedSquad(squadId);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { missionId } = await req.json();
  if (!missionId) return NextResponse.json({ error: 'Missing missionId' }, { status: 400 });

  // Ensure the mission belongs to this artist
  const { data: mission } = await supabaseAdmin
    .from('missions').select('id').eq('id', missionId).eq('artist_id', owned.artistId).single();
  if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });

  const { error } = await supabaseAdmin
    .from('artist_squad_missions')
    .upsert({ squad_id: squadId, mission_id: missionId }, { onConflict: 'squad_id,mission_id', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/squads/[id]/missions  { missionId }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: squadId } = await params;
  const owned = await ownedSquad(squadId);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { missionId } = await req.json();
  if (!missionId) return NextResponse.json({ error: 'Missing missionId' }, { status: 400 });
  await supabaseAdmin.from('artist_squad_missions').delete().eq('squad_id', squadId).eq('mission_id', missionId);
  return NextResponse.json({ success: true });
}
