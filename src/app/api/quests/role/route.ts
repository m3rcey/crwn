import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { FAN_ROLE_MAP } from '@/lib/quests/fanRoles';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// POST /api/quests/role — set the fan's primary global role. Only selectable roles
// can be picked; the rest are earned through quests. Stored on the global
// user_progression row (artist_id NULL, role 'fan').
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const roleId = body?.role as string | undefined;
  const def = roleId ? FAN_ROLE_MAP[roleId] : undefined;
  if (!def || !def.selectable) {
    return NextResponse.json({ error: 'Unknown or non-selectable role' }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from('user_progression')
    .select('id')
    .eq('user_id', user.id)
    .is('artist_id', null)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('user_progression')
      .update({ fan_role: roleId, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabaseAdmin.from('user_progression').insert({
      user_id: user.id,
      artist_id: null,
      scope: 'global',
      role: 'fan',
      fan_role: roleId,
    });
  }

  return NextResponse.json({ ok: true, role: roleId });
}
