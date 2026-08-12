import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  ALLOW_UNSIGNED_LEGACY_LINKS,
  UNSUBSCRIBE_TOKEN_PARAM,
  fanRecipient,
  signUnsubscribeScope,
  verifyUnsubscribeScope,
  type UnsubscribeScope,
} from '@/lib/emails/unsubscribeToken';

// Cancel an artist email sequence and opt out of that artist's marketing.
//
// GET RENDERS, POST MUTATES, and the POST carries an HMAC bound to this enrollment's fan and
// artist. A mail prefetcher or URL scanner fetching the link no longer cancels the enrollment,
// and a token minted for one artist's link is invalid on another's.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const HTML = { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

interface Resolved {
  scope: UnsubscribeScope;
  fanId: string;
  artistId: string;
  sequenceId: string | null;
}

async function resolve(enrollmentId: string): Promise<Resolved | null> {
  const { data: enrollment } = await supabaseAdmin
    .from('sequence_enrollments')
    .select('fan_id, artist_id, sequence_id')
    .eq('id', enrollmentId)
    .maybeSingle();
  if (!enrollment) return null;

  return {
    fanId: enrollment.fan_id,
    artistId: enrollment.artist_id,
    sequenceId: enrollment.sequence_id || null,
    scope: {
      kind: 'sequence-artist',
      id: enrollmentId,
      artistId: enrollment.artist_id,
      recipient: fanRecipient(enrollment.fan_id),
    },
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ enrollmentId: string }> }) {
  const { enrollmentId } = await params;

  if (!(await checkRateLimit(`ip:${clientIp(req)}`, 'unsubscribe-view', 60, 30))) {
    return new NextResponse(page('Too many requests. Please try again in a minute.', 'error'), { status: 429, headers: HTML });
  }

  const resolved = await resolve(enrollmentId);
  if (!resolved) return new NextResponse(page('Invalid link', 'error'), { headers: HTML });

  const presented = req.nextUrl.searchParams.get(UNSUBSCRIBE_TOKEN_PARAM);
  if (presented && !verifyUnsubscribeScope(resolved.scope, presented)) {
    return new NextResponse(page('This unsubscribe link is not valid.', 'error'), { status: 403, headers: HTML });
  }
  if (!presented && !ALLOW_UNSIGNED_LEGACY_LINKS) {
    return new NextResponse(page('This unsubscribe link is not valid.', 'error'), { status: 403, headers: HTML });
  }

  return new NextResponse(
    page('Stop receiving marketing emails from this artist?', 'confirm', signUnsubscribeScope(resolved.scope)),
    { headers: HTML }
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ enrollmentId: string }> }) {
  const { enrollmentId } = await params;

  if (!(await checkRateLimit(`ip:${clientIp(req)}`, 'unsubscribe-confirm', 60, 15))) {
    return new NextResponse(page('Too many requests. Please try again in a minute.', 'error'), { status: 429, headers: HTML });
  }

  const resolved = await resolve(enrollmentId);
  if (!resolved) return new NextResponse(page('Invalid link', 'error'), { headers: HTML });

  const form = await req.formData().catch(() => null);
  const token =
    (form?.get(UNSUBSCRIBE_TOKEN_PARAM) as string | null) ||
    req.nextUrl.searchParams.get(UNSUBSCRIBE_TOKEN_PARAM);
  if (!verifyUnsubscribeScope(resolved.scope, token)) {
    return new NextResponse(page('This unsubscribe link is not valid.', 'error'), { status: 403, headers: HTML });
  }

  // Cancel the enrollment
  await supabaseAdmin
    .from('sequence_enrollments')
    .update({ status: 'canceled' })
    .eq('id', enrollmentId);

  // Also update fan_communication_prefs
  await supabaseAdmin
    .from('fan_communication_prefs')
    .upsert(
      {
        fan_id: resolved.fanId,
        artist_id: resolved.artistId,
        email_marketing: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fan_id,artist_id' }
    );

  // Log unsubscribe event for attribution
  await supabaseAdmin
    .from('unsubscribe_events')
    .insert({
      fan_id: resolved.fanId,
      artist_id: resolved.artistId,
      source_type: 'sequence',
      source_id: resolved.sequenceId,
      campaign_send_id: null,
      scope: 'artist',
    });

  return new NextResponse(page("You've been unsubscribed from marketing emails.", 'done'), { headers: HTML });
}

function page(message: string, kind: 'confirm' | 'done' | 'error', token?: string): string {
  const confirmForm = kind === 'confirm'
    ? `<form method="post" style="margin:20px 0 0;">
        <input type="hidden" name="${UNSUBSCRIBE_TOKEN_PARAM}" value="${token || ''}">
        <button type="submit" style="background-color:#D4AF37;color:#0D0D0D;border:0;border-radius:999px;padding:14px 28px;font-size:16px;font-weight:600;cursor:pointer;width:100%;">Unsubscribe</button>
      </form>`
    : '';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex"><title>Unsubscribe - CRWN</title></head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;padding:40px 20px;max-width:400px;">
    <h1 style="color:#D4AF37;font-size:32px;margin:0 0 24px;">CRWN</h1>
    <div style="background-color:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #333;">
      <p style="color:${kind === 'error' ? '#ef4444' : '#FFFFFF'};font-size:16px;line-height:1.6;margin:0 0 16px;">${message}</p>
      ${kind === 'done' ? '<p style="color:#A0A0A0;font-size:14px;margin:0;">You will still receive transactional emails (receipts, subscription confirmations).</p>' : ''}
      ${confirmForm}
    </div>
    <p style="color:#666;font-size:12px;margin:24px 0 0;"><a href="https://thecrwn.app" style="color:#D4AF37;text-decoration:none;">Back to CRWN</a></p>
  </div>
</body>
</html>`;
}
