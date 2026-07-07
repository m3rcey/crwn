import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

async function getUserAndArtist() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, artistId: null };
  const { data: artist } = await supabase
    .from('artist_profiles').select('id').eq('user_id', user.id).single();
  return { user, artistId: artist?.id ?? null };
}

// Verify the caller owns the squad; returns the squad row or null.
async function ownedSquad(squadId: string, artistId: string | null) {
  if (!artistId) return null;
  const { data } = await supabaseAdmin
    .from('artist_squads').select('*').eq('id', squadId).eq('artist_id', artistId).single();
  return data;
}

// GET /api/squads/[id] — detail (squad + members + linked missions + stats)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { artistId } = await getUserAndArtist();
  const squad = await ownedSquad(id, artistId);
  if (!squad) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: members } = await supabaseAdmin
    .from('artist_squad_members')
    .select('*')
    .eq('squad_id', id)
    .order('contribution_score', { ascending: false });

  // Enrich members with profile names
  const fanIds = (members || []).map((m: any) => m.fan_id);
  const nameMap: Record<string, { name: string; avatar: string | null }> = {};
  if (fanIds.length > 0) {
    const { data: profs } = await supabaseAdmin
      .from('profiles').select('id, display_name, username, avatar_url').in('id', fanIds);
    (profs || []).forEach((p: any) => {
      nameMap[p.id] = { name: p.display_name || p.username || 'Fan', avatar: p.avatar_url };
    });
  }
  const enriched = (members || []).map((m: any) => ({
    ...m,
    display_name: nameMap[m.fan_id]?.name || 'Fan',
    avatar_url: nameMap[m.fan_id]?.avatar || null,
  }));

  const { data: squadMissions } = await supabaseAdmin
    .from('artist_squad_missions')
    .select('mission_id, missions(id, title, type, status, goal_count, manual_count)')
    .eq('squad_id', id);

  const active = enriched.filter((m: any) => m.status === 'active');
  const stats = {
    activeMembers: active.length,
    pending: enriched.filter((m: any) => m.status === 'applied' || m.status === 'invited').length,
    revenueGenerated: active.reduce((s: number, m: any) => s + (m.revenue_generated || 0), 0),
    subscribersAttributed: active.reduce((s: number, m: any) => s + (m.subscribers_attributed || 0), 0),
    missionsCompleted: active.reduce((s: number, m: any) => s + (m.missions_completed || 0), 0),
    clipsPosted: active.reduce((s: number, m: any) => s + (m.clips_posted || 0), 0),
  };

  return NextResponse.json({ squad, members: enriched, missions: squadMissions || [], stats });
}

// PATCH /api/squads/[id]  { name?, description?, status?, visibility?, goal?, badgeKey? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { artistId } = await getUserAndArtist();
  const squad = await ownedSquad(id, artistId);
  if (!squad) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of ['name', 'description', 'goal', 'linked_city', 'badge_key'] as const) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.status && ['draft', 'active', 'paused', 'archived'].includes(body.status)) patch.status = body.status;
  if (body.visibility && ['private', 'invite_only', 'application', 'public'].includes(body.visibility)) patch.visibility = body.visibility;

  const { data, error } = await supabaseAdmin
    .from('artist_squads').update(patch).eq('id', id).eq('artist_id', artistId!).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ squad: data });
}

// DELETE /api/squads/[id] — archive (soft) unless ?hard=1
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { artistId } = await getUserAndArtist();
  const squad = await ownedSquad(id, artistId);
  if (!squad) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (req.nextUrl.searchParams.get('hard') === '1') {
    await supabaseAdmin.from('artist_squads').delete().eq('id', id).eq('artist_id', artistId!);
  } else {
    await supabaseAdmin.from('artist_squads').update({ status: 'archived' }).eq('id', id).eq('artist_id', artistId!);
  }
  return NextResponse.json({ success: true });
}
