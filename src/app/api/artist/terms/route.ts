import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  ARTIST_TERMS_VERSION,
  LAUNCH_ADDENDUM_VERSION,
  appendAcceptance,
  artistTermsStatus,
  cleanSignature,
} from '@/lib/legal/artistTerms';

// The artist content terms: who owes them, and the one place an acceptance is recorded.
//
// Authority is the SESSION user and nothing in the request: the body carries only the typed
// name and the two ticks. The record goes to auth app_metadata through the service role, which
// is the only role that can write it, so an acceptance cannot be forged from the browser and a
// user can only ever accept for themselves. See src/lib/legal/artistTerms.ts.

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function resolve() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Service role for both reads: launch_partner may not be readable by the browser roles, and
  // the metadata must be FRESH (the session's JWT copy lags an acceptance until it refreshes).
  const [{ data: artist }, { data: fresh }] = await Promise.all([
    admin.from('artist_profiles').select('id, launch_partner').eq('user_id', user.id).maybeSingle(),
    admin.auth.admin.getUserById(user.id),
  ]);
  const appMetadata = fresh?.user?.app_metadata ?? user.app_metadata ?? {};
  const status = artistTermsStatus(appMetadata, { isArtist: !!artist, launchPartner: artist?.launch_partner === true });
  return { user, appMetadata, status };
}

export async function GET() {
  const r = await resolve();
  if (!r) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ ...r.status, version: ARTIST_TERMS_VERSION });
}

export async function POST(req: NextRequest) {
  const r = await resolve();
  if (!r) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!r.status.required) return NextResponse.json({ ok: true, ...r.status });

  const body = await req.json().catch(() => ({}));
  const name = cleanSignature(body?.name);
  if (!name) return NextResponse.json({ error: 'Type your full name to sign.' }, { status: 400 });
  // The terms tick is always required: every recorded entry says this version was accepted.
  if (body?.acceptTerms !== true) {
    return NextResponse.json({ error: 'Check the box to accept the artist terms.' }, { status: 400 });
  }
  if (r.status.needsAddendum && body?.acceptAddendum !== true) {
    return NextResponse.json({ error: 'Check the box to accept the launch terms.' }, { status: 400 });
  }

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || null;
  const next = appendAcceptance((r.appMetadata as { artist_terms?: unknown }).artist_terms, {
    version: ARTIST_TERMS_VERSION,
    launchAddendumVersion: r.status.needsAddendum || body?.acceptAddendum === true ? LAUNCH_ADDENDUM_VERSION : null,
    acceptedAt: new Date().toISOString(),
    name,
    ip: ip ? ip.slice(0, 64) : null,
    userAgent: req.headers.get('user-agent')?.slice(0, 300) || null,
  });
  const { error } = await admin.auth.admin.updateUserById(r.user.id, {
    app_metadata: { ...(r.appMetadata as Record<string, unknown>), artist_terms: next },
  });
  if (error) return NextResponse.json({ error: 'Could not record your acceptance. Try again.' }, { status: 500 });
  return NextResponse.json({ ok: true, needsTerms: false, needsAddendum: false, required: false });
}
