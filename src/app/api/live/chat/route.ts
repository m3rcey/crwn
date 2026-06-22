import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Re-runs the same gate as the token route, so only fans who can watch can post.
async function canParticipate(userId: string, sessionId: string) {
  const { data: session } = await supabaseAdmin
    .from('live_sessions')
    .select('id, artist_id, status, is_free, allowed_tier_ids')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.status !== 'live') return { ok: false as const, session: null };

  // Artist owner always allowed.
  const { data: owned } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('id', session.artist_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (owned) return { ok: true as const, session };

  if (session.is_free) return { ok: true as const, session };

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('tier_id')
    .eq('fan_id', userId)
    .eq('artist_id', session.artist_id)
    .eq('status', 'active')
    .maybeSingle();
  const allowed: string[] = Array.isArray(session.allowed_tier_ids) ? session.allowed_tier_ids : [];
  if (sub?.tier_id && allowed.includes(sub.tier_id)) return { ok: true as const, session };
  return { ok: false as const, session: null };
}

// POST — send a chat message.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId, body } = await req.json().catch(() => ({ sessionId: null, body: null }));
  const text = typeof body === 'string' ? body.trim() : '';
  if (!sessionId || !text) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  if (text.length > 500) return NextResponse.json({ error: 'Message too long' }, { status: 400 });

  const allowed = await checkRateLimit(user.id, 'live-chat', 60, 30);
  if (!allowed) return NextResponse.json({ error: 'Slow down' }, { status: 429 });

  const gate = await canParticipate(user.id, sessionId);
  if (!gate.ok) return NextResponse.json({ error: 'locked' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('live_session_messages')
    .insert({ session_id: sessionId, user_id: user.id, body: text })
    .select('id, session_id, user_id, body, is_deleted, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: data });
}

// PATCH — soft-delete a message (author or session-owning artist).
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { messageId } = await req.json().catch(() => ({ messageId: null }));
  if (!messageId) return NextResponse.json({ error: 'Missing messageId' }, { status: 400 });

  const { data: msg } = await supabaseAdmin
    .from('live_session_messages')
    .select('id, user_id, session_id')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let canDelete = msg.user_id === user.id;
  if (!canDelete) {
    const { data: session } = await supabaseAdmin
      .from('live_sessions')
      .select('artist_id')
      .eq('id', msg.session_id)
      .maybeSingle();
    if (session) {
      const { data: owned } = await supabaseAdmin
        .from('artist_profiles')
        .select('id')
        .eq('id', session.artist_id)
        .eq('user_id', user.id)
        .maybeSingle();
      canDelete = !!owned;
    }
  }
  if (!canDelete) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { error } = await supabaseAdmin
    .from('live_session_messages')
    .update({ is_deleted: true })
    .eq('id', messageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
