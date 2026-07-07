import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

// Live progress: money = revenue since started_at; else = denormalized current_value.
async function liveCurrent(campaign: any): Promise<number> {
  if (campaign.goal_type !== 'money') return campaign.current_value || 0;
  const { data: earn } = await supabaseAdmin
    .from('earnings').select('gross_amount').eq('artist_id', campaign.artist_id).gte('created_at', campaign.started_at);
  return (earn || []).reduce((s: number, e: any) => s + (e.gross_amount || 0), 0);
}

async function getCaller() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, artistId: null };
  const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).single();
  return { userId: user.id, artistId: artist?.id ?? null };
}

// GET /api/road-campaigns/[id] — serves artist detail + the public Movement hero.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, artistId } = await getCaller();
  const { data: campaign } = await supabaseAdmin.from('road_campaigns').select('*').eq('id', id).single();
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwner = artistId && campaign.artist_id === artistId;
  if (!isOwner && !['active', 'reached'].includes(campaign.status)) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  const current = await liveCurrent(campaign);

  // Artist name/slug for share + checkout links
  const { data: ap } = await supabaseAdmin.from('artist_profiles').select('user_id, slug').eq('id', campaign.artist_id).single();
  let artistName = 'Artist';
  if (ap?.user_id) {
    const { data: p } = await supabaseAdmin.from('profiles').select('display_name').eq('id', ap.user_id).single();
    artistName = p?.display_name || 'Artist';
  }

  // Supporter count + whether the caller already supported (non-money)
  const { data: contribs } = await supabaseAdmin
    .from('road_campaign_contributions').select('fan_id').eq('campaign_id', id);
  const supporterCount = new Set((contribs || []).map((c: any) => c.fan_id)).size;
  const alreadySupported = userId ? (contribs || []).some((c: any) => c.fan_id === userId) : false;

  return NextResponse.json({
    campaign: { ...campaign, current_value: current },
    artistName, artistSlug: ap?.slug || null, supporterCount, alreadySupported, isOwner,
  });
}

// PATCH /api/road-campaigns/[id]  { status?, title?, goalValue?, reachedMessage?, deadline? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { artistId } = await getCaller();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });
  const { data: campaign } = await supabaseAdmin.from('road_campaigns').select('id').eq('id', id).eq('artist_id', artistId).single();
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) patch.title = body.title;
  if (body.reachedMessage !== undefined) patch.reached_message = body.reachedMessage;
  if (body.deadline !== undefined) patch.deadline = body.deadline;
  if (body.goalValue !== undefined) patch.goal_value = Math.max(1, parseInt(body.goalValue) || 1);
  if (body.status && ['draft', 'active', 'reached', 'archived'].includes(body.status)) patch.status = body.status;

  const { data, error } = await supabaseAdmin.from('road_campaigns').update(patch).eq('id', id).eq('artist_id', artistId).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}

// DELETE /api/road-campaigns/[id] — archive
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { artistId } = await getCaller();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });
  await supabaseAdmin.from('road_campaigns').update({ status: 'archived' }).eq('id', id).eq('artist_id', artistId);
  return NextResponse.json({ success: true });
}
