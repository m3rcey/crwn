import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { resend, FROM_EMAIL } from '@/lib/resend';

// The founder's side of the support chat (admin console, Support tab).
// GET  (no params)          -> conversation list, escalated first
// GET  ?conversationId=<id> -> full thread
// POST { conversationId, action: 'reply', body } -> send a human reply
// POST { conversationId, action: 'close' }       -> close the thread

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://thecrwn.app';

const STATUS_ORDER: Record<string, number> = { human_requested: 0, human_active: 1, ai: 2, closed: 3 };

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const conversationId = new URL(req.url).searchParams.get('conversationId');

  if (conversationId) {
    const { data: messages, error } = await supabaseAdmin
      .from('support_messages')
      .select('id, sender, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Opening a thread clears its unread count.
    await supabaseAdmin.from('support_conversations').update({ founder_unread: 0 }).eq('id', conversationId);
    return NextResponse.json({ messages: messages || [] });
  }

  const { data: conversations, error } = await supabaseAdmin
    .from('support_conversations')
    .select('id, user_id, status, last_message_at, last_message_preview, founder_unread, escalated_at, created_at')
    .order('last_message_at', { ascending: false })
    .limit(100);
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ unavailable: true, conversations: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = Array.from(new Set((conversations || []).map((c) => c.user_id)));
  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from('profiles').select('id, display_name, email, role').in('id', userIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  const list = (conversations || [])
    .map((c) => ({
      ...c,
      user_name: profileMap.get(c.user_id)?.display_name || 'Unknown user',
      user_email: profileMap.get(c.user_id)?.email || null,
      user_role: profileMap.get(c.user_id)?.role || 'fan',
    }))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  return NextResponse.json({ conversations: list });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  let body: { conversationId?: string; action?: 'reply' | 'close'; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (!body.conversationId) return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });

  const { data: conversation } = await supabaseAdmin
    .from('support_conversations')
    .select('id, user_id, status')
    .eq('id', body.conversationId)
    .maybeSingle();
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  if (body.action === 'close') {
    await supabaseAdmin
      .from('support_conversations')
      .update({ status: 'closed', founder_unread: 0 })
      .eq('id', conversation.id);
    return NextResponse.json({ success: true });
  }

  const text = (body.body || '').trim().slice(0, 4000);
  if (!text) return NextResponse.json({ error: 'Message required' }, { status: 400 });

  await supabaseAdmin.from('support_messages').insert({
    conversation_id: conversation.id,
    sender: 'human',
    body: text,
  });
  await supabaseAdmin
    .from('support_conversations')
    .update({
      status: 'human_active',
      founder_unread: 0,
      last_message_at: new Date().toISOString(),
      last_message_preview: text.slice(0, 140),
    })
    .eq('id', conversation.id);

  // Tell the user a reply landed, in case they left the page. Never blocks the send.
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name, email')
      .eq('id', conversation.user_id)
      .maybeSingle();
    if (profile?.email) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: profile.email,
        subject: 'CRWN support replied to you',
        text: [
          `Hi ${profile.display_name || 'there'},`,
          '',
          'A member of the CRWN team replied to your support chat:',
          '',
          text,
          '',
          `Continue the conversation: ${APP_URL}/support`,
        ].join('\n'),
      });
    }
  } catch (err) {
    console.error('[admin-support-chat] reply notification failed:', err);
  }

  return NextResponse.json({ success: true });
}
