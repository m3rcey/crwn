import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

async function getCaller() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, artistId: null };
  const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).single();
  return { userId: user.id, artistId: artist?.id ?? null };
}

// GET /api/city-unlocks/[id] — serves both artist detail and the public/fan city page.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, artistId } = await getCaller();

  const { data: unlock } = await supabaseAdmin.from('city_unlocks').select('*').eq('id', id).single();
  if (!unlock) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwner = artistId && unlock.artist_id === artistId;
  if (!isOwner && !['active', 'unlocked'].includes(unlock.status)) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  // Artist display name for the public card
  let artistName = 'Artist';
  const { data: ap } = await supabaseAdmin.from('artist_profiles').select('user_id, slug').eq('id', unlock.artist_id).single();
  if (ap?.user_id) {
    const { data: p } = await supabaseAdmin.from('profiles').select('display_name').eq('id', ap.user_id).single();
    artistName = p?.display_name || 'Artist';
  }

  // Aggregate: unique contributors + (owner only) city breakdown
  const { data: contribs } = await supabaseAdmin
    .from('city_unlock_contributions').select('fan_id, contribution_type, city').eq('city_unlock_id', id);
  const contributorCount = new Set((contribs || []).map((c: any) => c.fan_id)).size;

  let cityBreakdown: { city: string; count: number }[] = [];
  if (isOwner) {
    const byCity: Record<string, Set<string>> = {};
    (contribs || []).forEach((c: any) => {
      const key = c.city || 'Unknown';
      if (!byCity[key]) byCity[key] = new Set();
      byCity[key].add(c.fan_id);
    });
    cityBreakdown = Object.entries(byCity).map(([city, set]) => ({ city, count: set.size })).sort((a, b) => b.count - a.count);
  }

  // What the current user already did
  const myContributions = userId
    ? (contribs || []).filter((c: any) => c.fan_id === userId).map((c: any) => c.contribution_type)
    : [];

  return NextResponse.json({ unlock, artistName, artistSlug: ap?.slug || null, contributorCount, cityBreakdown, myContributions, isOwner });
}

// PATCH /api/city-unlocks/[id]  { status?, unlockMessage?, deadline?, goalValue? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { artistId } = await getCaller();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });
  const { data: unlock } = await supabaseAdmin.from('city_unlocks').select('id').eq('id', id).eq('artist_id', artistId).single();
  if (!unlock) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.status && ['draft', 'active', 'unlocked', 'expired', 'archived'].includes(body.status)) patch.status = body.status;
  if (body.unlockMessage !== undefined) patch.unlock_message = body.unlockMessage;
  if (body.deadline !== undefined) patch.deadline = body.deadline;
  if (body.goalValue !== undefined) patch.goal_value = Math.max(1, parseInt(body.goalValue) || 1);

  const { data, error } = await supabaseAdmin.from('city_unlocks').update(patch).eq('id', id).eq('artist_id', artistId).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ unlock: data });
}

// DELETE /api/city-unlocks/[id] — archive
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { artistId } = await getCaller();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });
  await supabaseAdmin.from('city_unlocks').update({ status: 'archived' }).eq('id', id).eq('artist_id', artistId);
  return NextResponse.json({ success: true });
}
