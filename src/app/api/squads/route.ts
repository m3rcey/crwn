import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { SQUAD_TYPE_MAP, slugifySquad, type SquadType } from '@/lib/squads';

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

// GET /api/squads?scope=artist|fan
export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get('scope') || 'artist';
  const { user, artistId } = await getUserAndArtist();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (scope === 'fan') {
    // Squads this user belongs to
    const { data: memberships } = await supabaseAdmin
      .from('artist_squad_members')
      .select('*, artist_squads(id, name, type, description, status, artist_id, badge_key)')
      .eq('fan_id', user.id)
      .in('status', ['active', 'invited', 'applied']);
    return NextResponse.json({ squads: memberships || [] });
  }

  // Artist scope
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });
  const { data: squads } = await supabaseAdmin
    .from('artist_squads')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  // Attach member counts
  const ids = (squads || []).map(s => s.id);
  const counts: Record<string, { total: number; active: number; pending: number }> = {};
  if (ids.length > 0) {
    const { data: members } = await supabaseAdmin
      .from('artist_squad_members')
      .select('squad_id, status')
      .in('squad_id', ids);
    (members || []).forEach((m: any) => {
      if (!counts[m.squad_id]) counts[m.squad_id] = { total: 0, active: 0, pending: 0 };
      counts[m.squad_id].total++;
      if (m.status === 'active') counts[m.squad_id].active++;
      if (m.status === 'applied' || m.status === 'invited') counts[m.squad_id].pending++;
    });
  }

  return NextResponse.json({
    squads: (squads || []).map(s => ({ ...s, memberCounts: counts[s.id] || { total: 0, active: 0, pending: 0 } })),
  });
}

// POST /api/squads  { name, type, description?, visibility?, goal?, linkedCity?, badgeKey?, autoQualify?, rewards? }
export async function POST(req: NextRequest) {
  const { user, artistId } = await getUserAndArtist();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const body = await req.json();
  const type = (body.type || 'custom') as SquadType;
  const def = SQUAD_TYPE_MAP[type] || SQUAD_TYPE_MAP.custom;
  const name = (body.name || def.label).trim();
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('artist_squads')
    .insert({
      artist_id: artistId,
      name,
      slug: slugifySquad(name),
      type,
      description: body.description || def.description,
      status: body.status === 'draft' ? 'draft' : 'active',
      visibility: body.visibility || def.suggestedVisibility,
      goal: body.goal || null,
      linked_city: body.linkedCity || null,
      linked_segment_id: body.linkedSegmentId || null,
      badge_key: body.badgeKey ?? def.badgeKey ?? null,
      auto_qualify: body.autoQualify || {},
      rewards: body.rewards || [],
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ squad: data });
}
