import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { notifyClippersOfNewBounty } from '@/lib/bountyNotify';

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

// GET /api/bounties/[id] — detail + submissions leaderboard (artist view)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const artistId = await getArtistId();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const { data: bounty } = await supabaseAdmin
    .from('clip_bounties').select('*').eq('id', id).eq('artist_id', artistId).single();
  if (!bounty) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: submissions } = await supabaseAdmin
    .from('clip_bounty_submissions').select('*').eq('bounty_id', id)
    .order('subscribers_attributed', { ascending: false });

  const clipperIds = Array.from(new Set((submissions || []).map((s: any) => s.clipper_id)));
  const nameMap: Record<string, { name: string; avatar: string | null }> = {};
  if (clipperIds.length > 0) {
    const { data: profs } = await supabaseAdmin.from('profiles').select('id, display_name, username, avatar_url').in('id', clipperIds);
    (profs || []).forEach((p: any) => { nameMap[p.id] = { name: p.display_name || p.username || 'Clipper', avatar: p.avatar_url }; });
  }
  const enriched = (submissions || []).map((s: any) => ({ ...s, display_name: nameMap[s.clipper_id]?.name || 'Clipper', avatar_url: nameMap[s.clipper_id]?.avatar || null }));

  return NextResponse.json({ bounty, submissions: enriched });
}

// PATCH /api/bounties/[id]  { status?, cancelReason? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const artistId = await getArtistId();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const { data: bounty } = await supabaseAdmin.from('clip_bounties').select('id, status').eq('id', id).eq('artist_id', artistId).single();
  if (!bounty) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.status && ['draft', 'active', 'ended', 'cancelled', 'awarded'].includes(body.status)) patch.status = body.status;
  if (body.cancelReason !== undefined) patch.cancel_reason = body.cancelReason;

  const { data, error } = await supabaseAdmin.from('clip_bounties').update(patch).eq('id', id).eq('artist_id', artistId).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A draft flipped to active is "going live" — ping proven clippers. Guarded on
  // the PRE-update status so re-saving an already-active bounty can't re-notify.
  if (bounty.status === 'draft' && data.status === 'active') {
    try {
      await notifyClippersOfNewBounty(supabaseAdmin, artistId, data.title);
    } catch (e) {
      console.error('bounty publish clipper notify failed:', e);
    }
  }

  return NextResponse.json({ bounty: data });
}

// DELETE /api/bounties/[id] — cancel (soft)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const artistId = await getArtistId();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });
  await supabaseAdmin.from('clip_bounties').update({ status: 'cancelled' }).eq('id', id).eq('artist_id', artistId);
  return NextResponse.json({ success: true });
}
