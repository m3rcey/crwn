import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

async function getArtistId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles').select('id').eq('user_id', user.id).maybeSingle();
  return artist?.id ?? null;
}

// DELETE /api/missions/[id] — SAFE delete. Permanently deletes only when no fan has
// joined the mission; otherwise archives so participant records aren't orphaned.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const artistId = await getArtistId();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  // Ownership: the mission must belong to the caller's artist.
  const { data: mission } = await supabaseAdmin
    .from('missions').select('id').eq('id', id).eq('artist_id', artistId).maybeSingle();
  if (!mission) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { count } = await supabaseAdmin
    .from('mission_participants').select('id', { count: 'exact', head: true }).eq('mission_id', id);

  if ((count || 0) > 0) {
    await supabaseAdmin.from('missions').update({ status: 'archived' }).eq('id', id).eq('artist_id', artistId);
    return NextResponse.json({ success: true, deleted: false, archived: true });
  }

  await supabaseAdmin.from('missions').delete().eq('id', id).eq('artist_id', artistId);
  return NextResponse.json({ success: true, deleted: true });
}
