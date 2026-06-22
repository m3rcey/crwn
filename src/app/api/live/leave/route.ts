import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Free the caller's slot when they leave the room (unmount / beforeunload).
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await req.json().catch(() => ({ sessionId: null }));
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });

  await supabaseAdmin
    .from('live_session_participants')
    .update({ left_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .is('left_at', null);

  return NextResponse.json({ ok: true });
}
