import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ARTIST_BUILD_MAP } from '@/lib/quests/builds';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// POST /api/quests/build — set the signed-in artist's Rise Mode build(s).
// Stored on their GLOBAL user_progression row (artist_id NULL, role 'artist').
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Must be an artist (owns an artist_profiles row).
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!artist) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const primary = body?.primary as string | undefined;
  const secondary = (body?.secondary as string | null | undefined) ?? null;
  if (!primary || !ARTIST_BUILD_MAP[primary]) {
    return NextResponse.json({ error: 'Unknown build' }, { status: 400 });
  }
  if (secondary && !ARTIST_BUILD_MAP[secondary]) {
    return NextResponse.json({ error: 'Unknown secondary build' }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from('user_progression')
    .select('id')
    .eq('user_id', user.id)
    .is('artist_id', null)
    .maybeSingle();

  const patch = {
    artist_build_primary: primary,
    artist_build_secondary: secondary,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabaseAdmin.from('user_progression').update(patch).eq('id', existing.id);
  } else {
    await supabaseAdmin.from('user_progression').insert({
      user_id: user.id,
      artist_id: null,
      scope: 'global',
      role: 'artist',
      ...patch,
    });
  }

  return NextResponse.json({ ok: true, primary, secondary });
}
