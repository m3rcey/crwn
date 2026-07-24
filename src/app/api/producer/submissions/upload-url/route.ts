import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSignedUploadUrl } from '@/lib/r2/client';
import { checkRateLimit } from '@/lib/rateLimit';
import { canSubmitToSession, MAX_SUBMISSION_FILE_BYTES } from '@/lib/producer/access';

// Mints a signed PUT URL so a FAN's browser uploads a submission (a beat, a vocal)
// straight to PRIVATE R2. Bytes never pass through our server. The key is scoped
// to the session + fan; the file is only ever handed back through a signed URL to
// the owning artist or the submitting fan (never a public URL).
//
// Gated by canSubmitToSession: dark-launch flag on, session accepts submissions,
// deadline open, and the fan actually has access to the session.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 120) || 'file';
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId, filename, contentType, fileSize } = await req.json().catch(() => ({}));
  if (!sessionId || !filename || !contentType) {
    return NextResponse.json({ error: 'Missing sessionId, filename, or contentType' }, { status: 400 });
  }
  if (typeof fileSize === 'number' && fileSize > MAX_SUBMISSION_FILE_BYTES) {
    return NextResponse.json({ error: 'File too large (max 100MB)' }, { status: 400 });
  }

  const limited = !(await checkRateLimit(user.id, 'producer-submit', 3600, 20));
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const gate = await canSubmitToSession(supabaseAdmin, sessionId, user.id);
  if (!gate.ok) {
    const status = gate.reason === 'no_access' ? 403 : gate.reason === 'not_found' ? 404 : 409;
    return NextResponse.json({ error: gate.reason }, { status });
  }

  // Private, fan-scoped key. Not derived from the public R2 URL base, so it can
  // only be reached through the signed-download route.
  const key = `producer-submissions/${sessionId}/${user.id}/${Date.now()}-${sanitize(filename)}`;
  const uploadUrl = await getSignedUploadUrl(key, contentType, 600);

  return NextResponse.json({ uploadUrl, key });
}
