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
  if (!user) return { userId: null, artistId: null };
  const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).single();
  return { userId: user.id, artistId: artist?.id ?? null };
}

// GET /api/city-unlocks (artist scope only; fan/public reads a single unlock via [id])
export async function GET() {
  const { artistId } = await getArtistId();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const { data: unlocks } = await supabaseAdmin
    .from('city_unlocks').select('*').eq('artist_id', artistId).order('created_at', { ascending: false });

  const ids = (unlocks || []).map(u => u.id);
  const counts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: contribs } = await supabaseAdmin
      .from('city_unlock_contributions').select('city_unlock_id, fan_id').in('city_unlock_id', ids);
    const seen: Record<string, Set<string>> = {};
    (contribs || []).forEach((c: any) => {
      if (!seen[c.city_unlock_id]) seen[c.city_unlock_id] = new Set();
      seen[c.city_unlock_id].add(c.fan_id);
    });
    Object.keys(seen).forEach(k => { counts[k] = seen[k].size; });
  }
  return NextResponse.json({ unlocks: (unlocks || []).map(u => ({ ...u, contributorCount: counts[u.id] || 0 })) });
}

// POST /api/city-unlocks (create)
export async function POST(req: NextRequest) {
  const { userId, artistId } = await getArtistId();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const b = await req.json();
  if (!b.title?.trim() || !b.targetCity?.trim()) {
    return NextResponse.json({ error: 'Title and city are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('city_unlocks').insert({
    artist_id: artistId,
    title: b.title.trim(),
    description: b.description || null,
    unlock_type: b.unlockType || 'event',
    status: b.status === 'draft' ? 'draft' : 'active',
    target_city: b.targetCity.trim(),
    target_region: b.targetRegion || null,
    target_country: b.targetCountry || null,
    goal_type: b.goalType || 'supporters',
    goal_value: Math.max(1, parseInt(b.goalValue) || 50),
    deadline: b.deadline || null,
    unlock_message: b.unlockMessage || null,
    linked_proof_test_id: b.linkedProofTestId || null,
    linked_squad_id: b.linkedSquadId || null,
    created_by: userId,
  }).select('*').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ unlock: data });
}
