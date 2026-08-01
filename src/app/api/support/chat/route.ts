import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { SUPPORT_ASSISTANT_PROMPT } from '@/lib/supportKnowledge';

// The /support chat. Users talk to a CRWN AI assistant; when it cannot answer (or the
// user asks for a person) the conversation escalates: status flips to human_requested,
// the founder gets an email, and replies then come from the admin Support tab.
//
// Writes are service-role only (the tables have no client write policies). Reads for
// the chat UI also come through here, so the page works before realtime kicks in.
// If the migration has not run yet (42P01), every response carries { unavailable: true }
// and the page falls back to the contact form: ship-safe pre-migration.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'dummy-key-for-build',
  baseURL: 'https://api.deepseek.com',
  timeout: 30000,
});

const FOUNDER_EMAIL = 'joshn.wms@gmail.com';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://thecrwn.app';
const ESCALATED_REPLY =
  'A real person from CRWN has been notified and will reply right here in this chat. You can close this page; your conversation is saved on the Support page.';

// Shown when the ASSISTANT itself is unavailable (no key, API rejected us). The
// thread stays open to the AI so it recovers on its own once the fault is fixed,
// which is why this wording does not promise that only a human will reply.
const SYSTEM_FAULT_REPLY =
  'Our assistant is having trouble right now, so a real person from CRWN has been notified and will reply here. Keep typing if you want to add anything; your conversation is saved on the Support page.';

// Sent when a human already owns the thread. Without it a follow-up message got
// stored and answered with total silence, which reads as a broken product.
const HUMAN_OWNED_ACK =
  'Got it, that has been added to the thread. A real person from CRWN has it and will reply right here.';

type Message = { id: string; sender: 'user' | 'ai' | 'human'; body: string; created_at: string };

function missingTable(err: { code?: string } | null): boolean {
  return err?.code === '42P01';
}

async function loadConversation(userId: string, conversationId: string | null) {
  let query = supabaseAdmin
    .from('support_conversations')
    .select('id, status, user_id')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false })
    .limit(1);
  if (conversationId) {
    query = supabaseAdmin
      .from('support_conversations')
      .select('id, status, user_id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .limit(1);
  }
  const { data, error } = await query;
  return { conversation: data?.[0] ?? null, error };
}

async function loadMessages(conversationId: string): Promise<Message[]> {
  const { data } = await supabaseAdmin
    .from('support_messages')
    .select('id, sender, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200);
  return (data as Message[]) || [];
}

async function touchConversation(conversationId: string, preview: string, patch: Record<string, unknown> = {}) {
  await supabaseAdmin
    .from('support_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview.slice(0, 140),
      ...patch,
    })
    .eq('id', conversationId);
}

// House pattern for founder alerts: text-only, try/catch, never blocks the response.
async function alertFounderEscalation(
  userId: string,
  lastMessages: Message[],
  reason: string
): Promise<void> {
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name, email')
      .eq('id', userId)
      .maybeSingle();
    const transcript = lastMessages
      .slice(-6)
      .map((m) => `${m.sender === 'user' ? 'User' : m.sender === 'ai' ? 'AI' : 'You'}: ${m.body}`)
      .join('\n');
    await resend.emails.send({
      from: FROM_EMAIL,
      to: FOUNDER_EMAIL,
      subject: `CRWN support chat needs you: ${profile?.display_name || 'a user'}`,
      text: [
        `${profile?.display_name || 'A user'} (${profile?.email || 'no email'}) needs a human in the support chat.`,
        `Reason: ${reason}`,
        '',
        transcript,
        '',
        `Reply here: ${APP_URL}/admin?tab=support`,
      ].join('\n'),
    });
  } catch (err) {
    console.error('[support-chat] alertFounderEscalation failed:', err);
  }
}

/**
 * Bring a human in.
 *
 * `lockThread` decides whether the AI steps back permanently. A DELIBERATE
 * escalation (the user asked, or the assistant judged it needs a person) locks
 * the thread: the AI must not talk over a human who is about to reply. A SYSTEM
 * failure (no API key, the API rejected us) must NOT lock it, or one bad deploy
 * disables AI help on that conversation forever. Josh hit exactly that: his
 * first message escalated on a config fault, and every later message then
 * returned silence because the thread was stuck human-owned.
 */
async function escalate(
  userId: string,
  conversationId: string,
  currentStatus: string,
  reason: string,
  { lockThread = true }: { lockThread?: boolean } = {},
) {
  if (currentStatus !== 'ai' && currentStatus !== 'closed') return; // already with a human
  await supabaseAdmin.from('support_messages').insert({
    conversation_id: conversationId,
    sender: 'ai',
    body: lockThread ? ESCALATED_REPLY : SYSTEM_FAULT_REPLY,
  });
  await touchConversation(
    conversationId,
    lockThread ? ESCALATED_REPLY : SYSTEM_FAULT_REPLY,
    lockThread
      ? { status: 'human_requested', escalated_at: new Date().toISOString() }
      : { escalated_at: new Date().toISOString() },
  );
  const messages = await loadMessages(conversationId);
  await alertFounderEscalation(userId, messages, reason);
}

async function askAssistant(history: Message[]): Promise<{ reply: string; needsHuman: boolean }> {
  const chatHistory = history.slice(-20).map((m) => ({
    role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
    content: m.sender === 'human' ? `[CRWN team member] ${m.body}` : m.body,
  }));
  const response = await deepseek.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: 800,
    temperature: 0.3,
    messages: [{ role: 'system', content: SUPPORT_ASSISTANT_PROMPT }, ...chatHistory],
  });
  const raw = response.choices[0]?.message?.content || '';
  try {
    const parsed = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    if (typeof parsed.reply === 'string' && parsed.reply.trim()) {
      return { reply: parsed.reply.trim(), needsHuman: parsed.needs_human === true };
    }
  } catch {
    // Unparseable but non-empty output is still a usable answer.
  }
  if (raw.trim()) return { reply: raw.trim(), needsHuman: false };
  return { reply: '', needsHuman: true };
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const conversationId = new URL(req.url).searchParams.get('conversationId');
  const { conversation, error } = await loadConversation(user.id, conversationId);
  if (missingTable(error)) return NextResponse.json({ unavailable: true });
  if (!conversation) return NextResponse.json({ conversation: null, messages: [] });

  const messages = await loadMessages(conversation.id);
  return NextResponse.json({
    conversation: { id: conversation.id, status: conversation.status },
    messages,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowed = await checkRateLimit(user.id, 'support-chat', 60, 15);
  if (!allowed) return NextResponse.json({ error: 'Slow down a moment, then try again.' }, { status: 429 });

  let body: { message?: string; conversationId?: string; action?: 'send' | 'escalate' | 'new_thread' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const action =
    body.action === 'escalate' ? 'escalate' : body.action === 'new_thread' ? 'new_thread' : 'send';
  const text = (body.message || '').trim().slice(0, 2000);
  if (action === 'send' && !text) return NextResponse.json({ error: 'Message required' }, { status: 400 });

  // Resolve or create the conversation.
  const { conversation: existing, error: loadErr } = await loadConversation(user.id, body.conversationId || null);
  if (missingTable(loadErr)) return NextResponse.json({ unavailable: true });

  // Start a fresh thread. Without this, one escalation was a permanent dead end:
  // the support page always resumes the newest conversation, and a human-owned
  // conversation never returns to the assistant, so a user who was escalated once
  // could never reach the AI again. Closing is enough, because the create path
  // below already opens a new conversation whenever the latest one is closed.
  if (action === 'new_thread') {
    if (existing && existing.status !== 'closed') {
      await supabaseAdmin
        .from('support_conversations')
        .update({ status: 'closed' })
        .eq('id', existing.id)
        .eq('user_id', user.id);
    }
    const { data: created, error: createErr } = await supabaseAdmin
      .from('support_conversations')
      .insert({ user_id: user.id })
      .select('id, status, user_id')
      .single();
    if (missingTable(createErr)) return NextResponse.json({ unavailable: true });
    if (createErr || !created) {
      return NextResponse.json({ error: 'Could not start a new chat.' }, { status: 500 });
    }
    return NextResponse.json({ conversation: { id: created.id, status: created.status }, messages: [] });
  }

  let conversation = existing;
  if (!conversation || conversation.status === 'closed') {
    const { data: created, error: createErr } = await supabaseAdmin
      .from('support_conversations')
      .insert({ user_id: user.id })
      .select('id, status, user_id')
      .single();
    if (missingTable(createErr)) return NextResponse.json({ unavailable: true });
    if (createErr || !created) {
      return NextResponse.json({ error: 'Could not start the chat. Use the form below instead.' }, { status: 500 });
    }
    conversation = created;
  }

  if (action === 'escalate') {
    await escalate(user.id, conversation.id, conversation.status, 'User asked for a human.');
  } else {
    await supabaseAdmin.from('support_messages').insert({
      conversation_id: conversation.id,
      sender: 'user',
      body: text,
    });

    if (conversation.status === 'human_requested' || conversation.status === 'human_active') {
      // A human owns this thread: store it and bump the founder's unread. The AI
      // stays quiet so it never talks over a person who is about to reply, but
      // the user gets an acknowledgment. Returning nothing at all read as a dead
      // chat: you type, and the screen does not change.
      const { data: row } = await supabaseAdmin
        .from('support_conversations')
        .select('founder_unread')
        .eq('id', conversation.id)
        .maybeSingle();
      await supabaseAdmin.from('support_messages').insert({
        conversation_id: conversation.id,
        sender: 'ai',
        body: HUMAN_OWNED_ACK,
      });
      await touchConversation(conversation.id, HUMAN_OWNED_ACK, {
        founder_unread: (row?.founder_unread ?? 0) + 1,
      });
    } else {
      await touchConversation(conversation.id, text);
      if (!process.env.DEEPSEEK_API_KEY) {
        // No AI configured: alert a person, but do NOT lock the thread. Setting
        // the key later must be enough to make this conversation work again.
        await escalate(
          user.id,
          conversation.id,
          conversation.status,
          'AI is not configured (DEEPSEEK_API_KEY unset).',
          { lockThread: false },
        );
      } else {
        try {
          const history = await loadMessages(conversation.id);
          const { reply, needsHuman } = await askAssistant(history);
          if (reply) {
            await supabaseAdmin.from('support_messages').insert({
              conversation_id: conversation.id,
              sender: 'ai',
              body: reply,
            });
            await touchConversation(conversation.id, reply);
          }
          if (needsHuman) {
            await escalate(user.id, conversation.id, 'ai', 'The AI assistant flagged this for a human.');
          }
        } catch (err) {
          console.error('[support-chat] assistant error:', err);
          // Name the actual failure. "AI call failed." threw away the one detail
          // that says what to fix: an invalid key, an exhausted DeepSeek balance
          // (402, common on a new key) and a timeout all looked identical, so the
          // founder alert could not tell you which. The reason goes to the
          // escalation email only, never to the user.
          const detail =
            err && typeof err === 'object' && 'status' in err
              ? `HTTP ${(err as { status?: number }).status} ${(err as { message?: string }).message ?? ''}`
              : err instanceof Error
                ? err.message
                : String(err);
          await escalate(
            user.id,
            conversation.id,
            conversation.status,
            `AI call failed: ${detail.slice(0, 300)}`,
            // Transient by assumption: an outage or an exhausted balance must not
            // permanently take the assistant off this conversation.
            { lockThread: false },
          );
        }
      }
    }
  }

  const { conversation: fresh } = await loadConversation(user.id, conversation.id);
  const messages = await loadMessages(conversation.id);
  return NextResponse.json({
    conversation: { id: conversation.id, status: fresh?.status ?? conversation.status },
    messages,
  });
}
