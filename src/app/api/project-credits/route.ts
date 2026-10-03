// /api/project-credits: the signed-in fan's OWN credits on one project, and the one choice they
// make about them (the name printed, and whether it is printed at all).
//
// Authority is the session, nothing else: the fan is read from the cookie, a credit is only ever
// updated WHERE fan_id = that user, and the body names a credit id that is matched against the
// fan's own rows. project_credits is closed to browser roles, so this route is the only writer of
// a name. Rules: src/lib/projectCredits/credits.ts.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { cleanCreditName, creditStands } from '@/lib/projectCredits/credits';
import { loadFanCredits } from '@/lib/projectCredits/server';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const UUID = /^[0-9a-f-]{36}$/i;

async function sessionUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET(req: NextRequest) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ credits: [] });
  const album = req.nextUrl.searchParams.get('album') || '';
  if (!UUID.test(album)) return NextResponse.json({ error: 'Missing project' }, { status: 400 });

  const rows = await loadFanCredits(admin, user.id, album);
  return NextResponse.json({
    credits: rows.map((r) => ({
      id: r.id,
      level: r.level,
      number: r.credit_number,
      name: r.credit_name,
      listed: r.listed,
      standing: creditStands(r),
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  if (!(await checkRateLimit(user.id, 'project-credit-name', 60, 20))) {
    return NextResponse.json({ error: 'Too many changes. Try again in a minute.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const creditId = typeof body?.creditId === 'string' && UUID.test(body.creditId) ? body.creditId : null;
  if (!creditId) return NextResponse.json({ error: 'Missing credit' }, { status: 400 });
  const listed = body?.listed === true;
  const name = body?.name == null || body.name === '' ? null : cleanCreditName(body.name);
  if (body?.name && !name) {
    return NextResponse.json(
      { error: 'Use a name of up to 40 characters, with no email, link or phone number.' },
      { status: 400 },
    );
  }
  if (listed && !name) return NextResponse.json({ error: 'Add the name to print first.' }, { status: 400 });

  const { data, error } = await admin
    .from('project_credits')
    .update({ credit_name: name, listed, updated_at: new Date().toISOString() })
    .eq('id', creditId)
    .eq('fan_id', user.id)
    .select('id')
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Credit not found' }, { status: 404 });
  return NextResponse.json({ ok: true, name, listed });
}
