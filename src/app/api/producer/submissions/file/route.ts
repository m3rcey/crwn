import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSignedDownloadUrl } from '@/lib/r2/client';
import { ownsSession } from '@/lib/producer/access';

// Signed playback/download URL for a submission's uploaded file. Reachable only by
// the owning artist or the fan who submitted it. The R2 object is private, so this
// route IS the only way to it.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data: sub } = await supabaseAdmin
    .from('session_submissions')
    .select('id, session_id, fan_id, file_key, file_name')
    .eq('id', id)
    .maybeSingle();
  if (!sub || !sub.file_key) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const isFan = sub.fan_id === user.id;
  const isOwner = !isFan && !!(await ownsSession(supabaseAdmin, sub.session_id, user.id));
  if (!isFan && !isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const wantsDownload = req.nextUrl.searchParams.get('download') === '1';
  const filename = wantsDownload
    ? (sub.file_name || 'submission').replace(/[^a-zA-Z0-9 ._-]/g, '_')
    : undefined;

  const url = await getSignedDownloadUrl(sub.file_key, 3600, filename);
  return NextResponse.json({ url });
}
