import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { notifyNewMessage } from '@/lib/notifications';
import { getOwnedArtistIds } from '@/lib/messaging';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// POST /api/messages/broadcast — artist sends one message to all active fans.
//   body: { artistId, body, tierIds?: string[] }  (tierIds omitted = all tiers)
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { artistId, body, tierIds } = await req.json().catch(() => ({}));
  const text = typeof body === 'string' ? body.trim() : '';
  if (!artistId || !text) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: 'Message too long' }, { status: 400 });

  // Ownership check.
  const owned = await getOwnedArtistIds(supabaseAdmin, user.id);
  if (!owned.includes(artistId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const allowed = await checkRateLimit(user.id, 'dm-broadcast', 3600, 10);
  if (!allowed) return NextResponse.json({ error: 'Slow down' }, { status: 429 });

  // Active subscribers, optionally filtered to specific tiers.
  let subQuery = supabaseAdmin
    .from('subscriptions')
    .select('fan_id, tier_id')
    .eq('artist_id', artistId)
    .eq('status', 'active');
  if (Array.isArray(tierIds) && tierIds.length > 0) subQuery = subQuery.in('tier_id', tierIds);
  const { data: subs } = await subQuery;
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 });

  // Tier rank lookup (price ascending) for inbox priority.
  const { data: tiers } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id, name')
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .order('price', { ascending: true });
  const rankOf = (tierId: string) => {
    const idx = (tiers || []).findIndex((t) => t.id === tierId);
    return idx < 0 ? { rank: 0, name: null as string | null } : { rank: idx + 1, name: tiers![idx].name };
  };

  const preview = text.length > 120 ? `${text.slice(0, 117)}...` : text;
  let sent = 0;

  for (const sub of subs) {
    const { rank, name } = rankOf(sub.tier_id);

    // Upsert the conversation for this fan.
    const { data: existing } = await supabaseAdmin
      .from('dm_conversations')
      .select('id, fan_unread')
      .eq('artist_id', artistId)
      .eq('fan_id', sub.fan_id)
      .maybeSingle();

    let conversationId: string;
    let fanUnread = 0;
    if (existing) {
      conversationId = existing.id;
      fanUnread = existing.fan_unread ?? 0;
    } else {
      const { data: created } = await supabaseAdmin
        .from('dm_conversations')
        .insert({ artist_id: artistId, fan_id: sub.fan_id, fan_tier_rank: rank, fan_tier_name: name })
        .select('id')
        .single();
      if (!created) continue;
      conversationId = created.id;
    }

    const { error: msgErr } = await supabaseAdmin.from('dm_messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      sender_is_artist: true,
      body: text,
    });
    if (msgErr) continue;

    await supabaseAdmin
      .from('dm_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: preview,
        last_sender_is_artist: true,
        fan_unread: fanUnread + 1,
        fan_tier_rank: rank,
        fan_tier_name: name,
      })
      .eq('id', conversationId);

    sent++;
  }

  // Notify all recipients (best-effort).
  try {
    const { data: p } = await supabaseAdmin.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    const senderName = p?.display_name || 'Artist';
    const notes = subs.map((s) => ({
      user_id: s.fan_id,
      type: 'direct_message',
      title: `New message from ${senderName}`,
      message: preview,
      link: '/messages',
    }));
    await supabaseAdmin.from('notifications').insert(notes);
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ sent });
}
