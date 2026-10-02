// POST /api/community/rooms  { artistId }  ->  { rooms }
//
// Makes sure the signed-in artist has one tier room per active rung (planTierRooms), then
// returns their rooms. Owner-only: the artist is proven from the SESSION by
// requireArtistOwner, and the artist id in the body is only which page they are on. The
// ladder and the existing rooms are read here, never taken from the request, so a caller
// can never name the tiers a room admits.
//
// Called by the owner's own community tab when the plan says something is missing, which
// is what sets the rooms up for every artist, not only the launch partners.
//
// Additive only (see rooms.ts): it creates and refreshes, never deactivates, never narrows.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireArtistOwner } from '@/lib/apiAuth';
import { planTierRooms, type RoomChannel } from '@/lib/community/rooms';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const owner = await requireArtistOwner(body.artistId);
  if (!owner.ok) return owner.error;
  const artistId = body.artistId as string;

  const [{ data: tiers, error: tierError }, { data: channels, error: channelError }] = await Promise.all([
    supabaseAdmin.from('subscription_tiers').select('id, name, price').eq('artist_id', artistId).eq('is_active', true),
    supabaseAdmin.from('community_channels').select('*').eq('artist_id', artistId),
  ]);
  if (tierError || channelError) {
    return NextResponse.json({ error: 'Could not read your tiers.' }, { status: 500 });
  }

  const plan = planTierRooms(tiers || [], (channels || []) as RoomChannel[]);

  if (plan.create.length) {
    const { error } = await supabaseAdmin
      .from('community_channels')
      .insert(plan.create.map((r) => ({ ...r, artist_id: artistId })));
    if (error) {
      // 42703: the tier-rooms migration has not been applied yet. The tab keeps working
      // without rooms, exactly as it did before.
      const notReady = error.code === '42703' || /tier_id/.test(error.message || '');
      return NextResponse.json(
        { error: notReady ? 'not_ready' : 'Could not create your rooms.' },
        { status: notReady ? 503 : 500 },
      );
    }
  }

  for (const patch of plan.update) {
    const { id, ...fields } = patch;
    const { error } = await supabaseAdmin
      .from('community_channels')
      .update(fields)
      .eq('id', id)
      .eq('artist_id', artistId);
    if (error) return NextResponse.json({ error: 'Could not update your rooms.' }, { status: 500 });
  }

  const { data: rooms } = await supabaseAdmin
    .from('community_channels')
    .select('*')
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .not('tier_id', 'is', null);

  return NextResponse.json({ rooms: rooms || [], created: plan.create.length, updated: plan.update.length });
}
