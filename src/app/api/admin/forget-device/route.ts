// POST /api/admin/forget-device — erase THIS device's anonymous metric history.
//
// The founder-analytics cleanup (supabase/cleanup-founder-analytics.sql) removed every row
// attributable to a founder ACCOUNT, but anonymous rows only carry visitor_hash, a one-way
// SHA-256 of IP+UA. No SQL run after the fact can name those hashes. The device itself can:
// when it makes this request, hashVisitor() computes the exact hash its past anonymous visits
// were stored under (same IP, same user agent), and every row carrying it is deleted.
//
// So the founder opens /admin/forget-device once per device per network they browse from, and
// that device's history under its CURRENT identity is gone. History under an old IP or an old
// browser version stays; it is unattributable by design, and that limit is stated on the page.
//
// The optional anonId (the durable crwn_aid the client reads from ITS OWN storage) additionally
// clears funnel rows stitched to that browser. It only ever selects rows to DELETE, never rows
// to read, so a forged id cannot leak anything; and only an admin session reaches this at all.
//
// The response also stamps the crwn_dnt cookie (src/lib/analytics/doNotTrack.ts), so forgetting
// a device and excluding it going forward are one visit.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { hashVisitor } from '@/lib/analytics/visitorHash';
import { DNT_COOKIE_NAME, DNT_COOKIE_MAX_AGE_SECONDS } from '@/lib/analytics/doNotTrack';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const visitorHash = await hashVisitor(req.headers);

  let anonId: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.anonId === 'string' && body.anonId.length > 0 && body.anonId.length <= 128) {
      anonId = body.anonId;
    }
  } catch {
    /* no body is fine */
  }

  const deleted: Record<string, number> = {};
  if (visitorHash) {
    for (const table of ['site_visits', 'artist_page_visits', 'tier_events'] as const) {
      const { count } = await supabaseAdmin
        .from(table)
        .delete({ count: 'exact' })
        .eq('visitor_hash', visitorHash);
      deleted[table] = count ?? 0;
    }
  }
  if (anonId) {
    const { count } = await supabaseAdmin
      .from('funnel_events')
      .delete({ count: 'exact' })
      .eq('anon_id', anonId);
    deleted.funnel_events = count ?? 0;
  }

  const res = NextResponse.json({ ok: true, hashed: !!visitorHash, deleted });
  res.cookies.set(DNT_COOKIE_NAME, '1', {
    path: '/',
    maxAge: DNT_COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
  });
  return res;
}
