import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// PUBLIC endpoint (no auth): a fan filling in a smart link has no account, so the
// capability stays open. The artist, however, is NEVER taken from the request.
// The body used to carry an `artistId` that was written straight into
// smart_link_captures and fan_contacts, which let anyone inject PII into any
// artist's CRM and forge conversion analytics. The owning artist is now read from
// the smart_links row itself, which is the only party that can be authoritative.

const MAX_NAME = 200;
const MAX_EMAIL = 254;
const MAX_PHONE = 32;

const EMAIL_RE = /^[^\s@,;<>"'\\]{1,64}@[^\s@,;<>"'\\]{1,189}\.[A-Za-z]{2,24}$/;
const PHONE_RE = /^[+]?[0-9 ()\-.]{6,32}$/;

/** Strip control characters and bound the length. */
function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .trim()
    .slice(0, max);
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';

  // Unauthenticated write path, so it needs a limit. A real link can convert a lot of
  // fans from one venue or campus wifi, so the bucket is generous: 30 per hour per IP.
  const allowed = await checkRateLimit(`ip:${ip}`, 'smart-link-capture', 3600, 30);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  }

  let body: { linkId?: string; name?: string; email?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const linkId = typeof body.linkId === 'string' ? body.linkId.trim() : '';
  if (!linkId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const name = cleanText(body.name, MAX_NAME);
  const email = cleanText(body.email, MAX_EMAIL).toLowerCase();
  const phone = cleanText(body.phone, MAX_PHONE);

  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }
  if (phone && !PHONE_RE.test(phone)) {
    return NextResponse.json({ error: 'Enter a valid phone number' }, { status: 400 });
  }

  // Verify link exists and is active. artist_id comes from HERE, never from the body.
  const { data: link } = await supabaseAdmin
    .from('smart_links')
    .select('id, artist_id, capture_count')
    .eq('id', linkId)
    .eq('is_active', true)
    .single();

  if (!link || !link.artist_id) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const artistId = link.artist_id as string;
  const userAgent = req.headers.get('user-agent') || null;

  // Insert capture
  const { error } = await supabaseAdmin
    .from('smart_link_captures')
    .insert({
      smart_link_id: linkId,
      artist_id: artistId,
      name: name || null,
      email: email || null,
      phone: phone || null,
      ip_address: ip === 'unknown' ? null : ip,
      user_agent: userAgent,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Increment capture count. The previous select never asked for capture_count, so
  // this always reset the counter to 1; it is selected above now.
  await supabaseAdmin
    .from('smart_links')
    .update({ capture_count: (link.capture_count || 0) + 1 })
    .eq('id', linkId);

  // Also write to fan_contacts for audience integration (upsert by email)
  if (email) {
    await supabaseAdmin
      .from('fan_contacts')
      .upsert(
        {
          artist_id: artistId,
          email,
          name: name || null,
          phone: phone || null,
          source: 'smart_link',
        },
        { onConflict: 'artist_id,email' }
      );
  }

  return NextResponse.json({ success: true });
}
