import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

// Persists the setup wizard's profile photo (profiles.avatar_url) server-side.
// The photo step is MANDATORY, and the browser cannot update `profiles` until
// schema-phase2-fix-profiles-update-permission.sql is applied (the UPDATE
// policy's WITH CHECK subquery reads a revoked column and 42501s every
// client-side profiles save). Auth is enforced explicitly below — the admin
// client bypasses RLS and middleware skips /api routes. The route only ever
// writes the CALLER's own row, and only accepts a URL inside the caller's own
// avatars folder, so it grants nothing the old client-side update didn't.
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { avatarUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const avatarUrl = (body.avatarUrl || '').trim();
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
  const ownFolder = `${baseUrl}/storage/v1/object/public/avatars/${user.id}/`;
  if (!avatarUrl.startsWith(ownFolder)) {
    return NextResponse.json(
      { error: 'invalid_url', message: 'Avatar must be an upload to your own avatars folder.' },
      { status: 400 }
    );
  }

  const supabaseAdmin = createClient(
    baseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id);

  if (error) {
    console.error('Onboarding avatar save failed:', error);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
