import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { notifyNewMessage } from '@/lib/notifications';
import {
  getOwnedArtistIds,
  fanCanMessage,
  resolveFanTier,
  messagingEnabledTierIds,
} from '@/lib/messaging';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Look up a profile's display name (falls back to a generic label).
async function nameOf(userId: string, fallback = 'Fan'): Promise<string> {
  const { data } = await supabaseAdmin.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  return data?.display_name || fallback;
}

// GET /api/messages
//   ?artistId=<id> | ?slug=<slug>  -> gate info for the fan toward one artist
//   (no params)                    -> the current user's full conversation list
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const artistIdParam = searchParams.get('artistId');
  const slugParam = searchParams.get('slug');

  // ---- Single-artist gate check (fan-facing "Message" button) ----
  if (artistIdParam || slugParam) {
    let artistId = artistIdParam;
    if (!artistId && slugParam) {
      const { data: a } = await supabaseAdmin
        .from('artist_profiles')
        .select('id')
        .eq('slug', slugParam)
        .maybeSingle();
      artistId = a?.id ?? null;
    }
    if (!artistId) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    // Artist display name (for the thread header on a brand-new conversation).
    const { data: artistRow } = await supabaseAdmin
      .from('artist_profiles')
      .select('user_id')
      .eq('id', artistId)
      .maybeSingle();
    const artistName = artistRow?.user_id ? await nameOf(artistRow.user_id, 'Artist') : 'Artist';

    const gate = await fanCanMessage(supabaseAdmin, artistId, user.id);
    const enabledTierIds = gate.ok ? [] : await messagingEnabledTierIds(supabaseAdmin, artistId);

    let conversationId: string | null = null;
    if (gate.ok) {
      const { data: conv } = await supabaseAdmin
        .from('dm_conversations')
        .select('id')
        .eq('artist_id', artistId)
        .eq('fan_id', user.id)
        .maybeSingle();
      conversationId = conv?.id ?? null;
    }

    return NextResponse.json({
      canMessage: gate.ok,
      reason: gate.reason,
      artistId,
      artistName,
      conversationId,
      enabledTierIds,
    });
  }

  // ---- Full conversation list (works whether user is a fan, an artist, or both) ----
  const ownedArtistIds = await getOwnedArtistIds(supabaseAdmin, user.id);

  // Conversations where I'm the fan
  const { data: asFan } = await supabaseAdmin
    .from('dm_conversations')
    .select('*')
    .eq('fan_id', user.id)
    .order('last_message_at', { ascending: false });

  // Conversations where I'm the artist
  let asArtist: any[] = [];
  if (ownedArtistIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('dm_conversations')
      .select('*')
      .in('artist_id', ownedArtistIds)
      // priority: higher tier first, then most recent
      .order('fan_tier_rank', { ascending: false })
      .order('last_message_at', { ascending: false });
    asArtist = data || [];
  }

  // Resolve the "other party" label for each conversation.
  const fanConvos = await Promise.all((asFan || []).map(async (c) => {
    const { data: artist } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, slug, user_id')
      .eq('id', c.artist_id)
      .maybeSingle();
    const otherName = artist ? await nameOf(artist.user_id, 'Artist') : 'Artist';
    return {
      id: c.id,
      role: 'fan' as const,
      otherName,
      otherSlug: artist?.slug ?? null,
      unread: c.fan_unread,
      lastPreview: c.last_message_preview,
      lastMessageAt: c.last_message_at,
      lastSenderIsArtist: c.last_sender_is_artist,
      muted: false,
      tierName: c.fan_tier_name,
    };
  }));

  const artistConvos = await Promise.all(asArtist.map(async (c) => ({
    id: c.id,
    role: 'artist' as const,
    otherName: await nameOf(c.fan_id, 'Fan'),
    otherSlug: null,
    unread: c.artist_unread,
    lastPreview: c.last_message_preview,
    lastMessageAt: c.last_message_at,
    lastSenderIsArtist: c.last_sender_is_artist,
    muted: c.muted_by_artist,
    tierName: c.fan_tier_name,
  })));

  return NextResponse.json({
    conversations: [...artistConvos, ...fanConvos],
    isArtist: ownedArtistIds.length > 0,
  });
}

// POST /api/messages  — send a message.
//   body: { conversationId?, artistId?, body }
//   - artistId: fan starting/continuing a thread with that artist
//   - conversationId: reply within an existing thread (fan or artist)
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId, artistId, body } = await req.json().catch(() => ({}));
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return NextResponse.json({ error: 'Empty message' }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: 'Message too long' }, { status: 400 });

  const allowed = await checkRateLimit(user.id, 'direct-message', 60, 20);
  if (!allowed) return NextResponse.json({ error: 'Slow down' }, { status: 429 });

  // Resolve the conversation + who the sender is.
  let convo: any = null;
  if (conversationId) {
    const { data } = await supabaseAdmin.from('dm_conversations').select('*').eq('id', conversationId).maybeSingle();
    convo = data;
    if (!convo) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const ownedArtistIds = await getOwnedArtistIds(supabaseAdmin, user.id);

  let resolvedArtistId: string;
  let senderIsArtist: boolean;

  if (convo) {
    const isFan = convo.fan_id === user.id;
    const isArtist = ownedArtistIds.includes(convo.artist_id);
    if (!isFan && !isArtist) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    resolvedArtistId = convo.artist_id;
    senderIsArtist = isArtist;
  } else {
    // New thread initiated by a fan toward `artistId`.
    if (!artistId) return NextResponse.json({ error: 'Missing target' }, { status: 400 });
    resolvedArtistId = artistId;
    senderIsArtist = ownedArtistIds.includes(artistId); // artist DMing on their own page = artist
  }

  // Gate fan senders. Artists replying/initiating on their own page are always allowed.
  let tierRank = 0;
  let tierName: string | null = null;
  if (!senderIsArtist) {
    const gate = await fanCanMessage(supabaseAdmin, resolvedArtistId, user.id);
    if (!gate.ok) return NextResponse.json({ error: 'locked', reason: gate.reason }, { status: 403 });
    tierRank = gate.tierRank;
    tierName = gate.tierName;
  } else if (convo) {
    tierRank = convo.fan_tier_rank;
    tierName = convo.fan_tier_name;
  }

  // Ensure the conversation row exists (upsert on the unique pair).
  if (!convo) {
    const fanId = senderIsArtist ? null : user.id;
    if (!fanId) return NextResponse.json({ error: 'Artist cannot open a thread without a fan' }, { status: 400 });
    const { data: existing } = await supabaseAdmin
      .from('dm_conversations')
      .select('*')
      .eq('artist_id', resolvedArtistId)
      .eq('fan_id', fanId)
      .maybeSingle();
    if (existing) {
      convo = existing;
    } else {
      const { data: created, error: createErr } = await supabaseAdmin
        .from('dm_conversations')
        .insert({ artist_id: resolvedArtistId, fan_id: fanId, fan_tier_rank: tierRank, fan_tier_name: tierName })
        .select('*')
        .single();
      if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
      convo = created;
    }
  }

  // Insert the message.
  const { data: message, error: msgErr } = await supabaseAdmin
    .from('dm_messages')
    .insert({
      conversation_id: convo.id,
      sender_id: user.id,
      sender_is_artist: senderIsArtist,
      body: text,
    })
    .select('id, conversation_id, sender_id, sender_is_artist, body, is_deleted, created_at')
    .single();
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  // Update conversation: bump the recipient's unread, refresh preview + tier snapshot.
  const preview = text.length > 120 ? `${text.slice(0, 117)}...` : text;
  const update: Record<string, any> = {
    last_message_at: message.created_at,
    last_message_preview: preview,
    last_sender_is_artist: senderIsArtist,
    fan_tier_rank: tierRank,
    fan_tier_name: tierName,
  };
  if (senderIsArtist) update.fan_unread = (convo.fan_unread ?? 0) + 1;
  else update.artist_unread = (convo.artist_unread ?? 0) + 1;
  await supabaseAdmin.from('dm_conversations').update(update).eq('id', convo.id);

  // Notify the recipient (skip if the artist has muted this fan).
  try {
    const senderName = await nameOf(user.id, senderIsArtist ? 'Artist' : 'Fan');
    if (senderIsArtist) {
      await notifyNewMessage(supabaseAdmin, convo.fan_id, senderName, preview, '/messages');
    } else if (!convo.muted_by_artist) {
      const { data: artist } = await supabaseAdmin
        .from('artist_profiles')
        .select('user_id')
        .eq('id', resolvedArtistId)
        .maybeSingle();
      if (artist?.user_id) await notifyNewMessage(supabaseAdmin, artist.user_id, senderName, preview, '/messages');
    }
  } catch {
    /* notification failures must not block the send */
  }

  return NextResponse.json({ message, conversationId: convo.id });
}
