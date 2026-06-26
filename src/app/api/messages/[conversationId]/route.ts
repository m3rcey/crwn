import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOwnedArtistIds } from '@/lib/messaging';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Resolve the conversation and the caller's role, or null if not a participant.
async function authorize(userId: string, conversationId: string) {
  const { data: convo } = await supabaseAdmin
    .from('dm_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();
  if (!convo) return { convo: null, role: null as null | 'fan' | 'artist' };
  if (convo.fan_id === userId) return { convo, role: 'fan' as const };
  const owned = await getOwnedArtistIds(supabaseAdmin, userId);
  if (owned.includes(convo.artist_id)) return { convo, role: 'artist' as const };
  return { convo, role: null };
}

// GET /api/messages/[conversationId] — thread messages, and clear the caller's unread.
export async function GET(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { convo, role } = await authorize(user.id, conversationId);
  if (!convo || !role) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: messages } = await supabaseAdmin
    .from('dm_messages')
    .select('id, conversation_id, sender_id, sender_is_artist, body, is_deleted, created_at')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(200);

  // Clear this side's unread counter.
  await supabaseAdmin
    .from('dm_conversations')
    .update(role === 'fan' ? { fan_unread: 0 } : { artist_unread: 0 })
    .eq('id', conversationId);

  // Other party's display name for the header.
  let otherName = 'Fan';
  if (role === 'fan') {
    const { data: artist } = await supabaseAdmin.from('artist_profiles').select('user_id, slug').eq('id', convo.artist_id).maybeSingle();
    if (artist?.user_id) {
      const { data: p } = await supabaseAdmin.from('profiles').select('display_name').eq('id', artist.user_id).maybeSingle();
      otherName = p?.display_name || 'Artist';
    }
  } else {
    const { data: p } = await supabaseAdmin.from('profiles').select('display_name').eq('id', convo.fan_id).maybeSingle();
    otherName = p?.display_name || 'Fan';
  }

  return NextResponse.json({
    role,
    otherName,
    muted: convo.muted_by_artist,
    tierName: convo.fan_tier_name,
    messages: messages || [],
  });
}

// PATCH /api/messages/[conversationId] — { action: 'mute' | 'unmute' | 'read' }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action } = await req.json().catch(() => ({}));
  const { convo, role } = await authorize(user.id, conversationId);
  if (!convo || !role) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (action === 'read') {
    await supabaseAdmin
      .from('dm_conversations')
      .update(role === 'fan' ? { fan_unread: 0 } : { artist_unread: 0 })
      .eq('id', conversationId);
    return NextResponse.json({ ok: true });
  }

  if (action === 'mute' || action === 'unmute') {
    if (role !== 'artist') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    await supabaseAdmin
      .from('dm_conversations')
      .update({ muted_by_artist: action === 'mute' })
      .eq('id', conversationId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
